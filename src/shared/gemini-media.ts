import { clipText, parseDataUri, promptLimit, videoPrompt, type MediaModel } from './media-base'
import type { AspectRatio } from './types'

/**
 * Google's image and video models on the Gemini API, written by hand because their requests are not a flat field
 * list. Names and prices from ai.google.dev (2026-11): Veo 3.1 was shut down on 2026-10-22, so video uses
 * Gemini Omni Flash. Prices are list prices for the size we request, shown to users as estimates.
 */

function image(endpoint: string, name: string, refs: number, size: '1K' | '2K', usd: number, tags: string[]): MediaModel {
  return {
    id: `gemini:${endpoint}`,
    provider: 'gemini',
    endpoint,
    name,
    family: 'Gemini',
    kind: 'image',
    input: { field: null, mode: refs ? 'reference' : 'none', max: refs },
    required: ['prompt'],
    props: { prompt: { type: 'string', maxLength: 8000 }, resolution: { enum: [size], default: size } },
    durations: null,
    tags,
    price: { usd, per: 'image' }
  }
}

export const GEMINI_MODELS: MediaModel[] = [
  image('gemini-nano-banana-2.1', 'Nano Banana 2.1', 14, '2K', 0.05, ['Referensi']),
  image('gemini-3-pro-image', 'Nano Banana Pro', 14, '2K', 0.134, ['Referensi']),
  image('gemini-3.1-flash-lite-image', 'Nano Banana 2 Lite', 0, '1K', 0.0168, ['Murah']),
  {
    id: 'gemini:gemini-omni-1.1-flash',
    provider: 'gemini',
    endpoint: 'gemini-omni-1.1-flash',
    name: 'Gemini Omni Flash',
    family: 'Gemini',
    kind: 'video',
    input: { field: null, mode: 'first-frame', max: 1 },
    required: ['prompt'],
    props: { prompt: { type: 'string', maxLength: 4000 }, resolution: { enum: ['720p', '1080p', '4k'], default: '720p' } },
    durations: { min: 3, max: 10 },
    tags: [],
    // About 5,792 output tokens per second of 720p video at $17.50 per million tokens.
    price: { usd: 0.1, per: 'second' }
  }
]

/** generateContent body for Nano Banana: the prompt, then each character sheet as inline image data. */
export function geminiImageBody(m: MediaModel, prompt: string, aspect: AspectRatio, refs: string[], size: string | null): Record<string, unknown> {
  const limit = m.input.mode === 'reference' ? m.input.max : 0
  const parts: Record<string, unknown>[] = [{ text: clipText(prompt, promptLimit(m)) }]
  for (const ref of refs.slice(0, limit)) {
    const { mimeType, data } = parseDataUri(ref)
    parts.push({ inline_data: { mime_type: mimeType, data } })
  }
  return {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: aspect, ...(size ? { imageSize: size } : {}) }
    }
  }
}

/**
 * Interactions body for Omni image-to-video. Omni has no length parameter, so the wanted length is asked for in
 * the prompt; the URI delivery keeps clips over 4 MB out of the JSON response.
 */
export function omniBody(m: MediaModel, prompt: string, image: string, seconds: number, aspect: AspectRatio, resolution: string | null): Record<string, unknown> {
  const { mimeType, data } = parseDataUri(image)
  return {
    model: m.endpoint,
    input: [
      { type: 'image', data, mime_type: mimeType },
      { type: 'text', text: videoPrompt(m, `${prompt.trim().replace(/\.?$/, '.')} The video is about ${seconds} seconds long.`) }
    ],
    generation_config: { video_config: { task: 'image_to_video' } },
    response_format: { type: 'video', aspect_ratio: aspect, resolution: resolution ?? '720p', delivery: 'uri' },
    store: false
  }
}
