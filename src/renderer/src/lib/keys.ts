import { pickTts, TTS_NAMES } from '@shared/services'
import type { KeyStatus, TtsProvider } from '@shared/types'

export { TTS_NAMES }

/**
 * Whether each narrator voice service can be used: it needs a saved key that did not fail its last check.
 * `reason` says why not, for disabled options.
 */
export function ttsReadiness(keys: KeyStatus[]): Record<TtsProvider, { ok: boolean; reason: string | null }> {
  const one = (p: TtsProvider): { ok: boolean; reason: string | null } => {
    const k = keys.find((x) => x.provider === p)
    const name = p === 'gemini' ? 'Gemini' : 'ElevenLabs'
    if (!k?.configured) return { ok: false, reason: `Kunci ${name} belum diisi` }
    if (k.lastOk === false) return { ok: false, reason: `Kunci ${name} tidak valid` }
    return { ok: true, reason: null }
  }
  return { gemini: one('gemini'), elevenlabs: one('elevenlabs') }
}

/** The preferred provider when it is usable, otherwise another usable one, otherwise the preferred one anyway. */
export function usableTts(preferred: TtsProvider, keys: KeyStatus[]): TtsProvider {
  const ready = ttsReadiness(keys)
  return pickTts(preferred, (p) => ready[p].ok)
}
