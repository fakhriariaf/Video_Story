import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileState, geminiMediaError, imageFromResponse, omniFileFromResponse } from './gemini-media-format'

test('imageFromResponse returns the first inline image', () => {
  const r = imageFromResponse({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: 'QQ' } }] } }] })
  assert.deepEqual(r, { mimeType: 'image/png', data: 'QQ' })
})

test('imageFromResponse explains a safety block', () => {
  assert.throws(() => imageFromResponse({ promptFeedback: { blockReason: 'SAFETY' } }), /aturan keamanan konten/)
  assert.throws(() => imageFromResponse({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }), /aturan keamanan konten/)
})

test('imageFromResponse explains a text-only answer', () => {
  assert.throws(() => imageFromResponse({ candidates: [{ content: { parts: [{ text: 'no' }] } }] }), /tidak mengembalikan gambar/)
})

test('omniFileFromResponse reads the generated file name', () => {
  assert.equal(omniFileFromResponse({ output_video: { uri: 'files/abc-123' } }), 'files/abc-123')
  assert.equal(omniFileFromResponse({ interaction: { output_video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/xyz' } } }), 'files/xyz')
  assert.throws(() => omniFileFromResponse({ output_text: 'I cannot make that video.' }), /Gemini tidak membuat video/)
})

test('fileState reads pending, active and failed files', () => {
  assert.equal(fileState({ state: 'PROCESSING' }), 'pending')
  assert.equal(fileState({ state: 'ACTIVE' }), 'active')
  assert.throws(() => fileState({ state: 'FAILED', error: { message: 'boom' } }), /Gemini gagal membuat video: boom/)
})

test('geminiMediaError asks for billing when the free tier has no quota', () => {
  const body = '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 0"}}'
  assert.equal(geminiMediaError(429, body).message, 'Gambar dan video Gemini butuh billing aktif di Google AI Studio.')
  assert.equal(geminiMediaError(429, '{"error":{"message":"Resource exhausted"}}').retryable, true)
  assert.equal(geminiMediaError(503, '').retryable, true)
  assert.match(geminiMediaError(403, '{"error":{"message":"API key not valid"}}').message, /Kunci Gemini/)
})
