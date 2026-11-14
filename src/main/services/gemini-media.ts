import { requireSecret } from '../secrets'
import { fileState, geminiMediaError, imageFromResponse, omniFileFromResponse } from './gemini-media-format'
import { ApiError, sleep } from './http'

/**
 * Gemini image (Nano Banana, generateContent) and video (Omni Flash, Interactions API with URI delivery) over
 * plain REST, so a video started before a restart can be picked up again by its file name.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    headers: { 'x-goog-api-key': requireSecret('gemini'), 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  })
  if (!res.ok) throw geminiMediaError(res.status, await res.text().catch(() => ''))
  return res
}

/** Retries quota hiccups and server errors a few times; everything else goes straight to the user. */
async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof ApiError && e.retryable && attempt < 3 && !signal?.aborted) {
        await sleep(5000 * (attempt + 1), signal)
        continue
      }
      if (e instanceof TypeError) throw new Error(`Tidak bisa terhubung ke Gemini: ${e.message}`)
      throw e
    }
  }
}

export async function generateImage(model: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<{ bytes: Buffer; contentType: string }> {
  const json = await withRetry(
    async () => (await call(`models/${model}:generateContent`, { method: 'POST', body: JSON.stringify(body), signal })).json(),
    signal
  )
  const { mimeType, data } = imageFromResponse(json)
  return { bytes: Buffer.from(data, 'base64'), contentType: mimeType }
}

/** Starts an Omni video; returns the file ("files/<id>") the video is written to. */
export async function startVideo(body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const json = await withRetry(async () => (await call('interactions', { method: 'POST', body: JSON.stringify(body), signal })).json(), signal)
  return omniFileFromResponse(json)
}

/** Waits for the video file to become downloadable, then downloads it. */
export async function waitForVideo(
  file: string,
  onTick: (elapsedMs: number) => void,
  signal?: AbortSignal,
  timeoutMs = 15 * 60 * 1000
): Promise<{ bytes: Buffer; contentType: string }> {
  const started = Date.now()
  let failures = 0
  for (;;) {
    if (Date.now() - started > timeoutMs) throw new Error('Gemini terlalu lama membuat video. Coba lagi nanti.')
    try {
      const state = fileState(await (await call(file, { method: 'GET', signal })).json())
      failures = 0
      if (state === 'active') break
    } catch (e) {
      if (signal?.aborted) throw e
      if (!(e instanceof ApiError) || !e.retryable || ++failures > 8) throw e
    }
    onTick(Date.now() - started)
    await sleep(5000, signal)
  }
  const res = await call(`${file}:download?alt=media`, { method: 'GET', signal, headers: { Accept: '*/*' } })
  return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'video/mp4' }
}
