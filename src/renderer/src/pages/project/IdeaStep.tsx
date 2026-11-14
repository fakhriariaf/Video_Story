import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Play, Sparkles, Square } from 'lucide-react'
import { MEDIA_PROVIDERS } from '@shared/media'
import { DURATIONS, LANGUAGES, clipCountFor, llmName } from '@shared/models'
import type { KeyStatus, LlmProvider, TtsProvider, VoiceOption } from '@shared/types'
import { Select } from '../../components/Select'
import { Button, Chip, Segmented, confirmDialog, cx } from '../../components/ui'
import { WorkNote } from '../../components/WorkNote'
import { errorText } from '../../lib/format'
import { geminiPreview } from '../../lib/voicePreviews'
import { TTS_NAMES, ttsReadiness, usableTts } from '../../lib/keys'
import { useApp } from '../../store/app'
import { useProject } from '../../store/project'
import { IdeaSlate } from './IdeaSlate'
import { ModelSection } from './ModelSection'
import { StyleStrip } from './StyleStrip'

/** One sample plays at a time, from the list rows or the button beside the picker. */
function usePreviewPlayer(): { playing: string | null; toggle: (id: string, url: string) => void } {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  useEffect(() => () => audio.current?.pause(), [])
  return {
    playing,
    toggle: (id, url) => {
      audio.current?.pause()
      if (playing === id) return setPlaying(null)
      const a = new Audio(url)
      a.onended = () => setPlaying(null)
      audio.current = a
      setPlaying(id)
      void a.play().catch(() => setPlaying(null))
    }
  }
}

function VoicePicker({
  provider,
  value,
  onChange,
  onName
}: {
  provider: TtsProvider
  value: string
  onChange: (v: string) => void
  /** Tells the page the chosen voice's name once the list is known (the project only stores its id). */
  onName?: (name: string | null) => void
}) {
  const [voices, setVoices] = useState<VoiceOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const player = usePreviewPlayer()

  useEffect(() => {
    setVoices(null)
    setError(null)
    window.api.settings
      .voices(provider)
      .then((list) => {
        // Gemini samples ship with the app; ElevenLabs sends its own preview links.
        const v = provider === 'gemini' ? list.map((x) => ({ ...x, previewUrl: x.previewUrl ?? geminiPreview(x.id, x.name) })) : list
        setVoices(v)
        if (!v.some((x) => x.id === value) && v[0]) onChange(v[0].id)
      })
      .catch((e) => setError(errorText(e)))
  }, [provider])

  const urlOf = (id: string): string | null => voices?.find((v) => v.id === id)?.previewUrl ?? null
  const current = voices?.find((v) => v.id === value)
  useEffect(() => onName?.(current?.name ?? null), [current?.name])

  const playButton = (id: string, size: 'row' | 'field') => {
    const url = urlOf(id)
    if (!url) return null
    const on = player.playing === id
    return (
      <button
        type="button"
        aria-label={on ? 'Hentikan contoh suara' : 'Dengarkan contoh suara'}
        title={on ? 'Hentikan' : 'Dengarkan contoh'}
        onClick={() => player.toggle(id, url)}
        className={cx(
          'flex shrink-0 items-center justify-center rounded-full border transition-colors',
          size === 'row' ? 'size-7' : 'size-12 rounded-lg',
          on ? 'border-accent bg-accent-soft text-fg' : 'border-line-2 bg-panel text-fg hover:border-edge'
        )}
      >
        {on ? <Square className="size-3.5" fill="currentColor" /> : <Play className="ml-px size-3.5" fill="currentColor" />}
      </button>
    )
  }

  if (error) return <p className="flex h-12 flex-1 items-center rounded-lg bg-bad-soft px-3.5 text-[13px] text-bad-ink">{error}</p>
  return (
    <>
      <Select
        label="Suara narator"
        size="lg"
        value={value}
        onChange={onChange}
        disabled={!voices}
        className="flex-1"
        menuWidth={380}
        renderAction={(o) => playButton(o.value, 'row')}
        options={
          voices
            ? voices.map((v) =>
                // Gemini tones are short; ElevenLabs labels are longer, so they go on a second line.
                provider === 'gemini' ? { value: v.id, label: v.name, hint: v.description || undefined } : { value: v.id, label: v.name, note: v.description || undefined }
              )
            : [{ value, label: 'Memuat daftar suara…' }]
        }
      />
      {current && playButton(current.id, 'field')}
    </>
  )
}

