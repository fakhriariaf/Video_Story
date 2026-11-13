import type { MediaProvider } from '@shared/media'

/** What a running image/video job stores in jobs.payload_json, so it can be finished after a restart. */
export interface MediaPayload {
  target: 'clip-image' | 'sheet' | 'clip-video'
  model: string
  prompt: string
  /** Absent on jobs saved before other providers existed: those are Higgsfield jobs. */
  provider?: MediaProvider
  /** Where to poll: fal's status/response/cancel URLs, or the Gemini file a video is written to. */
  resume?: Record<string, string>
}

const RESUME_KEYS: Record<MediaProvider, string[]> = {
  higgsfield: [],
  fal: ['statusUrl', 'responseUrl'],
  gemini: ['file']
}

/** How to pick up an unfinished job after a restart, or null when it never reached a provider and must fail. */
export function resumePlan(row: { provider?: string; remote_id?: string | null; payload_json?: string | null }): { provider: MediaProvider; payload: MediaPayload } | null {
  if (!row.remote_id) return null
  if (row.provider !== 'higgsfield' && row.provider !== 'fal' && row.provider !== 'gemini') return null
  let payload: MediaPayload
  try {
    payload = JSON.parse(row.payload_json || '{}') as MediaPayload
  } catch {
    return null
  }
  if (!payload.target) return null
  const provider = payload.provider ?? (row.provider as MediaProvider)
  if (RESUME_KEYS[provider].some((k) => !payload.resume?.[k])) return null
  return { provider, payload }
}
