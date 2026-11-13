import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildResponsesBody, ChatGptError, chatGptErrorFromHttp, isFormatRejected, isRetryable, readResponsesStream } from './chatgpt-format'

async function* events(list: [string, string][]): AsyncGenerator<{ event: string | null; data: string }> {
  for (const [event, data] of list) yield { event, data }
}

test('body always disables storage and streams', () => {
  const b = buildResponsesBody({ model: 'm', system: 'S', prompt: 'P', schema: {}, name: 'n', mode: 'plain' })
  assert.equal(b.store, false)
  assert.equal(b.stream, true)
  assert.ok(!('temperature' in b) && !('max_output_tokens' in b))
  assert.match(String(b.instructions), /^S\n\nReply with ONE JSON object only/)
  assert.deepEqual(b.input, [{ role: 'user', content: [{ type: 'input_text', text: 'P' }] }])
})

test('json_schema mode sets strict text.format', () => {
  const b = buildResponsesBody({ model: 'm', system: 'S', prompt: 'P', schema: { type: 'object' }, name: 'story', mode: 'json_schema' })
  assert.deepEqual(b.text, { format: { type: 'json_schema', name: 'story', schema: { type: 'object' }, strict: true } })
  assert.equal(b.instructions, 'S')
})

test('readResponsesStream joins deltas on completed', async () => {
  const text = await readResponsesStream(
    events([
      ['response.output_text.delta', '{"delta":"{\\"a\\""}'],
      ['response.output_text.delta', '{"delta":":1}"}'],
      ['response.completed', '{}']
    ])
  )
  assert.equal(text, '{"a":1}')
})

test('readResponsesStream prefers the full output text in response.completed', async () => {
  const done = JSON.stringify({ response: { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"b":2}' }] }] } })
  assert.equal(await readResponsesStream(events([['response.output_text.delta', '{"delta":"{"}'], ['response.completed', done]])), '{"b":2}')
})

test('readResponsesStream reports usage limit from response.failed', async () => {
  await assert.rejects(
    readResponsesStream(events([['response.failed', '{"response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}']])),
    (e) => e instanceof ChatGptError && /Batas pemakaian paket ChatGPT/.test(e.message)
  )
})

test('readResponsesStream reports an error event', async () => {
  await assert.rejects(
    readResponsesStream(events([['error', '{"code":"subscription_sharing_usage_unavailable","message":"x"}']])),
    (e) => e instanceof ChatGptError && e.code === 'subscription_sharing_usage_unavailable' && isRetryable(e)
  )
})

test('readResponsesStream reports interrupted stream', async () => {
  await assert.rejects(readResponsesStream(events([['response.output_text.delta', '{"delta":"{"}']])), (e) => e instanceof ChatGptError && e.code === 'interrupted')
})

test('readResponsesStream reports incomplete', async () => {
  await assert.rejects(readResponsesStream(events([['response.incomplete', '{}']])), (e) => e instanceof ChatGptError && e.code === 'incomplete')
})

test('format rejection detection', () => {
  assert.equal(isFormatRejected(chatGptErrorFromHttp(400, '{"error":{"code":"subscription_sharing_unsupported_capability","param":"text.format"}}')), true)
  assert.equal(isFormatRejected(chatGptErrorFromHttp(429, '{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}')), false)
})

test('http errors map to Indonesian messages', () => {
  assert.match(chatGptErrorFromHttp(401, '').message, /Login ulang/)
  assert.match(chatGptErrorFromHttp(403, '{"error":{"code":"subscription_sharing_user_not_eligible"}}').message, /tidak tersedia untuk akun/)
  const unavailable = chatGptErrorFromHttp(503, 'down')
  assert.equal(isRetryable(unavailable), true)
  assert.match(unavailable.message, /sedang tidak tersedia/)
})
