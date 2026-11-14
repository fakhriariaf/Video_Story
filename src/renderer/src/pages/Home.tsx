import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Copy, FolderOpen, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react'
import { DURATIONS, LANGUAGES, llmName } from '@shared/models'
import { getStyle } from '@shared/styles'
import type { AccountStatus, ApiProvider, AppSettings, AspectRatio, KeyStatus, ProjectStatus, ProjectSummary, TtsProvider } from '@shared/types'
import { AppRail } from '../components/AppRail'
import { FilmStrip } from '../components/FilmStrip'
import { Select, type SelectOption } from '../components/Select'
import { StyleSwatch } from '../components/StyleArt'
import { StyleMenu } from '../components/StyleMenu'
import { Badge, Button, IconButton, Menu, confirmDialog, cx } from '../components/ui'
import { errorText, mmss, relativeTime } from '../lib/format'
import { TTS_NAMES, ttsReadiness, usableTts } from '../lib/keys'
import { useServices } from '../lib/useServices'
import { useApp } from '../store/app'

const STATUS: Record<ProjectStatus, { label: string; tone: 'draft' | 'info' | 'warn' | 'ok' }> = {
  draft: { label: 'Draf', tone: 'draft' },
  script: { label: 'Naskah', tone: 'info' },
  storyboard: { label: 'Storyboard', tone: 'info' },
  editing: { label: 'Editing', tone: 'warn' },
  exported: { label: 'Diekspor', tone: 'ok' }
}

const FILTERS: { id: 'all' | 'draft' | 'progress' | 'exported'; label: string; match: (s: ProjectStatus) => boolean }[] = [
  { id: 'all', label: 'Semua', match: () => true },
  { id: 'draft', label: 'Draf', match: (s) => s === 'draft' },
  { id: 'progress', label: 'Dalam proses', match: (s) => s === 'script' || s === 'storyboard' || s === 'editing' },
  { id: 'exported', label: 'Diekspor', match: (s) => s === 'exported' }
]

const SUGGESTIONS = [
  'Asal-usul Sumpah Palapa dan bagaimana Gajah Mada menepatinya',
  'Misteri Segitiga Bermuda: fakta dan mitosnya',
  'Kenapa kucing suka masuk ke dalam kotak?'
]

