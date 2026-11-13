import type { JsonWebKey } from 'node:crypto'
import { shell } from 'electron'
import type { AccountStatus } from '@shared/types'
import { emit } from '../events'
import { verifyIdToken } from './jwt'
import { LoginCancelled, startLoopback, type Loopback } from './loopback'
import { createPkce, randomToken } from './pkce'
import { accountStatus, clearTokens, hostId, markNeedsReauth, readAccount, saveTokens } from './store'
import { classifyRefreshError, needsRefresh, planUsageGranted, singleFlight, stillCurrent, toTokenSet, type TokenResponse } from './tokens'

/*
 * "Sign in with ChatGPT" for open-source apps that run locally: the app registers itself on first sign-in
 * (dynamic_agent_client), so no client secret or partner key ships with it. Docs:
 * https://developers.openai.com/siwc/token-sharing-open-source
 */
const AUTHORIZE_URL = 'https://auth.openai.com/api/accounts/authorize'
const TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token'
const DISCOVERY_URL = 'https://auth.openai.com/.well-known/openid-configuration'
const RESOURCE = 'https://api.openai.com/v1'
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const FIRST_CLIENT = 'dynamic_agent_client'

const EXPIRED = 'Sesi ChatGPT tidak berlaku lagi. Login ulang di Pengaturan › Layanan AI dan kunci.'
const NOT_SIGNED_IN = 'Belum login ChatGPT. Buka Pengaturan › Layanan AI dan kunci untuk login.'

interface Discovery {
  issuer: string
  jwks_uri: string
  revocation_endpoint?: string
}

