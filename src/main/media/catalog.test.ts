import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  fitDuration,
  getImageModel,
  getVideoModel,
  imageRequest,
  mediaModelOptions,
  newProjectModels,
  RECOMMENDED,
  videoPlan,
  videoRequest
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

test('videoPlan fits Gemini video into 3-10 s', () => {
  const omni = getVideoModel(RECOMMENDED.gemini.video)
  assert.deepEqual(videoPlan(omni, 2, null), { duration: 3, resolution: '720p' })
  assert.deepEqual(videoPlan(omni, 6.2, '1080p'), { duration: 7, resolution: '1080p' })
  assert.deepEqual(videoPlan(omni, 14, null), { duration: 10, resolution: '720p' })
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
  assert.equal(endpoint, 'gemini-omni-1.1-flash')
  assert.equal(b.model, 'gemini-omni-1.1-flash')
  assert.deepEqual(b.input[0], { type: 'image', data: 'BBB', mime_type: 'image/jpeg' })
  assert.match(b.input[1].text, /walks/)
  assert.match(b.input[1].text, /about 5 seconds/)
  assert.match(b.input[1].text, /Silent clip/)
  assert.equal(b.generation_config.video_config.task, 'image_to_video')
  assert.deepEqual(b.response_format, { type: 'video', aspect_ratio: '16:9', resolution: '1080p', delivery: 'uri' })
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