/** "a, b dan c" */
function joinList(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} dan ${items[items.length - 1]}`
}

const ASPECTS: SelectOption<AspectRatio>[] = [
  { value: '16:9', label: '16:9 · YouTube', icon: <span className="block h-[10px] w-[17px] rounded-[2px] border border-edge" /> },
  { value: '9:16', label: '9:16 · Shorts', icon: <span className="mx-[3px] block h-[16px] w-[10px] rounded-[2px] border border-edge" /> }
]

export function Home() {
  const { go, toast } = useApp()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [accounts, setAccounts] = useState<AccountStatus[]>([])
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [query, setQuery] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [durationSec, setDurationSec] = useState(60)
  const [language, setLanguage] = useState('id')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [styleId, setStyleId] = useState('stickman')
  const [tts, setTts] = useState<TtsProvider>('gemini')
  const [creating, setCreating] = useState(false)

  const refresh = (): void => {
    window.api.projects
      .list()
      .then(setProjects)
      .catch((e) => toast('error', errorText(e)))
  }

  useEffect(() => {
    refresh()
    void window.api.settings.keys().then(setKeys)
    void window.api.auth.status().then(setAccounts)
    void window.api.settings.get().then((s) => {
      setAppSettings(s)
      setTts(s.defaultTtsProvider)
      setLanguage(s.defaultLanguage)
    })
    return window.api.on.auth((s) => setAccounts((list) => [...list.filter((a) => a.provider !== s.provider), s]))
  }, [])

  // Start on a narrator service that has a working key.
  useEffect(() => {
    if (appSettings && keys.length) setTts(usableTts(appSettings.defaultTtsProvider, keys))
  }, [appSettings, keys])

  const ttsOptions = useMemo((): SelectOption<TtsProvider>[] => {
    const ready = ttsReadiness(keys)
    return (['gemini', 'elevenlabs'] as const).map((p) => {
      const blocked = keys.length > 0 && !ready[p].ok
      return { value: p, label: TTS_NAMES[p], disabled: blocked, note: blocked ? `${ready[p].reason}. Atur di Pengaturan.` : undefined }
    })
  }, [keys])

  const setupIssues = useMemo(() => {
    if (!appSettings || !keys.length) return []
    // A key counts once it is saved and did not fail its last check.
    const ok = (p: ApiProvider): boolean => {
      const k = keys.find((x) => x.provider === p)
      return !!k?.configured && k.lastOk !== false
    }
    const issues: { what: string; blocks: string }[] = []
    // Images need any one image provider; new projects start on a provider that has a key.
    if (!ok('higgsfield') && !ok('fal') && !ok('gemini')) issues.push({ what: 'kunci Higgsfield, fal.ai, atau Gemini', blocks: 'gambar' })
    const llm = appSettings.llmProvider
    if (llm === 'chatgpt') {
      // ChatGPT is connected by signing in, and only counts once plan usage was allowed.
      const a = accounts.find((x) => x.provider === 'chatgpt')
      if (!a?.signedIn || a.needsReauth || a.planUsageAllowed === false) issues.push({ what: 'login ChatGPT', blocks: 'cerita' })
      else if (!appSettings.llmModels[llm]) issues.push({ what: `model ${llmName(llm)}`, blocks: 'cerita' })
    } else if (!ok(llm)) issues.push({ what: `kunci ${llmName(llm)}`, blocks: 'cerita' })
    else if (!appSettings.llmModels[llm]) issues.push({ what: `model ${llmName(llm)}`, blocks: 'cerita' })
    // Narration needs just one working voice service; every project can pick either one.
    const tts = ttsReadiness(keys)
    if (!tts.gemini.ok && !tts.elevenlabs.ok) issues.push({ what: 'kunci Gemini atau ElevenLabs', blocks: 'suara narator' })
    return issues
  }, [keys, accounts, appSettings])

  const services = useServices(appSettings, keys, accounts)

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!
    const q = query.trim().toLowerCase()
    return (projects ?? []).filter((p) => f.match(p.status) && (!q || p.title.toLowerCase().includes(q)))
  }, [projects, filter, query])

  const start = async (): Promise<void> => {
    setCreating(true)
    try {
      const b = await window.api.projects.create({ synopsis, durationSec, language, aspectRatio, styleId, ttsProvider: tts })
      go({ name: 'project', id: b.project.id })
    } catch (e) {
      toast('error', errorText(e))
      setCreating(false)
    }
  }

  const remove = async (p: ProjectSummary): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Hapus proyek?',
      body: `“${p.title}” beserta semua gambar, video, dan suaranya akan dihapus dari komputer ini. Tindakan ini tidak bisa dibatalkan.`,
      confirm: 'Hapus proyek',
      danger: true
    })
    if (!ok) return
    await window.api.projects.remove(p.id)
    refresh()
  }

  const duplicate = async (p: ProjectSummary): Promise<void> => {
    try {
      await window.api.projects.duplicate(p.id)
      refresh()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <div className="grid h-full grid-cols-[228px_minmax(0,1fr)]">
      <AppRail active="home" services={services} />

      <main className="scroll-thin min-h-0 overflow-y-auto">
        <div className="flex max-w-[1240px] flex-col px-11 pb-12 pt-9">
          {setupIssues.length > 0 && (
            <div className="mb-6 flex items-center gap-3 rounded-lg bg-sun-soft px-4 py-3 text-sm text-sun-ink">
              <AlertTriangle className="size-[18px] shrink-0" />
              <span className="flex-1">
                Sebelum mulai, atur dulu {joinList(setupIssues.map((i) => i.what))} di Pengaturan. Tanpa itu,{' '}
                {joinList([...new Set(setupIssues.map((i) => i.blocks))])} belum bisa dibuat.
              </span>
              <Button size="sm" variant="secondary" onClick={() => go({ name: 'settings', back: { name: 'home' } })}>
                Atur sekarang
              </Button>
            </div>
          )}

          <h1 className="font-display text-[52px] font-semibold leading-none">Mau bikin video apa hari ini?</h1>
          <p className="mt-2.5 text-base text-muted">Tulis idenya. AI menyusun adegan, naskah, dan suaranya, lalu kamu merapikannya di editor.</p>

          <div className="mt-6 flex flex-col gap-3 rounded-[14px] border border-line-2 bg-panel px-5 pb-4 pt-[18px]">
            <label htmlFor="ide" className="sr-only">
              Ide cerita atau sinopsis
            </label>
            <textarea
              id="ide"
              rows={3}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="Contoh: Gajah Mada bersumpah tidak akan menikmati palapa sebelum Nusantara bersatu. Para menteri menertawakannya, tapi dia membuktikannya…"
              className="resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-faint"
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
              <Select
                variant="pill"
                label="Durasi"
                value={durationSec}
                onChange={setDurationSec}
                options={DURATIONS.map((d) => ({ value: d.sec, label: d.label }))}
              />
              <Select
                variant="pill"
                label="Bahasa"
                value={language}
                onChange={setLanguage}
                options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                menuWidth={200}
              />
              <Select variant="pill" label="Format" value={aspectRatio} onChange={setAspectRatio} options={ASPECTS} menuWidth={200} />
              <StyleMenu value={styleId} onChange={setStyleId} />
              <Select variant="pill" label="Suara narator" value={tts} onChange={setTts} options={ttsOptions} menuWidth={280} />
              {/* ml-auto keeps the action on the right edge, also when the row wraps in a narrow window. */}
              <Button variant="primary" size="lg" className="ml-auto px-7" loading={creating} onClick={() => void start()}>
                Mulai
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13.5px] text-muted">
            <span>Coba ide ini:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSynopsis(s)}
                className="h-8 rounded-full border border-dashed border-line-3 px-3 text-[13.5px] text-fg-2 hover:border-edge hover:text-fg"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="mb-3 mt-9 flex items-end gap-5">
            <h2 className="font-display text-[28px] font-semibold leading-none">Proyek kamu</h2>
            <div className="flex gap-[18px] pb-px" role="group" aria-label="Saring proyek">
              {FILTERS.map((f) => {
                const count = (projects ?? []).filter((p) => f.match(p.status)).length
                const on = filter === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(f.id)}
                    className={cx('border-b-2 pb-1 text-[14.5px]', on ? 'border-sun font-semibold text-fg' : 'border-transparent text-muted hover:text-fg')}
                  >
                    {f.label} {count}
                  </button>
                )
              })}
            </div>
            <div className="flex-1" />
            <label className="flex h-9 w-[240px] items-center gap-2 rounded-lg border border-line-2 bg-panel px-3 text-muted">
              <Search className="size-4" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari proyek"
                aria-label="Cari proyek"
                className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-faint"
              />
            </label>
          </div>

          <FilmStrip>
            <button
              type="button"
              onClick={() => void start()}
              className="flex min-h-[190px] flex-col items-center justify-center gap-2.5 rounded-md border border-dashed border-line-3 text-fg-2 hover:border-edge hover:bg-panel"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-accent text-canvas">
                <Plus className="size-5" strokeWidth={2.4} />
              </span>
              <span className="text-[15px] font-semibold text-fg">Proyek baru</span>
            </button>

            {visible.map((p) => {
              const st = STATUS[p.status]
              return (
                <article key={p.id} className="flex flex-col overflow-hidden rounded-md bg-panel">
                  <button type="button" onClick={() => go({ name: 'project', id: p.id })} className="text-left">
                    <div className="relative aspect-video w-full overflow-hidden">
                      {p.coverUrl ? (
                        <img src={p.coverUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <StyleSwatch styleId={p.styleId} className="size-full" iconSize={40} />
                      )}
                      <span className="absolute left-2 top-2 rounded bg-strip/80 px-2 py-0.5 text-xs font-medium text-fg">{getStyle(p.styleId).name}</span>
                      {p.totalMs > 0 && (
                        <span className="absolute bottom-2 right-2 rounded bg-strip/85 px-1.5 font-display text-[15px] font-semibold tracking-wide text-fg">
                          {mmss(p.totalMs)}
                        </span>
                      )}
                    </div>
                    <div className="truncate px-3 pt-2.5 text-[15.5px] font-semibold">{p.title}</div>
                  </button>
                  <div className="flex items-center gap-2 pb-1.5 pl-3 pr-1.5 pt-0.5">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className="truncate text-[13px] text-muted">{relativeTime(p.updatedAt)}</span>
                    <div className="flex-1" />
                    <Menu
                      trigger={(open) => (
                        <IconButton label="Opsi proyek" onClick={open} className="border-transparent bg-transparent" size={32}>
                          <MoreHorizontal className="size-[18px]" />
                        </IconButton>
                      )}
                      items={[
                        { label: 'Buka', icon: <FolderOpen className="size-4" />, run: () => go({ name: 'project', id: p.id }) },
                        { label: 'Duplikat', icon: <Copy className="size-4" />, run: () => void duplicate(p) },
                        { label: 'Hapus', icon: <Trash2 className="size-4" />, danger: true, run: () => void remove(p) }
                      ]}
                    />
                  </div>
                </article>
              )
            })}
          </FilmStrip>
          {projects && projects.length === 0 && <p className="mt-3 text-sm text-muted">Belum ada proyek. Tulis ide di atas lalu klik Mulai.</p>}
          {projects && projects.length > 0 && visible.length === 0 && (
            <p className="mt-3 text-sm text-muted">Tidak ada proyek yang cocok dengan saringan atau pencarian ini.</p>
          )}
        </div>
      </main>
    </div>
  )
}
