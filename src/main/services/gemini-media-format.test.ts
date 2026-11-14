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
})

test('omniFileFromResponse reads the raw REST steps layout and its download URI', () => {
  const rest = {
    status: 'completed',
    steps: [
      { type: 'user_input', content: [{ type: 'text', text: 'walks' }] },
      { type: 'thought', content: [{ type: 'thought', text: 'safety_ratings fine' }] },
      {
        type: 'model_output',
        content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://generativelanguage.googleapis.com/v1beta/files/v1abc:download?alt=media' }]
      }
    ]
  }
  assert.equal(omniFileFromResponse(rest), 'files/v1abc')
})

test('omniFileFromResponse explains a missing video without blaming safety by accident', () => {
  assert.throws(
    () => omniFileFromResponse({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'no' }] }], safety_ratings: [] }),
    /Gemini tidak membuat video/
  )
  assert.throws(() => omniFileFromResponse({ status: 'failed', finish_reason: 'SAFETY' }), /aturan keamanan konten/)
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
  const paid = geminiMediaError(429, '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota, please check your plan and billing details."}}')
  assert.equal(paid.retryable, true)
  assert.notEqual(paid.message, 'Gambar dan video Gemini butuh billing aktif di Google AI Studio.')
  assert.equal(geminiMediaError(503, '').retryable, true)
  assert.match(geminiMediaError(403, '{"error":{"message":"API key not valid"}}').message, /Kunci Gemini/)
})
