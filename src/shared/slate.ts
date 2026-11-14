import { getImageModel, getVideoModel, PROVIDER_LABEL } from './media'
import { clipCountFor, LANGUAGES } from './models'
import { TTS_NAMES } from './services'
import { getStyle, VISUAL_STYLES, type StyleCategory, type VisualStyle } from './styles'
import type { AspectRatio, CreditEstimate, TtsProvider } from './types'

/**
 * What the Idea step's slate shows: the choices of a project in words, the styles on its strip, and what the
 * pictures and videos will cost. Kept free of React so it can be unit tested.
 */

export interface SlateRow {
  label: string
  value: string
}

const FORMAT: Record<AspectRatio, string> = { '16:9': '16:9 YouTube', '9:16': '9:16 Shorts, Reels, TikTok' }

export function slateRows(p: {
  durationSec: number
  aspectRatio: AspectRatio
  language: string
  ttsProvider: TtsProvider
  voiceName: string | null
  styleId: string
  imageModel: string | null
  videoModel: string | null
}): SlateRow[] {
  const clips = clipCountFor(p.durationSec)
  const image = getImageModel(p.imageModel)
  const video = getVideoModel(p.videoModel)
  return [
    { label: 'Adegan', value: `± ${clips}, masing-masing ${Math.round(p.durationSec / clips)} detik` },
    { label: 'Format', value: FORMAT[p.aspectRatio] },
    { label: 'Bahasa', value: LANGUAGES.find((l) => l.code === p.language)?.label ?? p.language },
    // The voice list loads after the page; until then the service alone is shown.
    { label: 'Narator', value: p.voiceName ? `${TTS_NAMES[p.ttsProvider]}, ${p.voiceName}` : TTS_NAMES[p.ttsProvider] },
    { label: 'Gaya', value: getStyle(p.styleId).name },
    { label: 'Gambar', value: `${image.name} (${PROVIDER_LABEL[image.provider]})` },
    { label: 'Video', value: `${video.name} (${PROVIDER_LABEL[video.provider]})` }
  ]
}

/** "00:30", "10:00": the target length shown on the preview frame. */
export function slateTimecode(durationSec: number): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${two(Math.floor(durationSec / 60))}:${two(Math.round(durationSec % 60))}`
}

/**
 * Styles of a category for the strip: all of them when expanded, else `max` of them. A narrow strip shows one frame
 * fewer, so the chosen style always sits within the first `max - 1`: when it is further down the list it takes the
 * place before last.
 */
export function stripStyles(category: StyleCategory | 'all', selectedId: string, expanded: boolean, max = 5): VisualStyle[] {
  const list = VISUAL_STYLES.filter((s) => category === 'all' || s.category === category)
  if (expanded || list.length <= max) return list
  const at = list.findIndex((s) => s.id === selectedId)
  if (at < max - 1) return list.slice(0, max)
  return [...list.slice(0, max - 2), list[at], list[max - 2]]
}

function price(e: CreditEstimate, times = 1): string | null {
  if (e.credits != null) {
    const n = e.credits * times
    return `${(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('id-ID')} kr`
  }
  if (e.usd != null) {
    const n = e.usd * times
    return `US$${n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 })}`
  }
  return null
}

/** The cost sentences of the slate, or one line saying why no price is known. */
export function costLines(a: {
  clipCount: number
  perClipSec: number
  image: CreditEstimate | null
  video: CreditEstimate | null
  imageKey: boolean
  videoKey: boolean
  imageProvider: string
  videoProvider: string
}): string[] {
  const line = (what: 'gambar' | 'video', hasKey: boolean, provider: string, text: string | null): string => {
    if (!hasKey) return `Perkiraan harga ${what} muncul setelah kunci ${provider} diisi di Pengaturan.`
    return text ?? `Perkiraan harga ${what} belum tersedia.`
  }
  const imagePrice = a.image && price(a.image, a.clipCount)
  const videoPrice = a.video && price(a.video)
  return [
    line('gambar', a.imageKey, a.imageProvider, imagePrice ? `${a.clipCount} gambar ≈ ${imagePrice}` : null),
    line(
      'video',
      a.videoKey,
      a.videoProvider,
      videoPrice ? `Video AI ≈ ${videoPrice} per klip ${a.perClipSec} detik, hanya untuk klip yang kamu jadikan video.` : null
    )
  ]
}
