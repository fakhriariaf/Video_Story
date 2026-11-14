import { fitDuration, getImageModel, getVideoModel, PROVIDER_LABEL } from './media'
import { clipCountFor, LANGUAGES } from './models'
import { costLabel } from './price'
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
 * Styles of a category for the strip: all of them when expanded, else `max` of them. A style that is already among
 * the first `max` keeps its place (frames must not jump when clicked); a chosen style further down the list takes
 * the place before last, where a narrow strip still shows it.
 */
export function stripStyles(category: StyleCategory | 'all', selectedId: string, expanded: boolean, max = 5): VisualStyle[] {
  const list = VISUAL_STYLES.filter((s) => category === 'all' || s.category === category)
  if (expanded || list.length <= max) return list
  const at = list.findIndex((s) => s.id === selectedId)
  if (at < max) return list.slice(0, max)
  return [...list.slice(0, max - 2), list[at], list[max - 2]]
}

/**
 * A narrow strip has room for four of the five frames. It drops the last one, or the one before it when the last
 * frame is the chosen style, so the current choice is never the frame that disappears.
 */
export function narrowHiddenIndex(shown: VisualStyle[], selectedId: string): number {
  return shown[4]?.id === selectedId ? 3 : 4
}

/** How long the AI video of one clip really is: models with fixed lengths round the clip up, and bill for that. */
export function slateVideoSeconds(videoModel: string | null, durationSec: number): number {
  const perClip = Math.round(durationSec / clipCountFor(durationSec))
  return fitDuration(getVideoModel(videoModel), perClip) ?? perClip
}

/** The cost sentences of the slate, or one line saying why no price is known. */
export function costLines(a: {
  clipCount: number
  /** Length of one AI video as the model makes it (see slateVideoSeconds). */
  videoSec: number
  videoResolution?: string | null
  image: CreditEstimate | null
  video: CreditEstimate | null
  imageKey: boolean
  videoKey: boolean
  imageProvider: string
  videoProvider: string
  /** The price comes from the provider's published rates (Gemini), not from a price API. */
  imageListPrice?: boolean
  videoListPrice?: boolean
}): string[] {
  const LIST = ' (perkiraan dari tarif Google)'
  const line = (what: 'gambar' | 'video', hasKey: boolean, provider: string, text: string | null): string => {
    if (!hasKey) return `Perkiraan harga ${what} muncul setelah kunci ${provider} diisi di Pengaturan.`
    return text ?? `Perkiraan harga ${what} belum tersedia.`
  }
  const imagePrice = costLabel(a.image, a.clipCount)
  const videoPrice = costLabel(a.video)
  return [
    line('gambar', a.imageKey, a.imageProvider, imagePrice ? `${a.clipCount} gambar ≈ ${imagePrice}${a.imageListPrice ? LIST : ''}` : null),
    line(
      'video',
      a.videoKey,
      a.videoProvider,
      videoPrice
        ? `Video AI ≈ ${videoPrice} per klip ${a.videoSec} detik${a.videoResolution ? `, ${a.videoResolution}` : ''}${a.videoListPrice ? LIST : ''}, hanya untuk klip yang kamu jadikan video.`
        : null
    )
  ]
}
