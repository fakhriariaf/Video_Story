import { randomUUID } from 'node:crypto'
import { safeStorage } from 'electron'
import type { AccountStatus, AuthProvider } from '@shared/types'
import { getDb } from '../db'
import type { TokenSet } from './tokens'

interface Row {
  provider: AuthProvider
  client_id: string | null
  tokens: Buffer | null
  label: string | null
  needs_reauth: number
  plan_usage: number | null
}

export interface StoredAccount {
  clientId: string | null
  tokens: TokenSet | null
  label: string | null
  needsReauth: boolean
  planUsage: boolean | null
}

const HOST_ID_KEY = 'oauthHostId'

/**
 * Stable per-installation id that ChatGPT asks for (ext_agent_host_id). It names this computer to OpenAI without
 * identifying the user, so it is a random UUID. Kept in the settings table outside AppSettings on purpose:
 * getSettings ignores unknown keys, and the renderer never needs it.
 */
export function hostId(): string {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(HOST_ID_KEY) as { value: string } | undefined
  if (row) return JSON.parse(row.value) as string
  const id = `urn:uuid:${randomUUID()}`
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(HOST_ID_KEY, JSON.stringify(id))
  return id
}

function encrypt(tokens: TokenSet): Buffer {
  const json = JSON.stringify(tokens)
  return safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8')
}

/** Tokens that can no longer be decrypted are treated as missing: the user simply signs in again. */
function decrypt(value: Buffer | null): TokenSet | null {
  if (!value || value.length === 0) return null
  try {
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(value) : value.toString('utf8')
    return JSON.parse(json) as TokenSet
  } catch {
    return null
  }
}

function row(provider: AuthProvider): Row | undefined {
  return getDb().prepare('SELECT * FROM oauth_accounts WHERE provider = ?').get(provider) as Row | undefined
}

export function readAccount(provider: AuthProvider): StoredAccount | null {
  const r = row(provider)
  if (!r) return null
  return {
    clientId: r.client_id,
    tokens: decrypt(r.tokens),
    label: r.label,
    needsReauth: r.needs_reauth === 1,
    planUsage: r.plan_usage == null ? null : r.plan_usage === 1
  }
}

export function saveTokens(provider: AuthProvider, a: { clientId: string; tokens: TokenSet; label: string | null; planUsage: boolean | null }): void {
  getDb()
    .prepare(
      `INSERT INTO oauth_accounts (provider, client_id, tokens, label, needs_reauth, plan_usage, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET client_id = excluded.client_id, tokens = excluded.tokens, label = excluded.label,
         needs_reauth = 0, plan_usage = excluded.plan_usage, updated_at = excluded.updated_at`
    )
    .run(provider, a.clientId, encrypt(a.tokens), a.label, a.planUsage == null ? null : a.planUsage ? 1 : 0, Date.now())
}

/** The grant is gone for good (revoked, expired refresh token): drop the tokens, keep the client for the next sign-in. */
export function markNeedsReauth(provider: AuthProvider): void {
  getDb().prepare('UPDATE oauth_accounts SET tokens = NULL, needs_reauth = 1, updated_at = ? WHERE provider = ?').run(Date.now(), provider)
}

/** Sign-out. The client id and label stay so signing in again reuses the same registration. */
export function clearTokens(provider: AuthProvider): void {
  getDb().prepare('UPDATE oauth_accounts SET tokens = NULL, needs_reauth = 0, updated_at = ? WHERE provider = ?').run(Date.now(), provider)
}

export function accountStatus(provider: AuthProvider): AccountStatus {
  const a = readAccount(provider)
  const signedIn = !!a?.tokens && !a.needsReauth
  return {
    provider,
    signedIn,
    label: signedIn ? (a?.label ?? null) : null,
    needsReauth: !!a?.needsReauth,
    planUsageAllowed: a?.planUsage ?? null
  }
}
