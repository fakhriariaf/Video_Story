import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  fitDuration,
  getImageModel,
  getVideoModel,
  IMAGE_MODELS,
  imageRequest,
  listPriceUsd,
  maxRefs,
  mediaModelOptions,
  newProjectModels,
  RECOMMENDED,
  videoPlan,
  videoRequest,
  VIDEO_MODELS
} from '@shared/media'

test('legacy Higgsfield ids still resolve unchanged', () => {
  assert.equal(getImageModel('marketing-studio/image/sunburst').provider, 'higgsfield')
  assert.equal(getVideoModel('kling-video/v3.0/std/image-to-video').endpoint, 'kling-video/v3.0/std/image-to-video')
})

test('unknown or removed ids fall back to the defaults', () => {
  assert.equal(getImageModel('fal:does/not-exist').id, DEFAULT_IMAGE_MODEL)
  assert.equal(getVideoModel('weird:thing').id, DEFAULT_VIDEO_MODEL)
  assert.equal(getImageModel(null).id, DEFAULT_IMAGE_MODEL)
})

test('gemini models are addressable with their prefix', () => {
  const m = getImageModel('gemini:gemini-nano-banana-2.1')
  assert.equal(m.provider, 'gemini')
  assert.equal(m.endpoint, 'gemini-nano-banana-2.1')
  assert.equal(getVideoModel(RECOMMENDED.gemini.video).provider, 'gemini')
})

test('videoPlan keeps Higgsfield behaviour', () => {
  const kling = getVideoModel(DEFAULT_VIDEO_MODEL)
  assert.equal(videoPlan(kling, 4, null).duration, fitDuration(kling, 4))
})

test('videoPlan fits Gemini video into 3-15 s', () => {
  const omni = getVideoModel(RECOMMENDED.gemini.video)
  assert.deepEqual(videoPlan(omni, 2, null), { duration: 3, resolution: '720p' })
  assert.deepEqual(videoPlan(omni, 6.2, '1080p'), { duration: 7, resolution: '1080p' })
  assert.deepEqual(videoPlan(omni, 14, null), { duration: 14, resolution: '720p' })
  assert.deepEqual(videoPlan(omni, 20, null), { duration: 15, resolution: '720p' })
})

test('listPriceUsd prices Gemini per image and per second at the chosen resolution', () => {
  assert.equal(listPriceUsd(getImageModel('gemini:gemini-nano-banana-2.1'), 0, null), 0.0504)
  const omni = getVideoModel(RECOMMENDED.gemini.video)
  assert.equal(listPriceUsd(omni, 5, '720p'), 0.35)
  assert.equal(listPriceUsd(omni, 5, '1080p'), 0.52)
  assert.equal(listPriceUsd(omni, 5, null), 0.35)
  assert.equal(listPriceUsd(getVideoModel(DEFAULT_VIDEO_MODEL), 5, null), null)
})

test('geminiImageBody sends prompt, references as inline data and the frame', () => {
  const m = getImageModel('gemini:gemini-nano-banana-2.1')
  const { endpoint, body } = imageRequest(m, 'a cat', '9:16', ['data:image/png;base64,AAA'])
  assert.equal(endpoint, 'gemini-nano-banana-2.1')
  const b = body as any
  assert.deepEqual(b.contents[0].parts[0], { text: 'a cat' })
  assert.deepEqual(b.contents[0].parts[1], { inline_data: { mime_type: 'image/png', data: 'AAA' } })
  assert.equal(b.generationConfig.imageConfig.aspectRatio, '9:16')
  assert.equal(b.generationConfig.imageConfig.imageSize, '2K')
  assert.deepEqual(b.generationConfig.responseModalities, ['TEXT', 'IMAGE'])
})

test('gemini image models without reference support ignore sheets', () => {
  const lite = getImageModel('gemini:gemini-3.1-flash-lite-image')
  const b = imageRequest(lite, 'a cat', '16:9', ['data:image/png;base64,AAA']).body as any
  assert.equal(b.contents[0].parts.length, 1)
})

test('omniBody animates the first frame with length, frame and resolution', () => {
  const v = getVideoModel(RECOMMENDED.gemini.video)
  const { endpoint, body } = videoRequest(v, 'walks', 'data:image/jpeg;base64,BBB', 4.4, '16:9', '1080p')
  const b = body as any
  assert.equal(endpoint, 'gemini-omni-1.2-flash')
  assert.equal(b.model, 'gemini-omni-1.2-flash')
  assert.deepEqual(b.input[0], { type: 'image', data: 'BBB', mime_type: 'image/jpeg' })
  assert.match(b.input[1].text, /walks/)
  assert.doesNotMatch(b.input[1].text, /seconds long/)
  assert.match(b.input[1].text, /Silent clip/)
  assert.equal(b.generation_config.video_config.task, 'image_to_video')
  assert.deepEqual(b.response_format, { type: 'video', aspect_ratio: '16:9', resolution: '1080p', duration: '5s', delivery: 'uri' })
  assert.equal(b.store, false)
})

