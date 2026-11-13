import falCatalog from './fal-catalog.json'
import { GEMINI_MODELS, geminiImageBody, omniBody } from './gemini-media'
import hfCatalog from './higgsfield-catalog.json'
import { clipText, promptLimit, videoPrompt, type FieldSchema, type MediaModel, type MediaProvider, type MediaVariant } from './media-base'
import type { AspectRatio, ModelOption } from './types'

export { NO_MUSIC, promptLimit, videoPrompt } from './media-base'
export type { MediaModel, MediaProvider } from './media-base'

/**
 * Every model that can draw a clip image or animate one, from three providers: Higgsfield (generated from
 * docs.higgsfield.ai), fal.ai (generated from fal's OpenAPI by scripts/fal-catalog.mjs) and Google Gemini
 * (gemini-media.ts). Higgsfield and fal request bodies are built from each model's own JSON schema, so a new
 * model of theirs only needs a catalog entry.
 */

type CatalogEntry = Omit<MediaModel, 'provider' | 'endpoint'> & { endpoint?: string }

const HF = (hfCatalog as unknown as { models: CatalogEntry[] }).models.map(
  (m): MediaModel => ({ ...m, provider: 'higgsfield', endpoint: m.id })
)
const FAL = (falCatalog as unknown as { models: (Omit<MediaModel, 'provider' | 'id'> & { endpoint: string })[] }).models.map(
  (m): MediaModel => ({ ...m, id: `fal:${m.endpoint}`, provider: 'fal' })
)
const MODELS: MediaModel[] = [...HF, ...FAL, ...GEMINI_MODELS]

export const MEDIA_PROVIDERS: MediaProvider[] = ['higgsfield', 'fal', 'gemini']

export const PROVIDER_LABEL: Record<MediaProvider, string> = {
  higgsfield: 'Higgsfield',
  fal: 'fal.ai',
  gemini: 'Google Gemini'
}

export const IMAGE_MODELS = MODELS.filter((m) => m.kind === 'image')
export const VIDEO_MODELS = MODELS.filter((m) => m.kind === 'video')
export const HF_IMAGE_MODELS = IMAGE_MODELS.filter((m) => m.provider === 'higgsfield')
export const HF_VIDEO_MODELS = VIDEO_MODELS.filter((m) => m.provider === 'higgsfield')

export const DEFAULT_IMAGE_MODEL = 'marketing-studio/image/sunburst'
export const DEFAULT_VIDEO_MODEL = 'kling-video/v3.0/std/image-to-video'

/** The safe first choice per provider, offered to new projects and marked "Rekomendasi" in the pickers. */
export const RECOMMENDED: Record<MediaProvider, { image: string; video: string }> = {
  higgsfield: { image: DEFAULT_IMAGE_MODEL, video: DEFAULT_VIDEO_MODEL },
  fal: { image: 'fal:google/nano-banana-2.1', video: 'fal:fal-ai/kling-video/v3/standard/image-to-video' },
  gemini: { image: 'gemini:gemini-nano-banana-2.1', video: 'gemini:gemini-omni-1.1-flash' }
}

export function getImageModel(id: string | null | undefined): MediaModel {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS.find((m) => m.id === DEFAULT_IMAGE_MODEL)!
}

export function getVideoModel(id: string | null | undefined): MediaModel {
  return VIDEO_MODELS.find((m) => m.id === id) ?? VIDEO_MODELS.find((m) => m.id === DEFAULT_VIDEO_MODEL)!
}

/** How many character sheets an image model accepts as references. 0 means sheets are not used. */
export function maxRefs(m: MediaModel): number {
  if (m.kind !== 'image') return 0
  if (m.withRefs) return m.withRefs.input.max
  return m.input.mode === 'reference' ? m.input.max : 0
}

/** The video length to request for a clip: the shortest allowed length that covers it, or the longest. */
export function fitDuration(m: MediaModel, seconds: number): number | null {
  const d = m.durations
  if (!d) return null
  const want = Math.max(1, Math.ceil(seconds))
  if ('values' in d) {
    const values = [...d.values].sort((a, b) => a - b)
    return values.find((v) => v >= want) ?? values[values.length - 1]
  }
  return Math.min(d.max, Math.max(d.min, want))
}

