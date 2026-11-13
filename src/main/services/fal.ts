import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import type { KeyTestResult } from '@shared/types'
import { getSecret, requireSecret } from '../secrets'
import { falError, falUsd } from './fal-format'
import { ApiError, sleep } from './http'

const QUEUE = 'https://queue.fal.run'

export interface FalSubmitted {
  requestId: string
  statusUrl: string
  responseUrl: string
  cancelUrl: string
}

async function fal<T>(url: string, init: RequestInit & { key?: string } = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Key ${init.key ?? requireSecret('fal')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {})
    }
  })
  if (!res.ok) throw falError(res.status, await res.text().catch(() => ''))
  const text = await res.text()
  return (text ? JSON.parse(text) : {}) as T
}

/** Queues a generation. Retries a few times when fal is rate limiting the account. */
export async function submit(endpoint: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<FalSubmitted> {
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await fal<{ request_id: string; status_url: string; response_url: string; cancel_url: string }>(`${QUEUE}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(body),
        signal
      })
      return { requestId: out.request_id, statusUrl: out.status_url, responseUrl: out.response_url, cancelUrl: out.cancel_url }
    } catch (e) {
      if (e instanceof ApiError && e.retryable && attempt < 5 && !signal?.aborted) {
        await sleep(4000 + attempt * 3000, signal)
        continue
      }
      throw e
    }
  }
}

/** Polls until the request finishes, then reads the result. Starts at 2 s and backs off to 10 s. */
export async function waitForResult(
  s: Pick<FalSubmitted, 'statusUrl' | 'responseUrl'>,
  onTick: (state: 'queued' | 'running', elapsedMs: number) => void,
  signal?: AbortSignal,
  timeoutMs = 20 * 60 * 1000
): Promise<{ url: string }> {
  const started = Date.now()
  let delay = 2000
  let failures = 0
  for (;;) {
    if (Date.now() - started > timeoutMs) throw new Error('fal.ai terlalu lama merespons. Coba lagi nanti.')
    let status: string
    try {
      status = (await fal<{ status: string }>(s.statusUrl, { method: 'GET', signal })).status
      failures = 0
    } catch (e) {
      if (signal?.aborted) throw e
      if (e instanceof ApiError && !e.retryable) throw e
      if (++failures > 8) throw e
      await sleep(delay, signal)
      continue
    }
    if (status === 'COMPLETED') break
    onTick(status === 'IN_QUEUE' ? 'queued' : 'running', Date.now() - started)
    await sleep(delay + Math.random() * 500, signal)
    delay = Math.min(10_000, delay * 1.5)
  }
  // A finished request that failed answers its response URL with the error.
  const out = await fal<{ images?: { url: string }[]; image?: { url: string }; video?: { url: string } }>(s.responseUrl, { method: 'GET', signal })
  const url = out.video?.url ?? out.images?.[0]?.url ?? out.image?.url
  if (!url) throw new Error('fal.ai selesai tanpa file hasil')
  return { url }
}

export async function cancel(cancelUrl: string): Promise<void> {
  try {
    await fal(cancelUrl, { method: 'PUT' })
  } catch {
    // Already finished or running past the point of cancelling.
  }
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

/** Uploads a local image to fal's CDN and returns its URL, for use as a reference or first frame. */
export async function uploadFile(absPath: string, signal?: AbortSignal): Promise<string> {
  const contentType = MIME[extname(absPath).toLowerCase()] ?? 'image/png'
  const slot = await fal<{ upload_url: string; file_url: string }>('https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
    method: 'POST',
    body: JSON.stringify({ file_name: basename(absPath), content_type: contentType }),
    signal
  })
  const put = await fetch(slot.upload_url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: await readFile(absPath), signal })
  if (!put.ok) throw new Error(`Gagal mengunggah gambar ke fal.ai (HTTP ${put.status})`)
  return slot.file_url
}

interface FalPrice {
  endpoint_id: string
  unit_price: number
  unit: string
}

async function prices(endpoint: string, key?: string): Promise<FalPrice | null> {
  const out = await fal<{ prices?: FalPrice[] }>(`https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(endpoint)}`, { method: 'GET', key })
  return out.prices?.find((p) => p.endpoint_id === endpoint) ?? out.prices?.[0] ?? null
}

/** Dollars for one image, or one video of `seconds`; null when fal prices it by a unit we cannot predict. */
export async function priceUsd(endpoint: string, kind: 'image' | 'video', seconds: number): Promise<number | null> {
  try {
    return falUsd(await prices(endpoint), kind, seconds)
  } catch (e) {
    console.warn(`[fal] price ${endpoint}: ${(e as Error).message}`)
    return null
  }
}

/** The price list is the cheapest authenticated call: it needs a valid key and spends nothing. */
export async function testKey(key?: string): Promise<KeyTestResult> {
  const k = key ?? getSecret('fal')
  if (!k) return { ok: false, message: 'Kunci belum diatur' }
  try {
    const p = await prices('google/nano-banana-2.1', k)
    const usd = falUsd(p, 'image', 0)
    return { ok: true, message: usd != null ? `Terhubung · 1 gambar Nano Banana 2.1 ≈ US$${usd.toLocaleString('id-ID', { maximumFractionDigits: 3 })}` : 'Terhubung' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
