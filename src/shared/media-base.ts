/**
 * Types and small helpers every image/video provider shares. Kept apart from media.ts so provider modules
 * (gemini-media.ts) can use them without importing the catalog that imports them.
 */

export type MediaProvider = 'higgsfield' | 'fal' | 'gemini'

export interface FieldSchema {
  type?: string
  enum?: (string | number)[]
  default?: unknown
  minimum?: number
  maximum?: number
  maxLength?: number
  maxItems?: number
}

export interface MediaInput {
  field: string | null
  mode: 'none' | 'first-frame' | 'reference'
  max: number
}

/** A second endpoint of the same model that takes reference images (fal's "/edit" endpoints). */
export interface MediaVariant {
  endpoint: string
  input: MediaInput
  required: string[]
  props: Record<string, FieldSchema>
}

export interface MediaModel {
  /** Stored id: a Higgsfield id as-is, 'fal:<endpoint>' or 'gemini:<model>'. */
  id: string
  provider: MediaProvider
  /** What the provider's API is called with. */
  endpoint: string
  name: string
  family: string
  kind: 'image' | 'video'
  /** Where the clip image (video) or the character sheets (image) go in the request. */
  input: MediaInput
  required: string[]
  props: Record<string, FieldSchema>
  durations: { values: number[] } | { min: number; max: number } | null
  tags: string[]
  withRefs?: MediaVariant
  /** Published price, for providers without a price API (Gemini); byResolution overrides usd per resolution. */
  price?: { usd: number; per: 'image' | 'second'; byResolution?: Record<string, number> }
}

/** Longest prompt the model accepts. Endpoints without a documented limit get a conservative one. */
export function promptLimit(m: MediaModel): number {
  return m.props.prompt?.maxLength ?? (m.kind === 'video' ? 2500 : 4000)
}

export function clipText(text: string, limit: number): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const space = cut.lastIndexOf(' ')
  return (space > limit * 0.8 ? cut.slice(0, space) : cut).trim()
}

/**
 * Said in every video prompt. Narration and music are added in the editor, but some models (Veo, Grok,
 * MiniMax, Omni, ...) make their own soundtrack and have no switch for it.
 */
export const NO_MUSIC = 'Silent clip: no background music, no soundtrack, no singing or humming.'

/** The video prompt with the no-music rule, trimmed so the rule itself never gets cut off. */
export function videoPrompt(m: MediaModel, prompt: string): string {
  return `${clipText(prompt.trim(), promptLimit(m) - NO_MUSIC.length - 1)} ${NO_MUSIC}`
}

/** Splits a base64 data URI, the form Gemini references travel in. */
export function parseDataUri(uri: string): { mimeType: string; data: string } {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(uri)
  if (!m) throw new Error('Gambar referensi untuk Gemini harus berupa data base64')
  return { mimeType: m[1], data: m[2] }
}
