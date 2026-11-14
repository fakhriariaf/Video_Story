import { defaultMediaProvider, PROVIDER_LABEL } from './media'
import { llmName } from './models'
import type { AccountStatus, ApiProvider, AppSettings, KeyStatus } from './types'

/** One row of the "Layanan AI" summary in the app rail: which provider does a job, and whether it is ready. */
export interface ServiceLine {
  id: 'story' | 'voice' | 'media' | 'caption'
  label: string
  provider: string
  ok: boolean
}

/**
 * The four services a video needs, with the provider chosen for each in Settings. A key counts as ready once it is
 * saved and did not fail its last check; ChatGPT counts once the account is signed in and allowed plan usage.
 */
export function serviceSummary(a: { settings: AppSettings; keys: KeyStatus[]; accounts: AccountStatus[]; whisperReady: boolean }): ServiceLine[] {
  const keyOk = (p: ApiProvider): boolean => {
    const k = a.keys.find((x) => x.provider === p)
    return !!k?.configured && k.lastOk !== false
  }
  const llm = a.settings.llmProvider
  const chatgpt = a.accounts.find((x) => x.provider === 'chatgpt')
  const storyOk = llm === 'chatgpt' ? !!chatgpt?.signedIn && !chatgpt.needsReauth && chatgpt.planUsageAllowed !== false : keyOk(llm)
  const tts = a.settings.defaultTtsProvider
  const media = defaultMediaProvider(a.settings)
  return [
    { id: 'story', label: 'Cerita', provider: llmName(llm), ok: storyOk },
    { id: 'voice', label: 'Suara', provider: tts === 'gemini' ? 'Gemini TTS' : 'ElevenLabs', ok: keyOk(tts) },
    { id: 'media', label: 'Gambar', provider: PROVIDER_LABEL[media], ok: keyOk(media) },
    { id: 'caption', label: 'Caption', provider: a.whisperReady ? 'Whisper' : 'Belum diunduh', ok: a.whisperReady }
  ]
}
