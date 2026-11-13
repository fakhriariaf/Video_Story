import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { test } from 'node:test'
import { decodeJwt, verifyIdToken } from './jwt'

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url')

function makeToken(payload: object): string {
  const head = `${b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${b64(payload)}`
  return `${head}.${sign('RSA-SHA256', Buffer.from(head), privateKey).toString('base64url')}`
}

const claims = { iss: 'https://auth.openai.com', aud: 'oaiapp_x', nonce: 'n', exp: 2_000_000_000, sub: 'u1', email: 'a@b.c' }
const tok = makeToken(claims)
const opts = { jwks: { keys: [jwk] }, issuer: 'https://auth.openai.com', audience: 'oaiapp_x', nonce: 'n', now: 1_900_000_000_000 }

test('decodeJwt reads header and payload', () => {
  const d = decodeJwt(tok)
  assert.equal(d.header.kid, 'k1')
  assert.equal(d.payload.sub, 'u1')
})

test('verifyIdToken accepts a valid token', () => {
  assert.equal(verifyIdToken(tok, opts).sub, 'u1')
})

test('verifyIdToken accepts audience given as an array', () => {
  assert.equal(verifyIdToken(makeToken({ ...claims, aud: ['other', 'oaiapp_x'] }), opts).sub, 'u1')
})

test('verifyIdToken rejects wrong nonce', () => {
  assert.throws(() => verifyIdToken(tok, { ...opts, nonce: 'x' }), /nonce/)
})

test('verifyIdToken rejects wrong audience', () => {
  assert.throws(() => verifyIdToken(tok, { ...opts, audience: 'other' }), /aud/)
})

test('verifyIdToken rejects wrong issuer', () => {
  assert.throws(() => verifyIdToken(tok, { ...opts, issuer: 'https://evil.example' }), /iss/)
})

test('verifyIdToken rejects tampered payload', () => {
  const [h, , s] = tok.split('.')
  const tampered = `${h}.${b64({ ...claims, sub: 'attacker' })}.${s}`
  assert.throws(() => verifyIdToken(tampered, opts), /signature/)
})

test('verifyIdToken rejects expired token', () => {
  assert.throws(() => verifyIdToken(tok, { ...opts, now: 2_100_000_000_000 }), /exp/)
})

test('verifyIdToken rejects unknown key id', () => {
  assert.throws(() => verifyIdToken(tok, { ...opts, jwks: { keys: [{ ...jwk, kid: 'other' }] } }), /key/)
})
