import { ApiError } from './http'

/**
 * How fal.ai prices are fetched, kept apart from the network code so it can be unit tested.
 *
 * The model pickers ask for the price of every fal model at once. One request per model got the account rate limited
 * (HTTP 429) and left most prices empty, so prices asked for together now travel in one request: the pricing API
 * takes up to 50 endpoints per call.
 */

export interface FalPrice {
  endpoint_id: string
  unit_price: number
  unit: string
}

/** The pricing API accepts 1 to 50 endpoint ids per request. */
export const FAL_PRICE_BATCH = 50

export function falPricingUrl(endpoints: string[]): string {
  return `https://api.fal.ai/v1/models/pricing?${endpoints.map((e) => `endpoint_id=${encodeURIComponent(e)}`).join('&')}`
}

/**
 * Groups lookups made within `waitMs` of each other into one `load` call (several when there are more than `max`).
 * A key the loader does not return resolves to undefined; a failed load rejects everyone who was waiting on it.
 * Nothing is remembered between batches: the caller owns the cache.
 */
export function createBatcher<V>(
  load: (keys: string[]) => Promise<Map<string, V>>,
  opts: { max: number; waitMs: number }
): (key: string) => Promise<V | undefined> {
  type Waiter = { resolve: (v: V | undefined) => void; reject: (e: unknown) => void }
  let pending = new Map<string, Waiter[]>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = async (): Promise<void> => {
    const batch = pending
    pending = new Map()
    timer = null
    const keys = [...batch.keys()]
    // One request after the other: the point of batching is to stay under the rate limit.
    for (let i = 0; i < keys.length; i += opts.max) {
      const part = keys.slice(i, i + opts.max)
      try {
        const found = await load(part)
        for (const k of part) for (const w of batch.get(k)!) w.resolve(found.get(k))
      } catch (e) {
        for (const k of part) for (const w of batch.get(k)!) w.reject(e)
      }
    }
  }

  return (key) =>
    new Promise((resolve, reject) => {
      const waiters = pending.get(key)
      if (waiters) waiters.push({ resolve, reject })
      else pending.set(key, [{ resolve, reject }])
      timer ??= setTimeout(() => void flush(), opts.waitMs)
    })
}

/** Errors that say something about the account, not about one endpoint: asking again per endpoint cannot help. */
const accountError = (e: unknown): boolean => e instanceof ApiError && (e.status === 401 || e.status === 402 || e.status === 403)
const retryable = (e: unknown): boolean => e instanceof ApiError && e.retryable

async function patiently<T>(run: () => Promise<T>, wait: (ms: number) => Promise<void>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (e) {
      if (!retryable(e) || attempt >= 3) throw e
      await wait(2000 + attempt * 3000)
    }
  }
}

/**
 * Prices for `endpoints` in one request, waiting and retrying while fal.ai is rate limiting. When fal.ai refuses the
 * whole batch because of one endpoint, the endpoints are asked again one at a time so the others still get a price.
 */
export async function loadFalPrices(
  endpoints: string[],
  fetchPage: (endpoints: string[]) => Promise<FalPrice[]>,
  wait: (ms: number) => Promise<void>
): Promise<Map<string, FalPrice>> {
  const out = new Map<string, FalPrice>()
  const keep = (list: FalPrice[]): void => {
    for (const p of list) if (endpoints.includes(p.endpoint_id)) out.set(p.endpoint_id, p)
  }
  try {
    keep(await patiently(() => fetchPage(endpoints), wait))
    return out
  } catch (e) {
    if (endpoints.length === 1 || accountError(e) || retryable(e)) throw e
  }
  for (const endpoint of endpoints) {
    try {
      keep(await patiently(() => fetchPage([endpoint]), wait))
    } catch (e) {
      if (accountError(e) || retryable(e)) throw e
      // fal.ai does not price this endpoint; it stays without an estimate.
    }
  }
  return out
}