export function IdeaStep() {
  const { project, clips, updateProject, flush, load } = useProject()
  const { toast, go } = useApp()
  const [busy, setBusy] = useState(false)
  const [writer, setWriter] = useState<{ provider: LlmProvider; model: string } | null>(null)
  // null until the key list arrives; a failed load counts as "no keys" so nothing waits forever.
  const [loadedKeys, setKeys] = useState<KeyStatus[] | null>(null)
  const keys = loadedKeys ?? []
  const [voiceName, setVoiceName] = useState<string | null>(null)

  useEffect(() => {
    void window.api.settings.get().then((s) => setWriter({ provider: s.llmProvider, model: s.llmModels[s.llmProvider] }))
    window.api.settings
      .keys()
      .then(setKeys)
      .catch(() => setKeys([]))
  }, [])

  // Before any narration exists, move to a narrator service that has a working key.
  const hasVoice = clips.some((c) => c.audioAssetId)
  useEffect(() => {
    if (!project || !keys.length || hasVoice) return
    const use = usableTts(project.ttsProvider, keys)
    if (use !== project.ttsProvider) updateProject({ ttsProvider: use, ttsVoice: use === 'gemini' ? 'Charon' : '' })
  }, [keys, project?.id])

  // Providers with a saved key; null while loading, so nothing claims "no key" too early.
  const mediaKeys = useMemo(
    () => (loadedKeys ? new Set(MEDIA_PROVIDERS.filter((m) => loadedKeys.find((k) => k.provider === m)?.configured)) : null),
    [loadedKeys]
  )

  if (!project) return null
  const ready = ttsReadiness(keys)
  const blocked = keys.length ? (['gemini', 'elevenlabs'] as const).filter((p) => !ready[p].ok) : []
  const openSettings = async (): Promise<void> => {
    await flush()
    go({ name: 'settings', back: { name: 'project', id: project.id } })
  }

  const clipCount = clipCountFor(project.durationSec)
  const perClip = Math.round(project.durationSec / clipCount)

  const compose = async (): Promise<void> => {
    if (!project.synopsis.trim()) {
      toast('error', 'Tulis ide cerita atau sinopsis dulu.')
      return
    }
    if (clips.length) {
      const ok = await confirmDialog({
        title: 'Susun ulang naskah?',
        body: `Proyek ini sudah punya ${clips.length} adegan. Menyusun ulang akan mengganti semua adegan beserta naskahnya. Pemeran tetap ada, sedangkan gambar dan suara lama tersimpan di riwayat tapi tidak lagi terpasang.`,
        confirm: 'Susun ulang'
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      await flush()
      const bundle = await window.api.story.script(project.id)
      load(bundle)
      toast('success', `${bundle.clips.length} adegan siap. Baca dan rapikan naskahnya dulu.`)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative h-full">
      <div className="scroll-thin h-full overflow-y-auto pb-28">
        <div className="mx-auto grid max-w-[1320px] grid-cols-[minmax(0,1fr)_372px] items-start gap-7 px-11 pt-8">
          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <h1 className="font-display text-[44px] font-semibold leading-none">Ceritakan idemu</h1>
              <p className="mt-2 text-[15px] text-muted">Sebut tokoh, tempat, dan akhir ceritanya. Makin jelas, makin rapi susunan adegan dari AI.</p>
            </div>

            <div className="flex flex-col gap-2 rounded-[14px] border border-line-2 bg-panel px-[18px] pb-3 pt-4 focus-within:border-accent">
              <label htmlFor="sinopsis" className="sr-only">
                Ide cerita atau sinopsis
              </label>
              <textarea
                id="sinopsis"
                rows={4}
                value={project.synopsis}
                maxLength={4000}
                onChange={(e) => updateProject({ synopsis: e.target.value })}
                placeholder="Tahun 1336 di istana Majapahit. Gajah Mada bersumpah tidak akan menikmati palapa sebelum Nusantara bersatu…"
                className="resize-none bg-transparent text-[17px] leading-relaxed outline-none placeholder:text-faint"
              />
              <div className="flex items-center justify-between gap-4 border-t border-line pt-2.5 text-[13px] text-muted">
                <span>Tulis juga suasana yang kamu mau, misalnya tegang, lucu, atau haru.</span>
                <span className="shrink-0 font-mono text-xs">{project.synopsis.length.toLocaleString('id-ID')} / 4.000</span>
              </div>
            </div>

            <div className="@container rounded-[14px] border border-line-2 bg-panel px-4 py-3.5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 @3xl:grid-cols-[1.75fr_1.4fr_1.15fr_1.6fr]">
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-sm font-semibold">Durasi</span>
                  <div className="flex flex-wrap gap-1.5">
                    {DURATIONS.map((d) => (
                      <Chip key={d.sec} on={project.durationSec === d.sec} onClick={() => updateProject({ durationSec: d.sec })} className="px-2.5">
                        {d.label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-sm font-semibold">Format</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: '16:9', label: '16:9 YouTube', title: 'Mendatar, untuk YouTube' },
                        { id: '9:16', label: '9:16 Shorts', title: 'Tegak, untuk Shorts, Reels, dan TikTok' }
                      ] as const
                    ).map((f) => (
                      <Chip key={f.id} on={project.aspectRatio === f.id} title={f.title} onClick={() => updateProject({ aspectRatio: f.id })} className="px-2.5">
                        {f.label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-sm font-semibold">Bahasa</span>
                  <Select
                    label="Bahasa naskah dan suara"
                    value={project.language}
                    onChange={(v) => updateProject({ language: v })}
                    options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-sm font-semibold">Suara narator</span>
                  <Segmented
                    size="sm"
                    value={project.ttsProvider}
                    onChange={(v) => updateProject({ ttsProvider: v, ttsVoice: v === 'gemini' ? 'Charon' : '' })}
                    options={(['gemini', 'elevenlabs'] as const).map((p) => ({
                      id: p,
                      label: TTS_NAMES[p],
                      disabled: blocked.includes(p),
                      title: ready[p].reason ?? undefined
                    }))}
                  />
                  <div className="flex items-center gap-2">
                    <VoicePicker
                      provider={project.ttsProvider}
                      value={project.ttsVoice}
                      onChange={(v) => updateProject({ ttsVoice: v })}
                      onName={setVoiceName}
                    />
                  </div>
                </div>
              </div>
              {blocked.length > 0 && (
                <p className="mt-3 border-t border-line pt-2.5 text-[13px] text-muted">
                  {blocked.length === 2
                    ? 'Belum ada kunci suara narator yang valid, jadi suara belum bisa dibuat.'
                    : `${ready[blocked[0]].reason}, jadi ${TTS_NAMES[blocked[0]]} belum bisa dipilih.`}{' '}
                  <button type="button" onClick={() => void openSettings()} className="font-semibold text-link hover:underline">
                    Atur di Pengaturan
                  </button>
                </p>
              )}
            </div>

            <StyleStrip value={project.styleId} onChange={(id) => updateProject({ styleId: id })} />

            <ModelSection
              project={project}
              perClip={perClip}
              keys={mediaKeys}
              onChange={(patch) => {
                updateProject(patch)
                // New projects start with the models picked last; resolution stays with this project.
                if (!('videoResolution' in patch)) void window.api.settings.set(patch)
              }}
            />
          </div>

          {/* The slate follows the scroll only in a window tall enough to show all of it above the footer. */}
          <div className="[@media(min-height:880px)]:sticky [@media(min-height:880px)]:top-0">
            <IdeaSlate project={project} voiceName={voiceName} hasKey={(m) => (mediaKeys ? mediaKeys.has(m) : null)} />
          </div>
        </div>
      </div>

      <footer className="absolute inset-x-0 bottom-0 flex h-[78px] items-center gap-3 border-t border-line bg-panel px-11">
        {busy && <WorkNote title={`AI sedang menyusun ${clipCount} adegan…`} typicalSec={60} />}
        <div className={cx('min-w-0 flex-col gap-0.5', busy ? 'hidden' : 'flex')}>
          <span className="truncate text-[15px] font-semibold">Naskah disusun oleh {writer ? llmName(writer.provider) : '…'}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <Bot className="size-3.5" />
            <span className={cx('font-mono', writer && !writer.model && 'text-link')}>{writer ? writer.model || 'model belum dipilih' : '…'}</span>
            <button type="button" onClick={() => void openSettings()} className="font-semibold text-link hover:underline">
              Ganti
            </button>
          </span>
        </div>
        <div className="flex-1" />
        {clips.length > 0 && !busy && (
          <Button size="lg" onClick={() => updateProject({ step: 2 })}>
            Lihat naskah
          </Button>
        )}
        <Button variant="primary" size="lg" loading={busy} icon={!busy && <Sparkles className="size-[18px]" />} onClick={() => void compose()}>
          {busy ? 'Menyusun naskah…' : clips.length ? 'Susun ulang naskah' : 'Susun naskah'}
        </Button>
      </footer>
    </div>
  )
}