let discoveryCache: Discovery | null = null
let pending: Loopback | null = null

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Tidak bisa menghubungi server login OpenAI (${res.status}).`)
  return (await res.json()) as T
}

async function discovery(): Promise<Discovery> {
  discoveryCache ??= await getJson<Discovery>(DISCOVERY_URL)
  return discoveryCache
}

/** Only the OAuth error code is kept from a failed token call: the body could echo credentials. */
async function errorCode(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const e = JSON.parse(text)?.error
    return typeof e === 'string' ? e : typeof e?.code === 'string' ? e.code : ''
  } catch {
    return ''
  }
}

function tokenPost(form: Record<string, string>): Promise<Response> {
  return fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(form)
  })
}

function publish(): AccountStatus {
  const status = accountStatus('chatgpt')
  emit.auth(status)
  return status
}

export function cancelChatGptLogin(): void {
  pending?.close()
}

export async function loginChatGpt(): Promise<AccountStatus> {
  // Only one sign-in at a time; a second click replaces the first attempt.
  pending?.close()
  const lb = await startLoopback()
  pending = lb
  try {
    const saved = readAccount('chatgpt')
    const clientId = saved?.clientId ?? null
    const pkce = createPkce()
    const state = randomToken()
    const nonce = randomToken()
    const params = new URLSearchParams({
      client_id: clientId ?? FIRST_CLIENT,
      ext_agent_host_id: hostId(),
      response_type: 'code',
      redirect_uri: lb.redirectUri,
      scope: SCOPE,
      resource: RESOURCE,
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: pkce.challenge
    })
    if (!clientId) params.set('agent_name_hint', 'Video Story')
    else if (saved?.label?.includes('@')) params.set('login_hint', saved.label)
    await shell.openExternal(`${AUTHORIZE_URL}?${params}`)

    const q = await lb.result
    if (q.get('state') !== state) throw new Error('Login ChatGPT gagal: balasan tidak cocok dengan permintaan. Coba lagi.')
    const error = q.get('error')
    if (error) throw new Error(error === 'access_denied' ? 'Login ChatGPT dibatalkan.' : `Login ChatGPT gagal (${error}).`)
    const code = q.get('code')
    // A first sign-in registers this app and returns its own client id; dynamic_agent_client is never stored.
    const issued = q.get('client_id') ?? clientId
    if (!code || !issued || issued === FIRST_CLIENT) throw new Error('Login ChatGPT gagal: data login tidak lengkap. Coba lagi.')

    const res = await tokenPost({
      grant_type: 'authorization_code',
      client_id: issued,
      code,
      code_verifier: pkce.verifier,
      redirect_uri: lb.redirectUri,
      resource: RESOURCE
    })
    if (!res.ok) {
      const why = await errorCode(res)
      throw new Error(`Login ChatGPT gagal saat menukar kode (${res.status}${why ? `, ${why}` : ''}). Coba lagi.`)
    }
    const json = (await res.json()) as TokenResponse
    const tokens = toTokenSet({ ...json, scope: json.scope ?? q.get('scope') ?? undefined }, Date.now())
    if (!tokens.idToken) throw new Error('Login ChatGPT gagal: ID token tidak diterima.')

    const d = await discovery()
    const jwks = await getJson<{ keys: JsonWebKey[] }>(d.jwks_uri)
    const claims = verifyIdToken(tokens.idToken, { jwks, issuer: d.issuer, audience: issued, nonce, now: Date.now() })
    const label = typeof claims.email === 'string' ? claims.email : String(claims.sub ?? 'Akun ChatGPT')
    saveTokens('chatgpt', { clientId: issued, tokens, label, planUsage: planUsageGranted(tokens.scope) })
  } catch (e) {
    if (e instanceof LoginCancelled)
      throw new Error(e.reason === 'timeout' ? 'Login ChatGPT dibatalkan atau kedaluwarsa. Coba lagi.' : 'Login ChatGPT dibatalkan.')
    throw e
  } finally {
    lb.close()
    if (pending === lb) pending = null
  }
  return publish()
}

async function refresh(force = false): Promise<string> {
  // Re-read: a refresh that finished just before this one may already have rotated the tokens.
  const acc = readAccount('chatgpt')
  if (!acc?.tokens || !acc.clientId) throw new Error(acc?.needsReauth ? EXPIRED : NOT_SIGNED_IN)
  if (!force && !needsRefresh(acc.tokens, Date.now())) return acc.tokens.accessToken
  if (!acc.tokens.refreshToken) {
    markNeedsReauth('chatgpt')
    publish()
    throw new Error(EXPIRED)
  }
  const used = acc.tokens.refreshToken
  let res: Response
  try {
    res = await tokenPost({ grant_type: 'refresh_token', client_id: acc.clientId, refresh_token: used, resource: RESOURCE })
  } catch {
    throw new Error('Tidak bisa memperbarui sesi ChatGPT karena koneksi bermasalah. Coba lagi.')
  }
  // The user may have signed out or in while this was on the wire: never overwrite or wipe that newer state.
  const latest = readAccount('chatgpt')
  if (!stillCurrent(used, latest)) {
    if (latest?.tokens && !latest.needsReauth) return latest.tokens.accessToken
    throw new Error(latest?.needsReauth ? EXPIRED : NOT_SIGNED_IN)
  }
  if (!res.ok) {
    if (classifyRefreshError(res.status, await errorCode(res)) === 'terminal') {
      markNeedsReauth('chatgpt')
      publish()
      throw new Error(EXPIRED)
    }
    throw new Error(`Tidak bisa memperbarui sesi ChatGPT (${res.status}). Coba lagi sebentar lagi.`)
  }
  const tokens = toTokenSet((await res.json()) as TokenResponse, Date.now(), acc.tokens)
  saveTokens('chatgpt', { clientId: acc.clientId, tokens, label: acc.label, planUsage: planUsageGranted(tokens.scope) })
  return tokens.accessToken
}

/** A valid access token for the plan route, refreshed first when it is about to expire. */
export async function chatgptAccessToken(): Promise<string> {
  const acc = readAccount('chatgpt')
  if (!acc?.tokens || acc.needsReauth) throw new Error(acc?.needsReauth ? EXPIRED : NOT_SIGNED_IN)
  if (!needsRefresh(acc.tokens, Date.now())) return acc.tokens.accessToken
  return singleFlight('chatgpt', () => refresh())
}

/** Refreshes even though the token has not reached its stated expiry, after the API rejected it. */
export function forceRefreshChatGpt(): Promise<string> {
  return singleFlight('chatgpt', () => refresh(true))
}

export async function logoutChatGpt(): Promise<{ revoked: boolean }> {
  const acc = readAccount('chatgpt')
  let revoked = !acc?.tokens?.refreshToken
  if (acc?.tokens?.refreshToken && acc.clientId) {
    const form = { token: acc.tokens.refreshToken, token_type_hint: 'refresh_token', client_id: acc.clientId }
    for (let attempt = 0; attempt < 2 && !revoked; attempt++) {
      try {
        const endpoint = (await discovery()).revocation_endpoint
        if (!endpoint) break
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(form)
        })
        if (res.ok) revoked = true
        else if (res.status < 500) break
      } catch {
        // Network trouble: try once more, then sign out locally anyway.
      }
    }
  }
  clearTokens('chatgpt')
  publish()
  return { revoked }
}
