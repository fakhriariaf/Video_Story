import type { SseEvent } from './sse'

/**
 * Pure pieces of the ChatGPT plan route (Responses API, store:false + stream:true), kept apart from the network code
 * so they can be unit tested.
 */

export type ResponsesMode = 'json_schema' | 'plain'

/** Same wording as chatJson in llm.ts, so every provider gets the identical fallback prompt. */
const PLAIN_JSON_HINT = '\n\nReply with ONE JSON object only (no markdown, no commentary) that matches this JSON Schema:\n'

export function buildResponsesBody(a: {
  model: string
  system: string
  prompt: string
  schema: object
  name: string
  mode: ResponsesMode
}): Record<string, unknown> {
  // The plan route rejects system message items, temperature and token caps; instructions carry the system prompt.
  const body: Record<string, unknown> = {
    model: a.model,
    store: false,
    stream: true,
    instructions: a.mode === 'plain' ? `${a.system}${PLAIN_JSON_HINT}${JSON.stringify(a.schema)}` : a.system,
    input: [{ role: 'user', content: [{ type: 'input_text', text: a.prompt }] }]
  }
  if (a.mode === 'json_schema') body.text = { format: { type: 'json_schema', name: a.name, schema: a.schema, strict: true } }
  return body
}

export function chatGptMessage(code: string, status: number, param?: string | null): string {
  switch (code) {
    case 'subscription_sharing_usage_limit_exceeded':
      return 'Batas pemakaian paket ChatGPT sudah tercapai. Cek pemakaianmu di chatgpt.com/settings/usage, atau pilih penyusun cerita lain di Pengaturan.'
    case 'subscription_sharing_user_not_eligible':
      return 'Pemakaian paket ChatGPT tidak tersedia untuk akun atau workspace ini.'
    case 'subscription_sharing_invalid_user':
      return 'Sesi ChatGPT tidak berlaku lagi. Login ulang di Pengaturan › Layanan AI dan kunci.'
    case 'subscription_sharing_usage_unavailable':
    case 'subscription_sharing_user_unavailable':
      return 'Layanan paket ChatGPT sedang tidak tersedia. Coba lagi sebentar lagi.'
    case 'subscription_sharing_unsupported_capability':
      return `Permintaan memakai fitur yang tidak didukung paket ChatGPT${param ? ` (${param})` : ''}.`
    case 'incomplete':
      return 'Jawaban ChatGPT terpotong sebelum selesai. Coba durasi video lebih pendek atau model lain.'
    case 'interrupted':
      return 'Koneksi ke ChatGPT terputus sebelum jawaban selesai. Coba lagi.'
  }
  if (status === 401) return 'Sesi ChatGPT tidak berlaku lagi. Login ulang di Pengaturan › Layanan AI dan kunci.'
  if (status === 503) return 'Layanan paket ChatGPT sedang tidak tersedia. Coba lagi sebentar lagi.'
  return `ChatGPT menolak permintaan (${status}${code ? `, ${code}` : ''}).`
}

export class ChatGptError extends Error {
  readonly status: number
  readonly code: string
  readonly param: string | null

  constructor(status: number, code: string, param: string | null = null) {
    super(chatGptMessage(code, status, param))
    this.status = status
    this.code = code
    this.param = param
  }
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function fromErrorObject(status: number, err: any): ChatGptError {
  return new ChatGptError(status, typeof err?.code === 'string' ? err.code : '', typeof err?.param === 'string' ? err.param : null)
}

export function chatGptErrorFromHttp(status: number, body: string): ChatGptError {
  return fromErrorObject(status, parseJson(body)?.error)
}

export function isRetryable(e: ChatGptError): boolean {
  return e.status === 503 || e.code.endsWith('_unavailable')
}

export function isFormatRejected(e: ChatGptError): boolean {
  if (e.code === 'subscription_sharing_unsupported_capability') return true
  return e.status === 400 && /text|format|schema/i.test(`${e.code} ${e.param ?? ''}`)
}

/** The text of every output_text part in a finished response, or null when the payload carries none. */
function completedText(payload: any): string | null {
  const output = payload?.response?.output
  if (!Array.isArray(output)) return null
  const parts = output.flatMap((item: any) => (Array.isArray(item?.content) ? item.content : [])).filter((c: any) => c?.type === 'output_text')
  return parts.length ? parts.map((c: any) => String(c.text ?? '')).join('') : null
}

/** Reads a Responses stream to its final text. Only response.completed counts as success. */
export async function readResponsesStream(events: AsyncIterable<SseEvent>): Promise<string> {
  let text = ''
  try {
    for await (const e of events) {
      const payload = parseJson(e.data)
      const type = e.event ?? payload?.type
      if (type === 'response.output_text.delta') text += String(payload?.delta ?? '')
      else if (type === 'response.completed') return completedText(payload) ?? text
      else if (type === 'response.incomplete') throw new ChatGptError(0, 'incomplete')
      else if (type === 'response.failed') throw fromErrorObject(0, payload?.response?.error)
      else if (type === 'error') throw fromErrorObject(0, payload?.error ?? payload)
    }
  } catch (e) {
    // A dropped connection surfaces as a bare "terminated"/ECONNRESET from the body reader; cancels and timeouts
    // keep their own meaning for the caller.
    if (e instanceof ChatGptError) throw e
    const name = (e as Error)?.name
    if (name === 'AbortError' || name === 'TimeoutError') throw e
    throw new ChatGptError(0, 'interrupted')
  }
  throw new ChatGptError(0, 'interrupted')
}
