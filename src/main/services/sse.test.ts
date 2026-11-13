import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSse } from './sse'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    }
  })
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const x of it) out.push(x)
  return out
}

test('parseSse handles split chunks, multi-line data and comments', async () => {
  const out = await collect(parseSse(streamOf(['event: a\nda', 'ta: 1\ndata: 2\n\n: ping\n\nevent: b\r\ndata: x\r\n\r\n'])))
  assert.deepEqual(out, [
    { event: 'a', data: '1\n2' },
    { event: 'b', data: 'x' }
  ])
})

test('parseSse yields a final event without a trailing blank line', async () => {
  const out = await collect(parseSse(streamOf(['data: last'])))
  assert.deepEqual(out, [{ event: null, data: 'last' }])
})

test('parseSse keeps multi-byte characters split across chunks', async () => {
  const bytes = new TextEncoder().encode('data: héllo\n\n')
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes.slice(0, 8))
      c.enqueue(bytes.slice(8))
      c.close()
    }
  })
  assert.deepEqual(await collect(parseSse(stream)), [{ event: null, data: 'héllo' }])
})
