import assert from 'node:assert/strict'
import { test } from 'node:test'
import { challengeFor, createPkce, randomToken } from './pkce'

test('challengeFor matches RFC 7636 appendix B', () => {
  assert.equal(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
})

test('createPkce verifier is 43+ base64url chars and challenge derives from it', () => {
  const p = createPkce()
  assert.match(p.verifier, /^[A-Za-z0-9_-]{43,128}$/)
  assert.equal(p.challenge, challengeFor(p.verifier))
})

test('randomToken has no padding and differs per call', () => {
  assert.doesNotMatch(randomToken(), /=/)
  assert.notEqual(randomToken(), randomToken())
})
