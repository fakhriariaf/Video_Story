import { useEffect, useMemo, useState } from 'react'
import { serviceSummary, type ServiceLine } from '@shared/services'
import type { AccountStatus, AppSettings, KeyStatus } from '@shared/types'

/** The "Layanan AI" lines of the app rail, from data the page already loaded plus the Whisper model state. */
export function useServices(settings: AppSettings | null, keys: KeyStatus[], accounts: AccountStatus[]): ServiceLine[] {
  const [whisperReady, setWhisperReady] = useState(false)
  useEffect(() => {
    void window.api.whisper.status().then((s) => setWhisperReady(s.state === 'ready'))
    return window.api.on.whisper((s) => setWhisperReady(s.state === 'ready'))
  }, [])
  return useMemo(() => (settings ? serviceSummary({ settings, keys, accounts, whisperReady }) : []), [settings, keys, accounts, whisperReady])
}
