import { useEffect, useState } from 'react'
import type { AspectRatio, CreditEstimate } from '@shared/types'

/**
 * The provider's price for one request. undefined while loading, null when it cannot be estimated (no key,
 * offline). Pass enabled=false to skip asking, e.g. while the provider has no key.
 */
export function useEstimate(
  kind: 'image' | 'video',
  modelId: string,
  aspect: AspectRatio,
  seconds?: number,
  resolution?: string | null,
  enabled = true
): CreditEstimate | null | undefined {
  // The answer is kept with the inputs it belongs to, so a price for the previous model is never shown.
  const key = `${kind}|${modelId}|${aspect}|${seconds ?? ''}|${resolution ?? ''}|${enabled}`
  const [state, setState] = useState<{ key: string; value: CreditEstimate | null }>({ key: '', value: null })
  useEffect(() => {
    if (!enabled) return setState({ key, value: null })
    let alive = true
    window.api.generate
      .estimate(kind, modelId, aspect, seconds, resolution)
      .then((v) => alive && setState({ key, value: v }))
      .catch(() => alive && setState({ key, value: null }))
    return () => {
      alive = false
    }
  }, [key])
  return state.key === key ? state.value : undefined
}

/**
 * Estimates for a whole list of models, filled in as they arrive (three requests at a time).
 * Results are cached in the main process, so reopening a picker is instant.
 */
export function useEstimates(
  kind: 'image' | 'video',
  ids: string[],
  aspect: AspectRatio,
  seconds: number | undefined,
  enabled: boolean
): Record<string, CreditEstimate | null> {
  const context = `${kind}|${aspect}|${seconds ?? ''}|${ids.join(',')}`
  const [state, setState] = useState<{ context: string; map: Record<string, CreditEstimate | null> }>({ context, map: {} })

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const queue = [...ids]
    const worker = async (): Promise<void> => {
      while (alive && queue.length) {
        const id = queue.shift()!
        const value = await window.api.generate.estimate(kind, id, aspect, seconds).catch(() => null)
        if (!alive) return
        setState((s) => ({ context, map: { ...(s.context === context ? s.map : {}), [id]: value } }))
      }
    }
    void Promise.all([worker(), worker(), worker()])
    return () => {
      alive = false
    }
  }, [context, enabled])

  return state.context === context ? state.map : {}
}