test('newProjectModels keeps a model whose provider has a key', () => {
  const cur = { imageModel: DEFAULT_IMAGE_MODEL, videoModel: DEFAULT_VIDEO_MODEL }
  assert.deepEqual(
    newProjectModels(cur, (p) => p === 'higgsfield'),
    cur
  )
})

test('newProjectModels falls back to the first provider with a key', () => {
  const cur = { imageModel: DEFAULT_IMAGE_MODEL, videoModel: DEFAULT_VIDEO_MODEL }
  assert.deepEqual(
    newProjectModels(cur, (p) => p === 'gemini'),
    { imageModel: RECOMMENDED.gemini.image, videoModel: RECOMMENDED.gemini.video }
  )
  assert.deepEqual(
    newProjectModels(cur, () => false),
    cur
  )
})

test('options are grouped by provider in a fixed order', () => {
  const groups = [...new Set(mediaModelOptions('image').map((o) => o.group))]
  assert.equal(groups[0], 'Higgsfield')
  assert.equal(groups[groups.length - 1], 'Google Gemini')
  assert.equal(mediaModelOptions('image')[0].id, DEFAULT_IMAGE_MODEL)
})

test('every fal model builds a request that satisfies its schema', () => {
  const fal = [...IMAGE_MODELS, ...VIDEO_MODELS].filter((m) => m.provider === 'fal')
  assert.ok(fal.length >= 10, 'fal catalog has at least 10 models')
  for (const m of fal) {
    const refs = m.kind === 'image' && maxRefs(m) ? ['https://x/a.png'] : []
    const r = m.kind === 'image' ? imageRequest(m, 'p', '16:9', refs) : videoRequest(m, 'p', 'https://x/a.png', 5, '9:16', null)
    const variant = refs.length && m.withRefs ? m.withRefs : m
    for (const f of variant.required) assert.ok(r.body[f] !== undefined, `${m.id} misses ${f}`)
    assert.equal(r.endpoint, variant.endpoint)
  }
})

test('fal image models without references use the text-to-image endpoint', () => {
  const m = IMAGE_MODELS.find((x) => x.provider === 'fal' && x.withRefs)!
  assert.equal(imageRequest(m, 'p', '16:9', []).endpoint, m.endpoint)
})

test('recommended models exist in the catalog', () => {
  for (const p of ['higgsfield', 'fal', 'gemini'] as const) {
    assert.equal(getImageModel(RECOMMENDED[p].image).id, RECOMMENDED[p].image)
    assert.equal(getVideoModel(RECOMMENDED[p].video).id, RECOMMENDED[p].video)
  }
})

test('fal models that size by image_size get the project frame', () => {
  const flux = getImageModel('fal:fal-ai/flux-2-pro')
  assert.equal(imageRequest(flux, 'p', '9:16', []).body.image_size, 'portrait_16_9')
  assert.equal(imageRequest(flux, 'p', '16:9', []).body.image_size, 'landscape_16_9')
  const seedream = getImageModel('fal:bytedance/seedream/v5.5/text-to-image')
  assert.equal(imageRequest(seedream, 'p', '16:9', ['https://x/a.png']).body.image_size, 'landscape_16_9')
})

test('fal durations keep the type their schema asks for', () => {
  const kling = getVideoModel('fal:fal-ai/kling-video/v3/standard/image-to-video')
  assert.equal(videoRequest(kling, 'p', 'https://x/a.png', 4.2, '16:9', null).body.duration, '5')
  const wan = getVideoModel('fal:alibaba/wan-3.0/image-to-video')
  assert.equal(videoRequest(wan, 'p', 'https://x/a.png', 4.2, '16:9', null).body.duration, 5)
})

test('fal reference fields that take one image get a single URL', () => {
  const kontext = getImageModel('fal:fal-ai/flux-pro/kontext/text-to-image')
  const r = imageRequest(kontext, 'p', '16:9', ['https://x/a.png', 'https://x/b.png'])
  assert.equal(r.endpoint, 'fal-ai/flux-pro/kontext')
  assert.equal(r.body.image_url, 'https://x/a.png')
})
