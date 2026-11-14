import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBatcher, falPricingUrl, loadFalPrices, type FalPrice } from './fal-prices'
import { ApiError } from './http'

const price = (id: string): FalPrice => ({ endpoint_id: id, unit_price: 0.04, unit: 'image' })
const noWait = async (): Promise<void> => {}

test('falPricingUrl asks for several endpoints in one request', () => {
  assert.equal(
    falPricingUrl(['fal-ai/flux-2-pro', 'google/nano-banana-2.1']),
    'https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai%2Fflux-2-pro&endpoint_id=google%2Fnano-banana-2.1'
  )
})

test('prices asked for at the same moment travel in one request', async () => {
  const calls: string[][] = []
  const get = createBatcher<string>(
    async (keys) => {
      calls.push(keys)
      return new Map(keys.map((k) => [k, k.toUpperCase()]))
    },
    { max: 50, waitMs: 5 }
  )
  // The model picker asks for every model at once; 25 separate requests is what fal.ai refused.
  const ids = Array.from({ length: 25 }, (_, i) => `model-${i}`)
  const out = await Promise.all([...ids, 'model-0'].map((id) => get(id)))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].length, 25)
  assert.equal(out[3], 'MODEL-3')
  assert.equal(out[25], 'MODEL-0')
})

test('a batch never exceeds the size the API accepts', async () => {
  const calls: number[] = []
  const get = createBatcher<number>(
    async (keys) => {
      calls.push(keys.length)
      return new Map(keys.map((k) => [k, 1]))
    },
    { max: 50, waitMs: 5 }
  )
  await Promise.all(Array.from({ length: 120 }, (_, i) => get(`m${i}`)))
  assert.deepEqual(calls, [50, 50, 20])
})

test('a key the loader does not return resolves to undefined, and a failed load rejects every waiter', async () => {
  const get = createBatcher<number>(async (keys) => new Map(keys.filter((k) => k !== 'gone').map((k) => [k, 1])), { max: 50, waitMs: 5 })
  assert.deepEqual(await Promise.all([get('a'), get('gone')]), [1, undefined])

  const failing = createBatcher<number>(
    async () => {
      throw new Error('down')
    },
    { max: 50, waitMs: 5 }
  )
  const results = await Promise.allSettled([failing('a'), failing('b')])
  assert.deepEqual(
    results.map((r) => r.status),
    ['rejected', 'rejected']
  )
})

test('a later request starts a new batch', async () => {
  let calls = 0
  const get = createBatcher<number>(
    async (keys) => {
      calls++
      return new Map(keys.map((k) => [k, calls]))
    },
    { max: 50, waitMs: 5 }
  )
  assert.equal(await get('a'), 1)
  assert.equal(await get('a'), 2)
})

test('loadFalPrices waits and tries again when fal.ai is rate limiting', async () => {
  let calls = 0
  const waits: number[] = []
  const out = await loadFalPrices(
    ['a', 'b'],
    async (ids) => {
      if (++calls < 3) throw new ApiError('Terlalu banyak permintaan', 429, true)
      return ids.map(price)
    },
    async (ms) => {
      waits.push(ms)
    }
  )
  assert.equal(calls, 3)
  assert.equal(waits.length, 2)
  assert.ok(waits[1] > waits[0])
  assert.deepEqual([...out.keys()], ['a', 'b'])
})

test('loadFalPrices gives up after a few rate-limited tries', async () => {
  let calls = 0
  await assert.rejects(
    loadFalPrices(
      ['a'],
      async () => {
        calls++
        throw new ApiError('Terlalu banyak permintaan', 429, true)
      },
      noWait
    ),
    /Terlalu banyak/
  )
  assert.equal(calls, 4)
})

test('one endpoint fal.ai does not know does not hide the prices of the others', async () => {
  const asked: string[][] = []
  const out = await loadFalPrices(
    ['good-1', 'unknown', 'good-2'],
    async (ids) => {
      asked.push(ids)
      if (ids.includes('unknown')) throw new ApiError('fal.ai menolak isian', 422)
      return ids.map(price)
    },
    noWait
  )
  // The refused batch is asked again one endpoint at a time, in order, never in parallel.
  assert.deepEqual(asked, [['good-1', 'unknown', 'good-2'], ['good-1'], ['unknown'], ['good-2']])
  assert.deepEqual([...out.keys()], ['good-1', 'good-2'])
})

test('a bad key or an empty balance is reported, not retried one by one', async () => {
  let calls = 0
  await assert.rejects(
    loadFalPrices(
      ['a', 'b'],
      async () => {
        calls++
        throw new ApiError('Kunci fal.ai tidak valid', 401)
      },
      noWait
    ),
    /tidak valid/
  )
  assert.equal(calls, 1)
})