export function durationLabel(m: MediaModel): string | null {
  const d = m.durations
  if (!d) return null
  return 'values' in d ? `${d.values.join(' / ')} dtk` : `${d.min}–${d.max} dtk`
}

function pick(s: FieldSchema | undefined, prefer: (string | number)[]): string | number | undefined {
  if (!s?.enum?.length) return undefined
  for (const p of prefer) if (s.enum.includes(p)) return p
  return (s.default as string | number | undefined) ?? s.enum[0]
}

/**
 * The resolution sent to the model: the requested one when the model offers it, else 2K stills (enough room for
 * camera moves) and 1080p video, or the closest the model offers. Gemini upscales above 720p at the same price
 * per second but slower, so its own default stands.
 */
function resolutionFor(m: MediaModel, want?: string | null): string | number | undefined {
  const r = m.props.resolution
  if (want && r?.enum?.some((v) => String(v) === want)) return r.enum.find((v) => String(v) === want)
  if (m.provider === 'gemini' && r?.default !== undefined) return r.default as string
  return pick(r, m.kind === 'image' ? ['2k', '2K', '1080p', '1k'] : ['1080p', '2K', '2k', '720p'])
}

/** Resolutions a model offers, lowest first, as picker values. */
export function resolutionOptions(m: MediaModel): string[] {
  const rank = (v: string): number => {
    const k = /^(\d+(?:\.\d+)?)k$/i.exec(v)
    return k ? Number(k[1]) * 1000 : parseInt(v, 10) || 0
  }
  return (m.props.resolution?.enum ?? []).map(String).sort((a, b) => rank(a) - rank(b))
}

/** The resolution a project's videos actually use with this model. */
export function effectiveResolution(m: MediaModel, want?: string | null): string | null {
  const r = resolutionFor(m, want)
  return r === undefined ? null : String(r)
}

/** Length and resolution of the video made for a clip of `seconds`. */
export function videoPlan(m: MediaModel, seconds: number, want?: string | null): { duration: number | null; resolution: string | null } {
  return { duration: fitDuration(m, seconds), resolution: effectiveResolution(m, want) }
}

/** The model as seen by one request: its reference-taking variant when sheets are sent and it has one. */
function view(m: MediaModel, variant?: MediaVariant): MediaModel {
  return variant ? { ...m, ...variant } : m
}

/** Fields every schema-built model shares: prompt, frame, quality, and switching off extras we never use. */
function common(m: MediaModel, prompt: string, aspect: AspectRatio, resolution?: string | null): Record<string, unknown> {
  const p = m.props
  const body: Record<string, unknown> = { prompt: clipText(prompt, promptLimit(m)) }
  if (p.aspect_ratio) {
    const values = p.aspect_ratio.enum
    if (!values || values.includes(aspect)) body.aspect_ratio = aspect
  }
  // fal's Flux, Seedream, Qwen and GPT Image size by preset name instead of aspect_ratio.
  if (p.image_size?.enum?.includes('landscape_16_9')) body.image_size = aspect === '16:9' ? 'landscape_16_9' : 'portrait_16_9'
  const res = resolutionFor(m, resolution)
  if (res !== undefined) body.resolution = res
  if (p.quality?.enum) body.quality = p.quality.enum.includes('high') ? 'high' : p.quality.enum[p.quality.enum.length - 1]
  if (p.mode?.enum) body.mode = pick(p.mode, [])
  if (p.batch_size) body.batch_size = 1
  if (p.num_images) body.num_images = 1
  // The story already describes each shot in detail, so rewriting it would drift from the storyboard.
  if (p.enhance_prompt) body.enhance_prompt = false
  if (p.prompt_extend) body.prompt_extend = false
  // Narration and music come from the editor; generated sound would be dropped anyway.
  if (p.sound?.enum?.includes('off')) body.sound = 'off'
  if (p.generate_audio) body.generate_audio = false
  return body
}

function checkRequired(m: MediaModel, body: Record<string, unknown>): Record<string, unknown> {
  const missing = m.required.filter((f) => body[f] === undefined)
  if (missing.length) throw new Error(`Model ${m.name} butuh ${missing.join(', ')}, yang belum didukung aplikasi ini. Pilih model lain.`)
  return body
}

