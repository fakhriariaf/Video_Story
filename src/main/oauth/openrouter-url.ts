/** OpenRouter's PKCE sign-in page. No client registration exists: the callback URL identifies the app. */
export function openRouterAuthUrl(a: { callbackUrl: string; challenge: string; state: string }): string {
  const params = new URLSearchParams({
    callback_url: a.callbackUrl,
    code_challenge: a.challenge,
    code_challenge_method: 'S256',
    state: a.state
  })
  return `https://openrouter.ai/auth?${params}`
}
