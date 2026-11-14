import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RECOMMENDED } from '@shared/media'
import { serviceSummary } from '@shared/services'
import type { AccountStatus, ApiProvider, AppSettings, KeyStatus } from '@shared/types'

const base: AppSettings = {
  defaultTtsProvider: 'gemini',
  defaultLanguage: 'id',
  exportFolder: null,
  llmProvider: 'gemini',
  llmModels: { gemini: 'gemini-3.8-flash', openrouter: '', groq: '', custom: '', chatgpt: '' },
  customBaseUrl: '',
  geminiTtsModel: 'gemini-3.8-flash-tts',
  elevenModel: 'eleven_multilingual_v2',
  imageModel: RECOMMENDED.higgsfield.image,
  videoModel: RECOMMENDED.higgsfield.video,
  whisperAuto: true,
  chatgptWelcomeSeen: false
}

function key(provider: ApiProvider, configured: boolean): KeyStatus {
  return { provider, configured, lastOk: configured ? true : null, lastMessage: null, checkedAt: null, preview: null, unreadable: false }
}

const chatgptIn: AccountStatus = { provider: 'chatgpt', signedIn: true, label: 'someone@example.com', needsReauth: false, planUsageAllowed: true }

test('lists the four services with the chosen providers', () => {
  const lines = serviceSummary({
    settings: { ...base, llmProvider: 'chatgpt', defaultTtsProvider: 'elevenlabs', imageModel: RECOMMENDED.fal.image },
    keys: [key('elevenlabs', true), key('fal', true)],
    accounts: [chatgptIn],
    whisperReady: false
  })
  assert.deepEqual(
    lines.map((l) => [l.id, l.label, l.provider, l.ok]),
    [
      ['story', 'Cerita', 'ChatGPT (langganan)', true],
      ['voice', 'Suara', 'ElevenLabs', true],
      ['media', 'Gambar', 'fal.ai', true],
      ['caption', 'Caption', 'Belum diunduh', false]
    ]
  )
})

test('a key that failed its last check is not ok', () => {
  const lines = serviceSummary({ settings: base, keys: [{ ...key('gemini', true), lastOk: false }], accounts: [], whisperReady: true })
  assert.equal(lines[0].ok, false)
  assert.equal(lines[1].ok, false)
  assert.equal(lines[1].provider, 'Gemini TTS')
  assert.equal(lines[3].provider, 'Whisper')
  assert.equal(lines[3].ok, true)
})

test('a missing key is not ok', () => {
  const lines = serviceSummary({ settings: base, keys: [key('gemini', true)], accounts: [], whisperReady: false })
  assert.equal(lines[0].ok, true)
  assert.equal(lines[2].provider, 'Higgsfield')
  assert.equal(lines[2].ok, false)
})

test('ChatGPT without plan usage, or needing a new sign-in, is not ok', () => {
  const settings: AppSettings = { ...base, llmProvider: 'chatgpt' }
  const story = (a: AccountStatus[]): boolean => serviceSummary({ settings, keys: [], accounts: a, whisperReady: false })[0].ok
  assert.equal(story([{ ...chatgptIn, planUsageAllowed: false }]), false)
  assert.equal(story([{ ...chatgptIn, needsReauth: true }]), false)
  assert.equal(story([]), false)
  assert.equal(story([chatgptIn]), true)
})