/**
 * The request for one image. `refs` are character sheets as the provider takes them: public URLs, or data URIs
 * for Gemini.
 */
export function imageRequest(m: MediaModel, prompt: string, aspect: AspectRatio, refs: string[]): { endpoint: string; body: Record<string, unknown> } {
  if (m.provider === 'gemini') return { endpoint: m.endpoint, body: geminiImageBody(m, prompt, aspect, refs, effectiveResolution(m)) }
  const limit = maxRefs(m)
  const v = view(m, limit > 0 && refs.length ? m.withRefs : undefined)
  const body = common(v, prompt, aspect)
  // A field that takes one image (Kontext's image_url) gets the first sheet, not a list.
  if (limit > 0 && refs.length && v.input.field) body[v.input.field] = v.props[v.input.field]?.type === 'string' ? refs[0] : refs.slice(0, limit)
  return { endpoint: v.endpoint, body: checkRequired(v, body) }
}

/** The request that animates a clip image (`image`: a public URL, or a data URI for Gemini). */
export function videoRequest(
  m: MediaModel,
  prompt: string,
  image: string,
  seconds: number,
  aspect: AspectRatio,
  resolution?: string | null
): { endpoint: string; body: Record<string, unknown> } {
  const plan = videoPlan(m, seconds, resolution)
  if (m.provider === 'gemini') return { endpoint: m.endpoint, body: omniBody(m, prompt, image, plan.duration ?? Math.ceil(seconds), aspect, plan.resolution) }
  const body = common(m, videoPrompt(m, prompt), aspect, resolution)
  // Some schemas (Kling, Seedance on fal) list durations as strings.
  if (plan.duration != null) body.duration = m.props.duration?.type === 'string' ? String(plan.duration) : plan.duration
  if (m.input.field) body[m.input.field] = m.input.mode === 'reference' ? [image] : image
  return { endpoint: m.endpoint, body: checkRequired(m, body) }
}

/** What the app will actually request from this model, in words. */
export function describeModel(m: MediaModel): string {
  const res = resolutionFor(m)?.toString().replace(/k$/, 'K')
  if (m.kind === 'image') {
    const refs = maxRefs(m)
    return [refs ? `pakai lembar karakter (maks ${refs})` : 'tanpa lembar karakter', res && `hasil ${res}`].filter(Boolean).join(' · ')
  }
  // Video resolution is picked per project, next to the model.
  return [durationLabel(m), m.input.mode === 'reference' ? 'gambar klip jadi referensi' : 'mulai dari gambar klip'].filter(Boolean).join(' · ')
}

/** Picker rows grouped by provider, each provider's recommended model first with a "Rekomendasi" tag. */
export function mediaModelOptions(kind: 'image' | 'video'): ModelOption[] {
  const list = kind === 'image' ? IMAGE_MODELS : VIDEO_MODELS
  return MEDIA_PROVIDERS.flatMap((p) => {
    const recommended = RECOMMENDED[p][kind]
    const own = list.filter((m) => m.provider === p)
    return [...own.filter((m) => m.id === recommended), ...own.filter((m) => m.id !== recommended)].map((m) => ({
      id: m.id,
      name: m.name,
      family: m.family,
      group: PROVIDER_LABEL[p],
      description: describeModel(m),
      tags: m.id === recommended ? ['Rekomendasi', ...m.tags] : m.tags
    }))
  })
}

/**
 * Models for a new project: the saved choice when its provider has a key, else the recommended model of the first
 * provider that has one, so someone with only a Gemini key does not start on a model they cannot use.
 */
export function newProjectModels(
  current: { imageModel: string; videoModel: string },
  hasKey: (p: MediaProvider) => boolean
): { imageModel: string; videoModel: string } {
  const choose = (kind: 'image' | 'video', id: string): string => {
    const get = kind === 'image' ? getImageModel : getVideoModel
    if (hasKey(get(id).provider)) return id
    const p = MEDIA_PROVIDERS.find((x) => hasKey(x) && get(RECOMMENDED[x][kind]).id === RECOMMENDED[x][kind])
    return p ? RECOMMENDED[p][kind] : id
  }
  return { imageModel: choose('image', current.imageModel), videoModel: choose('video', current.videoModel) }
}
