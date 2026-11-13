import { shell } from 'electron'
import { LoginCancelled, startLoopback, type Loopback } from './loopback'
import { openRouterAuthUrl } from './openrouter-url'
import { createPkce, randomToken } from './pkce'

const EXCHANGE_URL = 'https://openrouter.ai/api/v1/auth/keys'

let pending: Loopback | null = null

export function cancelOpenRouterLogin(): void {
  pending?.close()
}

/** Signs in on openrouter.ai and returns an API key tied to the user's account (billed to their credits). */
export async function loginOpenRouter(): Promise<string> {
  pending?.close()
  const lb = await startLoopback()
  pending = lb
  try {
    const pkce = createPkce()
    const state = randomToken()
    await shell.openExternal(openRouterAuthUrl({ callbackUrl: lb.redirectUri, challenge: pkce.challenge, state }))
    const q = await lb.result
    if (q.get('state') !== state) throw new Error('Login OpenRouter gagal: balasan tidak cocok dengan permintaan. Coba lagi.')
    const code = q.get('code')
    if (q.get('error') || !code) throw new Error('Login OpenRouter dibatalkan.')

    let res: Response
    try {
      res = await fetch(EXCHANGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code, code_verifier: pkce.verifier, code_challenge_method: 'S256' })
      })
    } catch (e) {
      throw new Error(`Tidak bisa terhubung ke OpenRouter: ${(e as Error).message}`)
    }
    if (res.status === 403) throw new Error('Kode login OpenRouter tidak valid atau kedaluwarsa. Coba login lagi.')
    if (!res.ok) throw new Error(`OpenRouter menolak login (${res.status}). Coba lagi.`)
    const key = ((await res.json()) as { key?: string }).key
    if (!key) throw new Error('OpenRouter tidak mengirim kunci. Coba login lagi.')
    return key
  } catch (e) {
    if (e instanceof LoginCancelled)
      throw new Error(e.reason === 'timeout' ? 'Login OpenRouter dibatalkan atau kedaluwarsa. Coba lagi.' : 'Login OpenRouter dibatalkan.')
    throw e
  } finally {
    lb.close()
    if (pending === lb) pending = null
  }
}
