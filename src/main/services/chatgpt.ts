import type { ModelOption } from '@shared/types'
import { chatgptAccessToken, forceRefreshChatGpt } from '../oauth/chatgpt'
import { readAccount } from '../oauth/store'
import { withAuthRetry } from './auth-retry'
import { sleep } from './http'
import { buildResponsesBody, ChatGptError, chatGptErrorFromHttp, isFormatRejected, isRetryable, readResponsesStream, type ResponsesMode } from './chatgpt-format'
import { extractJson } from './json'
import { parseSse } from './sse'

const API = 'https://api.openai.com/v1'
const GENERATE_TIMEOUT_MS = 4 * 60 * 1000
const RETRY_DELAYS_MS = [2000, 4000]

async function authorized(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await withAuthRetry(
      (token) => fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }),
      chatgptAccessToken,
      forceRefreshChatGpt
    )
  } catch (e) {
    // fetch reports network failures as TypeError; sign-in errors from the token refresh already read well.
    if (e instanceof TypeError) throw new Error(`Tidak bisa terhubung ke ChatGPT: ${e.message}`)
    throw e
  }
  if (!res.ok) throw chatGptErrorFromHttp(res.status, await res.text().catch(() => ''))
  return res
}

/** Models the signed-in account may use; the plan decides which ones, so the list comes from the account. */
export async function listModels(): Promise<ModelOption[]> {
  const r = (await (await authorized('/models', { headers: { Accept: 'application/json' } })).json()) as {
    models?: { slug: string; display_name?: string; visibility?: string; description?: string }[]
  }
  return (r.models ?? [])
    .filter((m) => m.visibility === 'list')
    .map((m) => ({ id: m.slug, name: m.display_name ?? m.slug, description: m.description, tags: [] }))
}

async function once(model: string, system: string, prompt: string, schema: object, name: string, mode: ResponsesMode, signal: AbortSignal): Promise<string> {
  const res = await authorized('/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(buildResponsesBody({ model, system, prompt, schema, name, mode })),
    signal
  })
  if (!res.body) throw new ChatGptError(0, 'interrupted')
  return readResponsesStream(parseSse(res.body))
}

/** Structured generation on the user's ChatGPT plan, with the same schema-first, prompt-only fallback as chatJson. */
export async function generateJson(model: string, system: string, prompt: string, schema: object, name: string, signal?: AbortSignal): Promise<unknown> {
  if (readAccount('chatgpt')?.planUsage === false)
    throw new Error('Akun ChatGPT belum mengizinkan pemakaian paket. Login ulang dan setujui izin pemakaian paket.')
  const timeout = AbortSignal.timeout(GENERATE_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const modes: ResponsesMode[] = ['json_schema', 'plain']
  let lastError: unknown = null
  for (const mode of modes) {
    for (let attempt = 0; ; attempt++) {
      try {
        const text = await once(model, system, prompt, schema, name, mode, combined)
        try {
          return extractJson(text)
        } catch {
          lastError = new Error(`Model "${model}" tidak menghasilkan JSON yang valid. Coba pilih model lain di Pengaturan.`)
          break
        }
      } catch (e) {
        if (signal?.aborted) throw e
        if ((e as Error).name === 'TimeoutError') throw new Error('ChatGPT terlalu lama merespons. Coba lagi atau pilih model yang lebih cepat.')
        if (e instanceof ChatGptError && isRetryable(e) && attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt])
          continue
        }
        if (e instanceof ChatGptError && mode === 'json_schema' && isFormatRejected(e)) {
          lastError = e
          break
        }
        throw e
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Model "${model}" tidak menghasilkan JSON yang valid.`)
}
