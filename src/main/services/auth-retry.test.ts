import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withAuthRetry } from './auth-retry'

test('withAuthRetry refreshes once and retries after a 401', async () => {
  const seen: string[] = []
  let refreshes = 0
  const res = await withAuthRetry(
    async (token) => {
      seen.push(token)
      return new Response(null, { status: token === 'old' ? 401 : 200 })
    },
    async () => 'old',
    async () => {
      refreshes++
      return 'new'
    }
  )
  assert.equal(res.status, 200)
  assert.deepEqual(seen, ['old', 'new'])
  assert.equal(refreshes, 1)
})

test('withAuthRetry does not loop when the retry is also rejected', async () => {
  let calls = 0
  const res = await withAuthRetry(
    async () => {
      calls++
      return new Response(null, { status: 401 })
    },
    async () => 't',
    async () => 't2'
  )
  assert.equal(res.status, 401)
  assert.equal(calls, 2)
})

test('withAuthRetry leaves other statuses alone', async () => {
  let refreshes = 0
  const res = await withAuthRetry(async () => new Response(null, { status: 429 }), async () => 't', async () => {
    refreshes++
    return 't2'
  })
  assert.equal(res.status, 429)
  assert.equal(refreshes, 0)
})
