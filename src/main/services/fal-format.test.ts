import assert from 'node:assert/strict'
import { test } from 'node:test'
import { falError, falUsd } from './fal-format'

test('falError explains a bad key', () => {
  assert.match(falError(401, '{"detail":"Unauthorized"}').message, /Kunci fal\.ai tidak valid/)
})

test('falError explains an empty balance', () => {
  assert.match(falError(403, '{"detail":"User is locked. Reason: Exhausted balance."}').message, /Saldo fal\.ai habis/)
  assert.match(falError(402, '').message, /Saldo fal\.ai habis/)
})

test('falError marks rate limits and server errors retryable', () => {
  assert.equal(falError(429, '').retryable, true)
  assert.equal(falError(503, '').retryable, true)
  const bad = falError(422, '{"detail":[{"msg":"bad prompt"}]}')
  assert.equal(bad.retryable, false)
  assert.match(bad.message, /fal\.ai menolak isian: bad prompt/)
})

test('falUsd prices per image, per second and per video', () => {
  assert.equal(falUsd({ unit_price: 0.04, unit: 'image' }, 'image', 0), 0.04)
  assert.equal(falUsd({ unit_price: 0.1, unit: 'seconds' }, 'video', 5), 0.5)
  assert.equal(falUsd({ unit_price: 0.3, unit: 'video' }, 'video', 5), 0.3)
  assert.equal(falUsd({ unit_price: 0.02, unit: 'megapixel' }, 'image', 0), null)
  assert.equal(falUsd(null, 'image', 0), null)
})
