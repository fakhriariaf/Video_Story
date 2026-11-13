import { ApiError, errorDetail } from './http'

/** Pure parts of the Gemini image/video client, kept apart from the network code so they can be unit tested. */

const SAFETY = /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/i
const BLOCKED = 'Gemini menolak membuat gambar adegan ini karena aturan keamanan konten. Ubah deskripsi adegannya lalu coba lagi.'

/** The first image of a generateContent answer. Nano Banana sometimes answers in words only, or refuses. */
export function imageFromResponse(json: unknown): { mimeType: string; data: string } {
  const r = json as any
  if (r?.promptFeedback?.blockReason) throw new Error(BLOCKED)
  const candidate = r?.candidates?.[0]
  const parts: any[] = candidate?.content?.parts ?? []
  for (const p of parts) {
    const inline = p?.inlineData ?? p?.inline_data
    if (inline?.data) return { mimeType: inline.mimeType ?? inline.mime_type ?? 'image/png', data: inline.data }
  }
  if (SAFETY.test(String(candidate?.finishReason ?? ''))) throw new Error(BLOCKED)
  throw new Error('Gemini tidak mengembalikan gambar. Coba lagi atau pilih model lain.')
}

/**
 * The file Omni wrote the video to ("files/<id>"), from the interaction made with URI delivery. Raw REST puts the
 * video in steps[].content[] with a ".../files/<id>:download?alt=media" URI; output_video is the SDKs' shortcut.
 */
export function omniFileFromResponse(json: unknown): string {
  const r = json as any
  const steps: any[] = Array.isArray(r?.steps) ? r.steps : []
  const uris: unknown[] = [
    r?.output_video?.uri,
    r?.interaction?.output_video?.uri,
    ...steps.flatMap((s) => (Array.isArray(s?.content) ? s.content : [])).filter((c: any) => c?.type === 'video').map((c: any) => c?.uri)
  ]
  for (const uri of uris) {
    const m = typeof uri === 'string' ? /files\/[^/?#:]+/.exec(uri) : null
    if (m) return m[0]
  }
  // Only the outcome fields count: rating lists mention "safety" on every answer.
  const reasons = [r?.finish_reason, r?.finishReason, r?.block_reason, r?.blockReason, r?.status_reason].map(String).join(' ')
  if (SAFETY.test(reasons)) throw new Error(BLOCKED.replace('gambar', 'video'))
  throw new Error('Gemini tidak membuat video. Coba lagi atau ubah deskripsi gerakannya.')
}

/** Whether the generated file can be downloaded yet. */
export function fileState(json: unknown): 'pending' | 'active' {
  const r = json as any
  if (r?.state === 'ACTIVE') return 'active'
  if (r?.state === 'FAILED') throw new Error(`Gemini gagal membuat video: ${r?.error?.message ?? 'tanpa keterangan'}`)
  return 'pending'
}

export function geminiMediaError(status: number, body: string): ApiError {
  const detail = errorDetail(body, status)
  // Google's ordinary quota message also says "check your plan and billing details"; only a zero free tier means no billing.
  if (/free_tier|limit: 0|FAILED_PRECONDITION/i.test(`${detail} ${body}`))
    return new ApiError('Gambar dan video Gemini butuh billing aktif di Google AI Studio.', status)
  if (status === 401 || status === 403) return new ApiError('Kunci Gemini ditolak. Periksa kunci di Pengaturan.', status)
  if (status === 404) return new ApiError(`Model Gemini ini tidak tersedia untuk kunci kamu (${detail}).`, status)
  if (status === 429) return new ApiError('Kuota Gemini sedang penuh. Mencoba lagi…', status, true)
  if (status >= 500) return new ApiError(`Server Gemini sedang bermasalah (${status}).`, status, true)
  return new ApiError(`Gemini menolak permintaan: ${detail}`, status)
}
