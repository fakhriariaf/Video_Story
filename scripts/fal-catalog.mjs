// Regenerates src/shared/fal-catalog.json from fal.ai's public OpenAPI schemas. Run: node scripts/fal-catalog.mjs
// The list below is curated: only models that can draw a clip image (optionally from character sheets) or animate
// one from its first frame. Entries whose schema the app cannot fill are skipped with a warning.
import { writeFileSync } from 'node:fs'

const IMAGE = [
  { endpoint: 'google/nano-banana-2.1', edit: 'google/nano-banana-2.1/edit', name: 'Nano Banana 2.1', family: 'Gemini' },
  { endpoint: 'fal-ai/nano-banana-pro', edit: 'fal-ai/nano-banana-pro/edit', name: 'Nano Banana Pro', family: 'Gemini' },
  { endpoint: 'google/nano-banana-2-lite', edit: null, name: 'Nano Banana 2 Lite', family: 'Gemini', tags: ['Murah'] },
  { endpoint: 'openai/gpt-image-2', edit: 'openai/gpt-image-2/edit', name: 'GPT Image 2', family: 'GPT Image' },
  { endpoint: 'bytedance/seedream/v5.5/text-to-image', edit: 'bytedance/seedream/v5.5/edit', name: 'Seedream 5.5', family: 'Seedream' },
  { endpoint: 'fal-ai/flux-2-pro', edit: 'fal-ai/flux-2-pro/edit', name: 'FLUX 2 Pro', family: 'Flux' },
  { endpoint: 'blackforestlabs/flux-3/text-to-image', edit: 'blackforestlabs/flux-3/edit-image', name: 'FLUX 3', family: 'Flux' },
  { endpoint: 'fal-ai/flux-pro/kontext/text-to-image', edit: 'fal-ai/flux-pro/kontext', name: 'FLUX.1 Kontext [pro]', family: 'Flux' },
  { endpoint: 'alibaba/qwen-image-3/text-to-image', edit: 'alibaba/qwen-image-3/edit', name: 'Qwen Image 3', family: 'Qwen' },
  { endpoint: 'fal-ai/recraft/v4.1/text-to-image', edit: null, name: 'Recraft V4.1', family: 'Recraft' },
  { endpoint: 'fal-ai/flux-2/flash', edit: 'fal-ai/flux-2/flash/edit', name: 'FLUX 2 Flash', family: 'Flux', tags: ['Murah'] }
]

const VIDEO = [
  { endpoint: 'fal-ai/kling-video/v3/standard/image-to-video', name: 'Kling 3.0 Standard', family: 'Kling' },
  { endpoint: 'fal-ai/kling-video/v3/pro/image-to-video', name: 'Kling 3.0 Pro', family: 'Kling' },
  { endpoint: 'kling/v4/image-to-video', name: 'Kling 4.0', family: 'Kling' },
  { endpoint: 'kling/v4/flash/image-to-video', name: 'Kling 4.0 Flash', family: 'Kling', tags: ['Murah'] },
  { endpoint: 'bytedance/seedance-2.5/us/image-to-video', name: 'Seedance 2.5', family: 'Seedance' },
  { endpoint: 'bytedance/seedance-2.0/fast/image-to-video', name: 'Seedance 2.0 Fast', family: 'Seedance' },
  { endpoint: 'minimax/h3/image-to-video', name: 'MiniMax H3', family: 'MiniMax' },
  { endpoint: 'fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video', name: 'Hailuo 2.3 Fast', family: 'MiniMax', tags: ['Murah'] },
  { endpoint: 'alibaba/wan-3.0/image-to-video', name: 'Wan 3.0', family: 'Wan' },
  { endpoint: 'google/gemini-omni-flash/v1.2/image-to-video', name: 'Gemini Omni Flash 1.2', family: 'Gemini' },
  { endpoint: 'fal-ai/pixverse/v6/image-to-video', name: 'PixVerse V6', family: 'PixVerse' },
  { endpoint: 'lightricks/ltx-2.5/image-to-video/fast', name: 'LTX 2.5 Fast', family: 'LTX', tags: ['Murah'] },
  { endpoint: 'xai/grok-imagine-video/v1.5/image-to-video', name: 'Grok Imagine Video 1.5', family: 'Grok' },
  { endpoint: 'blackforestlabs/flux-3/image-to-video', name: 'FLUX 3 Video', family: 'Flux' }
]

