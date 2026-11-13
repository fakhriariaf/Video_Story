import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openRouterAuthUrl } from './openrouter-url'

test('openRouterAuthUrl carries callback, S256 challenge and state', () => {
  const u = new URL(openRouterAuthUrl({ callbackUrl: 'http://127.0.0.1:5000/auth/callback', challenge: 'ch', state: 'st' }))
  assert.equal(u.origin + u.pathname, 'https://openrouter.ai/auth')
  assert.equal(u.searchParams.get('callback_url'), 'http://127.0.0.1:5000/auth/callback')
  assert.equal(u.searchParams.get('code_challenge'), 'ch')
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(u.searchParams.get('state'), 'st')
})
