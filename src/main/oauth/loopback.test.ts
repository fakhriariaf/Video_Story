import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LoginCancelled, startLoopback } from './loopback'

test('redirectUri uses 127.0.0.1 and /auth/callback', async () => {
  const lb = await startLoopback()
  assert.match(lb.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/)
  lb.close()
  await assert.rejects(lb.result, LoginCancelled)
})

test('callback resolves params and shows success page', async () => {
  const lb = await startLoopback()
  const res = await fetch(`${lb.redirectUri}?code=abc&state=xyz`)
  assert.match(await res.text(), /Login berhasil/)
  const q = await lb.result
  assert.equal(q.get('code'), 'abc')
  assert.equal(q.get('state'), 'xyz')
})

test('error callback shows failure page and still resolves', async () => {
  const lb = await startLoopback()
  const res = await fetch(`${lb.redirectUri}?error=access_denied&state=s`)
  assert.match(await res.text(), /Login gagal/)
  assert.equal((await lb.result).get('error'), 'access_denied')
})

test('loopback times out', async () => {
  const lb = await startLoopback({ timeoutMs: 50 })
  await assert.rejects(lb.result, (e) => e instanceof LoginCancelled && e.reason === 'timeout')
})

test('other paths return 404', async () => {
  const lb = await startLoopback()
  assert.equal((await fetch(lb.redirectUri.replace('/auth/callback', '/x'))).status, 404)
  lb.close()
  await lb.result.catch(() => {})
})
