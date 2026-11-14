import { useEffect, useMemo, useState } from 'react'
import { serviceSummary, type ServiceLine } from '@shared/services'
import type { AccountStatus, AppSettings, KeyStatus } from '@shared/types'

/** The "Layanan AI" lines of the app rail, from data the page already loaded plus the Whisper model state. */
export function useServices(settings: AppSettings | null, keys: KeyStatus[], accounts: AccountStatus[]): ServiceLine[] {
  // null until the first answer: a line must not read "not ready" just because its data is still on the way.
  const [whisperReady, setWhisperReady] = useState<boolean | null>(null)
  useEffect(() => {
    window.api.whisper
      .status()
      .then((s) => setWhisperReady(s.state === 'ready'))
      .catch(() => setWhisperReady(false))
    return window.api.on.whisper((s) => setWhisperReady(s.state === 'ready'))
  }, [])
  return useMemo(
    // The key list always has one row per provider once loaded, so an empty list means "still loading".
    () => (settings && keys.length && whisperReady !== null ? serviceSummary({ settings, keys, accounts, whisperReady }) : []),
    [settings, keys, accounts, whisperReady]
  )
}