const IMAGE_FIELDS = ['image_url', 'start_image_url', 'first_frame_url', 'first_frame_image', 'image']
const REF_FIELDS = ['image_urls', 'reference_image_urls', 'input_image_urls', 'image_url']
// Fields the app fills itself (see common() in src/shared/media.ts); any other required field means skip.
const FILLED = new Set(['prompt', 'aspect_ratio', 'resolution', 'duration', 'num_images', 'quality'])

async function inputSchema(endpoint) {
  const res = await fetch(`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const doc = await res.json()
  const op = doc.paths?.[`/${endpoint}`]?.post
  const ref = op?.requestBody?.content?.['application/json']?.schema?.$ref
  if (!ref) throw new Error('no input schema')
  return doc.components.schemas[ref.split('/').pop()]
}

/**
 * Flattens a property to the few JSON Schema keys the app reads. `anyOf: [X, null]` becomes X; a size that is
 * either a preset name or a {width, height} object keeps the presets and is typed 'object'.
 */
function flat(p) {
  const branches = (p.anyOf ?? [p]).filter((b) => b.type !== 'null')
  const branch = branches.find((b) => b.enum) ?? branches[0] ?? p
  const out = {}
  for (const k of ['type', 'enum', 'default', 'minimum', 'maximum', 'maxLength', 'maxItems']) {
    const v = k === 'default' ? p.default : (branch[k] ?? p[k])
    if (v !== undefined && v !== null) out[k] = v
  }
  if (branches.some((b) => b.$ref || b.type === 'object')) out.type = 'object'
  return out
}

function props(schema) {
  return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, v]) => [k, flat(v)]))
}

function durations(p) {
  if (!p) return null
  if (p.enum?.length) return { values: p.enum.map(Number).filter(Number.isFinite) }
  if (p.minimum != null && p.maximum != null) return { min: p.minimum, max: p.maximum }
  return null
}

function unfillable(required, field) {
  return required.filter((f) => f !== field && !FILLED.has(f))
}

const models = []
const warn = (endpoint, why) => console.warn(`skip ${endpoint}: ${why}`)

for (const e of IMAGE) {
  try {
    const base = await inputSchema(e.endpoint)
    const baseProps = props(base)
    const required = base.required ?? []
    const bad = unfillable(required, null)
    if (bad.length) {
      warn(e.endpoint, `needs ${bad.join(', ')}`)
      continue
    }
    const model = {
      endpoint: e.endpoint,
      name: e.name,
      family: e.family,
      kind: 'image',
      input: { field: null, mode: 'none', max: 0 },
      required,
      props: baseProps,
      durations: null,
      tags: [...(e.tags ?? [])]
    }
    if (e.edit) {
      try {
        const edit = await inputSchema(e.edit)
        const editProps = props(edit)
        const field = REF_FIELDS.find((f) => editProps[f])
        const editRequired = edit.required ?? []
        const badEdit = unfillable(editRequired, field)
        if (!field) warn(e.edit, 'no reference image field')
        else if (badEdit.length) warn(e.edit, `needs ${badEdit.join(', ')}`)
        else {
          const max = editProps[field].type === 'array' ? (editProps[field].maxItems ?? 4) : 1
          model.withRefs = { endpoint: e.edit, input: { field, mode: 'reference', max }, required: editRequired, props: editProps }
          model.tags.unshift('Referensi')
        }
      } catch (err) {
        warn(e.edit, err.message)
      }
    }
    models.push(model)
  } catch (err) {
    warn(e.endpoint, err.message)
  }
}

for (const e of VIDEO) {
  try {
    const s = await inputSchema(e.endpoint)
    const p = props(s)
    const field = IMAGE_FIELDS.find((f) => p[f])
    const required = s.required ?? []
    const bad = unfillable(required, field)
    if (!field) {
      warn(e.endpoint, 'no first-frame field')
      continue
    }
    if (bad.length) {
      warn(e.endpoint, `needs ${bad.join(', ')}`)
      continue
    }
    models.push({
      endpoint: e.endpoint,
      name: e.name,
      family: e.family,
      kind: 'video',
      input: { field, mode: 'first-frame', max: 1 },
      required,
      props: p,
      durations: durations(p.duration),
      tags: [...(e.tags ?? [])]
    })
  } catch (err) {
    warn(e.endpoint, err.message)
  }
}

const out = { source: 'fal.ai OpenAPI', fetchedAt: new Date().toISOString().slice(0, 10), models }
writeFileSync(new URL('../src/shared/fal-catalog.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`)
console.log(`fal-catalog.json: ${models.filter((m) => m.kind === 'image').length} image, ${models.filter((m) => m.kind === 'video').length} video models`)
