import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resumePlan } from './payload'

test('resumePlan treats legacy payload as higgsfield', () => {
  const r = resumePlan({ provider: 'higgsfield', remote_id: 'abc', payload_json: '{"target":"clip-image","model":"m","prompt":"p"}' })
  assert.equal(r?.provider, 'higgsfield')
  assert.equal(r?.payload.target, 'clip-image')
})

test('resumePlan resumes fal and Gemini video jobs that were submitted', () => {
  const fal = resumePlan({
    provider: 'fal',
    remote_id: 'r1',
    payload_json: JSON.stringify({ target: 'clip-video', model: 'fal:x', prompt: 'p', provider: 'fal', resume: { statusUrl: 's', responseUrl: 'r', cancelUrl: 'c' } })
  })
  assert.equal(fal?.provider, 'fal')
  assert.equal(fal?.payload.resume?.statusUrl, 's')
  const gemini = resumePlan({
    provider: 'gemini',
    remote_id: 'files/1',
    payload_json: JSON.stringify({ target: 'clip-video', model: 'gemini:gemini-omni-1.1-flash', prompt: 'p', provider: 'gemini', resume: { file: 'files/1' } })
  })
  assert.equal(gemini?.provider, 'gemini')
})

test('resumePlan gives up on jobs that never reached the provider', () => {
  assert.equal(resumePlan({ provider: 'gemini', remote_id: null, payload_json: '{"target":"clip-image","model":"m","prompt":"p"}' }), null)
  assert.equal(resumePlan({ provider: 'fal', remote_id: 'r', payload_json: '{"target":"clip-image","model":"m","prompt":"p","provider":"fal"}' }), null)
  assert.equal(resumePlan({ provider: 'gemini', remote_id: 'files/1', payload_json: '{"target":"clip-video","model":"m","prompt":"p","provider":"gemini"}' }), null)
  assert.equal(resumePlan({ provider: 'tts', remote_id: 'x', payload_json: '{}' }), null)
  assert.equal(resumePlan({ provider: 'higgsfield', remote_id: 'x', payload_json: 'not json' }), null)
})
