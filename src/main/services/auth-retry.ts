/**
 * An access token can be rejected before its stated expiry (revoked, clock skew). On a 401, refresh once and retry,
 * so the session either recovers or the refresh reports that the user must sign in again.
 */
export async function withAuthRetry(
  call: (token: string) => Promise<Response>,
  token: () => Promise<string>,
  forceRefresh: () => Promise<string>
): Promise<Response> {
  const res = await call(await token())
  if (res.status !== 401) return res
  await res.body?.cancel().catch(() => {})
  return call(await forceRefresh())
}
