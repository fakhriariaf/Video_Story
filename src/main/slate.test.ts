import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitDuration, VIDEO_MODELS } from '@shared/media'
import { costLines, narrowHiddenIndex, slateRows, slateTimecode, slateVideoSeconds, stripStyles } from '@shared/slate'
import { VISUAL_STYLES } from '@shared/styles'

const base = {
  durationSec: 30,
  aspectRatio: '16:9' as const,
  language: 'id',
  ttsProvider: 'elevenlabs' as const,
  voiceName: 'Rachel',
  styleId: 'watercolor',
  imageModel: 'fal:google/nano-banana-2.1',
  videoModel: 'fal:fal-ai/kling-video/v3/standard/image-to-video'
}

test('slateRows lists the project choices in order', () => {
  assert.deepEqual(slateRows(base), [
    { label: 'Adegan', value: '± 5, masing-masing 6 detik' },
    { label: 'Format', value: '16:9 YouTube' },
    { label: 'Bahasa', value: 'Indonesia' },
    { label: 'Narator', value: 'ElevenLabs, Rachel' },
    { label: 'Gaya', value: 'Buku cerita cat air' },
    { label: 'Gambar', value: 'Nano Banana 2.1 (fal.ai)' },
    { label: 'Video', value: 'Kling 3.0 Standard (fal.ai)' }
  ])
})

test('slateRows copes with portrait, an unknown voice and default models', () => {
  const rows = slateRows({ ...base, aspectRatio: '9:16', voiceName: null, ttsProvider: 'gemini', imageModel: null, videoModel: null })
  assert.equal(rows[1].value, '9:16 Shorts, Reels, TikTok')
  assert.equal(rows[3].value, 'Gemini TTS')
  assert.match(rows[5].value, /\(Higgsfield\)$/)
  assert.match(rows[6].value, /\(Higgsfield\)$/)
})

test('slateRows falls back to the language code it does not know', () => {
  assert.equal(slateRows({ ...base, language: 'xx' })[2].value, 'xx')
})

test('slateTimecode formats the target length', () => {
  assert.equal(slateTimecode(30), '00:30')
  assert.equal(slateTimecode(60), '01:00')
  assert.equal(slateTimecode(600), '10:00')
})

test('stripStyles shows five styles and keeps the chosen one in view', () => {
  const first = stripStyles('all', 'stickman', false)
  assert.equal(first.length, 5)
  assert.equal(first[0].id, 'stickman')
  // A chosen style further down takes the fourth place: a narrow strip shows four frames, and it must be one of them.
  const late = stripStyles('all', 'epic', false)
  assert.deepEqual(
    late.map((s) => s.id),
    ['stickman', 'flat', 'whiteboard', 'epic', 'collage']
  )
  // A style already on the strip never moves when it is clicked, not even the fifth one.
  assert.deepEqual(
    stripStyles('all', 'watercolor', false).map((s) => s.id),
    ['stickman', 'flat', 'whiteboard', 'collage', 'watercolor']
  )
  assert.equal(stripStyles('all', 'epic', true).length, VISUAL_STYLES.length)
  assert.ok(stripStyles('3d', 'stickman', false).every((s) => s.category === '3d'))
})

test('a narrow strip hides the fifth frame, or the fourth when the fifth is the chosen style', () => {
  assert.equal(narrowHiddenIndex(stripStyles('all', 'stickman', false), 'stickman'), 4)
  assert.equal(narrowHiddenIndex(stripStyles('all', 'watercolor', false), 'watercolor'), 3)
  assert.equal(narrowHiddenIndex(stripStyles('all', 'epic', false), 'epic'), 4)
})

test('slateVideoSeconds is the length the video is really made and priced at', () => {
  // A model that only makes 5 or 10 second videos: a 6 second clip is made, and billed, as 10 seconds.
  const fixed = VIDEO_MODELS.find((m) => m.durations && 'values' in m.durations && m.durations.values.join() === '5,10')!
  assert.ok(fixed, 'catalog has a 5/10 second model')
  assert.equal(slateVideoSeconds(fixed.id, 30), 10)
  assert.equal(slateVideoSeconds(fixed.id, 30), fitDuration(fixed, 6))
  // A model with a free range follows the clip length.
  assert.equal(slateVideoSeconds('fal:alibaba/wan-3.0/image-to-video', 30), 6)
})

test('costLines sums image cost and prices one video', () => {
  assert.deepEqual(
    costLines({
      clipCount: 5,
      videoSec: 6,
      image: { credits: null, usd: 0.05 },
      video: { credits: null, usd: 0.42 },
      imageKey: true,
      videoKey: true,
      imageProvider: 'fal.ai',
      videoProvider: 'fal.ai'
    }),
    ['5 gambar ≈ US$0,25', 'Video AI ≈ US$0,42 per klip 6 detik, hanya untuk klip yang kamu jadikan video.']
  )
  const credits = costLines({
    clipCount: 4,
    videoSec: 5,
    image: { credits: 1.5, usd: null },
    video: { credits: 12.4, usd: null },
    imageKey: true,
    videoKey: true,
    imageProvider: 'Higgsfield',
    videoProvider: 'Higgsfield'
  })
  assert.equal(credits[0], '4 gambar ≈ 6 kr')
  assert.equal(credits[1], 'Video AI ≈ 12 kr per klip 5 detik, hanya untuk klip yang kamu jadikan video.')
})

test('costLines says why a price is missing', () => {
  const lines = costLines({
    clipCount: 5,
    videoSec: 6,
    image: null,
    video: null,
    imageKey: false,
    videoKey: true,
    imageProvider: 'fal.ai',
    videoProvider: 'Google Gemini'
  })
  assert.equal(lines[0], 'Perkiraan harga gambar muncul setelah kunci fal.ai diisi di Pengaturan.')
  assert.equal(lines[1], 'Perkiraan harga video belum tersedia.')
})

test('costLines names the video resolution and marks list prices', () => {
  const lines = costLines({
    clipCount: 5,
    videoSec: 6,
    videoResolution: '1080p',
    image: { credits: null, usd: 0.0504 },
    video: { credits: null, usd: 0.104 * 6 },
    imageKey: true,
    videoKey: true,
    imageProvider: 'Google Gemini',
    videoProvider: 'Google Gemini',
    imageListPrice: true,
    videoListPrice: true
  })
  assert.equal(lines[0], '5 gambar ≈ US$0,252 (perkiraan dari tarif Google)')
  assert.equal(lines[1], 'Video AI ≈ US$0,624 per klip 6 detik, 1080p (perkiraan dari tarif Google), hanya untuk klip yang kamu jadikan video.')
})
