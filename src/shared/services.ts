import { getImageModel, newProjectModels, PROVIDER_LABEL } from './media'
import { llmName } from './models'
import type { AccountStatus, ApiProvider, AppSettings, KeyStatus, TtsProvider } from './types'

/** One row of the "Layanan AI" summary in the app rail: which provider does a job, and whether it is ready. */
export interface ServiceLine {
  id: 'story' | 'voice' | 'media' | 'caption'
  label: string
  provider: string
  ok: boolean
}

export const TTS_NAMES: Record<TtsProvider, string> = { gemini: 'Gemini TTS', elevenlabs: 'ElevenLabs' }

/** The preferred narrator service when it is usable, otherwise the other one if that is, otherwise the preferred one anyway. */
export function pickTts(preferred: TtsProvider, usable: (p: TtsProvider) => boolean): TtsProvider {
  if (usable(preferred)) return preferred
  const other: TtsProvider = preferred === 'gemini' ? 'elevenlabs' : 'gemini'
  return usable(other) ? other : preferred
}

/**
 * The four services a video needs, as a new project would use them: the provider chosen in Settings, or the one
 * that takes over when the chosen one has no working key (the same fallbacks Home and createProject apply). A key
 * counts as ready once it is saved and did not fail its last check; ChatGPT counts once the account is signed in
 * and allowed plan usage. The story writer also needs a chosen model.
 */
export function serviceSummary(a: { settings: AppSettings; keys: KeyStatus[]; accounts: AccountStatus[]; whisperReady: boolean }): ServiceLine[] {
  const keyOk = (p: ApiProvider): boolean => {
    const k = a.keys.find((x) => x.provider === p)
    return !!k?.configured && k.lastOk !== false
  }
  const llm = a.settings.llmProvider
  const chatgpt = a.accounts.find((x) => x.provider === 'chatgpt')
  const connected = llm === 'chatgpt' ? !!chatgpt?.signedIn && !chatgpt.needsReauth && chatgpt.planUsageAllowed !== false : keyOk(llm)
  const tts = pickTts(a.settings.defaultTtsProvider, keyOk)
  const media = getImageModel(newProjectModels(a.settings, keyOk).imageModel).provider
  return [
    { id: 'story', label: 'Cerita', provider: llmName(llm), ok: connected && !!a.settings.llmModels[llm] },
    { id: 'voice', label: 'Suara', provider: TTS_NAMES[tts], ok: keyOk(tts) },
    { id: 'media', label: 'Gambar', provider: PROVIDER_LABEL[media], ok: keyOk(media) },
    { id: 'caption', label: 'Caption', provider: a.whisperReady ? 'Whisper' : 'Belum diunduh', ok: a.whisperReady }
  ]
}
