/** One provider's OAuth credentials as the app keeps them. */
export interface TokenSet {
  accessToken: string
  refreshToken: string | null
  idToken: string | null
  /** Epoch ms when the access token stops working. */
  expiresAt: number
  scope: string[]
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  scope?: string
}

const DEFAULT_LIFETIME_S = 3600
const REFRESH_MARGIN_MS = 5 * 60 * 1000

/** Refresh responses may omit tokens that did not change; keep the previous ones then. */
export function toTokenSet(json: TokenResponse, now: number, previous?: TokenSet): TokenSet {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? previous?.refreshToken ?? null,
    idToken: json.id_token ?? previous?.idToken ?? null,
    expiresAt: now + (json.expires_in ?? DEFAULT_LIFETIME_S) * 1000,
    scope: json.scope ? json.scope.split(/\s+/).filter(Boolean) : (previous?.scope ?? [])
  }
}

export function needsRefresh(t: TokenSet, now: number): boolean {
  return t.expiresAt - now < REFRESH_MARGIN_MS
}

const TERMINAL = /invalid_grant|invalid_refresh_token|token_expired|refresh_token_expired|refresh_token_invalidated|refresh_token_reused/

/**
 * A terminal refresh error means the grant is gone and the user must sign in again. Anything else (offline, timeouts,
 * 5xx) is temporary: the stored tokens stay so a later attempt can still succeed.
 */
export function classifyRefreshError(status: number, body: string): 'terminal' | 'retry' {
  return status !== 0 && TERMINAL.test(body) ? 'terminal' : 'retry'
}

/** ChatGPT only bills requests to the user's plan when this scope was granted. */
export function planUsageGranted(scope: string[]): boolean {
  return scope.includes('chatgpt.tokens.use.direct')
}

const inFlight = new Map<string, Promise<unknown>>()

/**
 * Refresh tokens rotate: two refreshes racing with the same token would invalidate each other. Concurrent callers
 * with the same key share one run.
 */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key)
  if (running) return running as Promise<T>
  const p = fn().finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

/**
 * A refresh may still be on the wire when the user signs out or signs in again. Its result only applies while the
 * refresh token it used is the one still stored; otherwise it would bring back or overwrite a session the user changed.
 */
export function stillCurrent(used: string, current: { tokens: TokenSet | null } | null): boolean {
  return !!current?.tokens && current.tokens.refreshToken === used
}
