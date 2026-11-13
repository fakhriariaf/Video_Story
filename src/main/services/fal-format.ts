import { ApiError, errorDetail } from './http'

/** Pure parts of the fal.ai client, kept apart from the network code so they can be unit tested. */

export function falError(status: number, body: string): ApiError {
  const detail = errorDetail(body, status)
  if (status === 402 || /exhausted balance|insufficient|balance|locked/i.test(detail))
    return new ApiError('Saldo fal.ai habis. Isi ulang di fal.ai/dashboard/billing.', status)
  if (status === 401 || status === 403)
    return new ApiError('Kunci fal.ai tidak valid. Buat kunci baru di fal.ai/dashboard/keys lalu tempel di Pengaturan.', status)
  if (status === 422) return new ApiError(`fal.ai menolak isian: ${detail}.`, status)
  if (status === 429) return new ApiError('Terlalu banyak permintaan ke fal.ai. Mencoba lagi…', status, true)
  if (status >= 500) return new ApiError(`Server fal.ai sedang bermasalah (${status}).`, status, true)
  return new ApiError(`fal.ai menolak permintaan: ${detail}`, status)
}

/**
 * Dollars for one request from fal's unit price: per image, per second of video or per video. Other units
 * (megapixels, tokens) depend on output size, so they are left unestimated rather than guessed.
 */
export function falUsd(price: { unit_price: number; unit: string } | null, kind: 'image' | 'video', seconds: number): number | null {
  if (!price || !Number.isFinite(price.unit_price)) return null
  const unit = price.unit.toLowerCase().replace(/s$/, '')
  if (unit === 'image' && kind === 'image') return price.unit_price
  if (unit === 'second' && kind === 'video') return price.unit_price * seconds
  if (unit === 'video' && kind === 'video') return price.unit_price
  return null
}
