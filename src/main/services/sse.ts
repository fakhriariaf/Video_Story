export interface SseEvent {
  event: string | null
  data: string
}

/** Server-Sent Events from a fetch body. Events may be split anywhere across network chunks. */
export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let buffer = ''
  let event: string | null = null
  let data: string[] = []

  function* lines(final: boolean): Generator<SseEvent> {
    let nl: number
    while ((nl = buffer.search(/\r\n|\r|\n/)) >= 0) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(buffer[nl] === '\r' && buffer[nl + 1] === '\n' ? nl + 2 : nl + 1)
      if (line === '') {
        if (data.length) yield { event, data: data.join('\n') }
        event = null
        data = []
        continue
      }
      if (line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (final) {
      if (buffer) data.push(buffer.replace(/^data: ?/, ''))
      buffer = ''
      if (data.length) yield { event, data: data.join('\n') }
    }
  }

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // A lone "\r" at the end may be the first half of "\r\n"; wait for the next chunk.
      if (buffer.endsWith('\r')) continue
      yield* lines(false)
    }
    buffer += decoder.decode()
    yield* lines(true)
  } finally {
    reader.releaseLock()
  }
}
