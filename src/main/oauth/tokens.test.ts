import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyRefreshError, needsRefresh, planUsageGranted, singleFlight, toTokenSet } from './tokens'

test('toTokenSet computes expiry and splits scope', () => {
  const t = toTokenSet({ access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'openid chatgpt.tokens.use.direct' }, 1000)
  assert.equal(t.expiresAt, 1000 + 3_600_000)
  assert.deepEqual(t.scope, ['openid', 'chatgpt.tokens.use.direct'])
})

test('toTokenSet keeps previous refresh token when rotation omits it', () => {
  const prev = toTokenSet({ access_token: 'a', refresh_token: 'r1', id_token: 'i1' }, 0)
  const next = toTokenSet({ access_token: 'b' }, 10, prev)
  assert.equal(next.refreshToken, 'r1')
  assert.equal(next.idToken, 'i1')
})

test('needsRefresh within five minutes of expiry', () => {
  const t = toTokenSet({ access_token: 'a', expires_in: 3600 }, 0)
  assert.equal(needsRefresh(t, 3_600_000 - 6 * 60_000), false)
  assert.equal(needsRefresh(t, 3_600_000 - 4 * 60_000), true)
})

test('classifyRefreshError', () => {
  assert.equal(classifyRefreshError(400, '{"error":"invalid_grant"}'), 'terminal')
  assert.equal(classifyRefreshError(401, '{"error":"refresh_token_reused"}'), 'terminal')
  assert.equal(classifyRefreshError(0, ''), 'retry')
  assert.equal(classifyRefreshError(503, 'upstream'), 'retry')
})

test('planUsageGranted', () => {
  assert.equal(planUsageGranted(['openid', 'chatgpt.tokens.use.direct']), true)
  assert.equal(planUsageGranted(['openid', 'email']), false)
})

test('singleFlight runs once for concurrent callers', async () => {
  let calls = 0
  const fn = async (): Promise<number> => {
    calls++
    await new Promise((r) => setTimeout(r, 20))
    return calls
  }
  const [a, b] = await Promise.all([singleFlight('k', fn), singleFlight('k', fn)])
  assert.equal(calls, 1)
  assert.equal(a, b)
  await singleFlight('k', fn)
  assert.equal(calls, 2)
})

test('singleFlight releases the key after a failure', async () => {
  await assert.rejects(singleFlight('f', async () => Promise.reject(new Error('boom'))), /boom/)
  assert.equal(await singleFlight('f', async () => 'ok'), 'ok')
})
