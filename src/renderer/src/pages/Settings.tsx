import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Info,
  KeyRound,
  Mic,
  SlidersHorizontal,
  Trash2
} from 'lucide-react'
import { defaultMediaProvider, IMAGE_MODELS, mediaModelOptions, providerDefaults, VIDEO_MODELS, type MediaProvider } from '@shared/media'
import { LANGUAGES, LLM_PROVIDERS } from '@shared/models'
import type { AccountStatus, ApiProvider, AppSettings, KeyStatus, KeyTestResult, LlmProvider, TtsProvider } from '@shared/types'
import { ChatGptAccount } from '../components/ChatGptAccount'
import { Logo } from '../components/Logo'
import { ModelLogo } from '../components/ModelLogo'
import { ModelPicker } from '../components/ModelPicker'
import { ProviderLogo, type ProviderLogoId } from '../components/ProviderLogo'
import { Select } from '../components/Select'
import { AboutSection } from './AboutSection'
import { WhisperSection } from './WhisperSection'
import { Badge, Button, Field, IconButton, confirmDialog, cx, inputCls } from '../components/ui'
import { errorText, relativeTime } from '../lib/format'
import { useModels } from '../lib/useModels'
import { useApp } from '../store/app'

type Tab = 'services' | 'general' | 'about'

interface ProviderOption<T extends string> {
  id: T
  name: string
  note: string
  logo: ProviderLogoId
  /** A saved API key, or an account sign-in for services connected by login. */
  status?: KeyStatus | AccountStatus
}

function StatusBadge({ status }: { status?: KeyStatus | AccountStatus }) {
  if (status && 'signedIn' in status) {
    if (status.needsReauth) return <Badge tone="bad">Perlu login ulang</Badge>
    if (!status.signedIn) return <Badge tone="draft">Belum login</Badge>
    if (status.planUsageAllowed === false) return <Badge tone="bad">Izin paket belum ada</Badge>
    return (
      <Badge tone="ok">
        <Check className="size-3" strokeWidth={3} />
        Masuk
      </Badge>
    )
  }
  if (!status?.configured) return <Badge tone="draft">Belum diatur</Badge>
  if (status.lastOk === false) return <Badge tone="bad">Gagal terhubung</Badge>
  if (status.lastOk)
    return (
      <Badge tone="ok">
        <Check className="size-3" strokeWidth={3} />
        Terhubung
      </Badge>
    )
  return <Badge tone="info">Tersimpan</Badge>
}

/** One dropdown to choose which provider a section uses; only that provider's settings are shown below it. */
function ProviderSelect<T extends string>({ value, options, onChange }: { value: T; options: ProviderOption<T>[]; onChange: (id: T) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  const cur = options.find((o) => o.id === value) ?? options[0]
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx(
          'flex w-full items-center gap-3 rounded-[14px] border border-edge bg-panel px-4 py-3 text-left transition-shadow',
          open ? 'shadow-none' : ''
        )}
      >
        <ProviderLogo id={cur.logo} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-bold">{cur.name}</span>
          <span className="truncate text-[13px] text-fg-2">{cur.note}</span>
        </span>
        <StatusBadge status={cur.status} />
        <ChevronDown className={cx('size-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" className="absolute inset-x-0 top-full z-40 mt-1.5 flex flex-col gap-0.5 rounded-[14px] border border-edge bg-panel p-1.5 shadow-pop">
          {options.map((o) => {
            const on = o.id === value
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  setOpen(false)
                  if (!on) onChange(o.id)
                }}
                className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', on ? 'bg-accent-soft' : 'hover:bg-raised')}
              >
                <ProviderLogo id={o.logo} size={36} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-semibold">{o.name}</span>
                  <span className="truncate text-[13px] text-fg-2">{o.note}</span>
                </span>
                <StatusBadge status={o.status} />
                <span className="flex size-5 shrink-0 items-center justify-center">{on && <Check className="size-4 text-accent" strokeWidth={2.6} />}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** API key field(s) with save, test and delete. The custom endpoint also takes a base URL. */
function KeyForm({
  provider,
  name,
  status,
  label = 'API key',
  placeholder = 'Tempel API key',
  hint,
  help,
  link,
  linkLabel,
  customUrl,
  onChanged,
  onSaved
}: {
  provider: ApiProvider
  name: string
  status?: KeyStatus
  label?: string
  placeholder?: string
  hint?: ReactNode
  help: string
  link: string | null
  linkLabel: string
  customUrl?: string
  onChanged: () => void
  onSaved?: (r: KeyTestResult) => void
}) {
  const { toast } = useApp()
  const configured = !!status?.configured
  const isCustom = provider === 'custom'
  const preview = status?.preview ?? null
  const [editing, setEditing] = useState(!preview)
  const [key, setKey] = useState('')
  const [url, setUrl] = useState(customUrl ?? '')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [showTyped, setShowTyped] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'login' | null>(null)

  // A newly saved or removed key puts the field back in its resting state.
  useEffect(() => {
    setEditing(!preview)
    setKey('')
    setRevealed(null)
  }, [preview])

  // The stored key is shown masked; the custom endpoint keeps an editable (optional) key field.
  const showStored = !isCustom && !editing && !!preview
  const urlChanged = isCustom && url.trim() !== (customUrl ?? '').trim()
  const canSave = isCustom ? !!url.trim() && (urlChanged || !!key.trim() || !configured) : !showStored && !!key.trim()
  // A pasted key only counts once it is saved; Enter saves it too.
  const unsaved = !isCustom && !showStored && !!key.trim() && busy !== 'save'
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter' || !canSave || busy) return
    e.preventDefault()
    void save()
  }

  const save = async (): Promise<void> => {
    setBusy('save')
    try {
      const r = isCustom ? await window.api.settings.setCustom(url, key) : await window.api.settings.setKey(provider, key)
      toast(r.ok ? 'success' : 'error', `${name}: ${r.message}`)
      setKey('')
      setEditing(false)
      onChanged()
      onSaved?.(r)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const loginOpenRouter = async (): Promise<void> => {
    setBusy('login')
    try {
      const r = await window.api.settings.loginOpenRouter()
      toast(r.ok ? 'success' : 'error', `${name}: ${r.message}`)
      setKey('')
      setEditing(false)
      onChanged()
      onSaved?.(r)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const toggleEye = async (): Promise<void> => {
    if (!showStored) {
      setShowTyped(!showTyped)
      return
    }
    setRevealed(revealed ? null : await window.api.settings.revealKey(provider))
  }
  const visible = showStored ? !!revealed : showTyped

  const test = async (): Promise<void> => {
    setBusy('test')
    try {
      const r = await window.api.settings.testKey(provider)
      toast(r.ok ? 'success' : 'error', `${name}: ${r.message}`)
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const clear = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: `Hapus ${isCustom ? 'endpoint' : 'kunci'} ${name}?`,
      body: 'Data ini akan dihapus dari komputer ini. Kamu bisa menambahkannya lagi kapan saja.',
      confirm: 'Hapus',
      danger: true
    })
    if (!ok) return
    await window.api.settings.clearKey(provider)
    setUrl('')
    onChanged()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        {isCustom && (
          <Field label="Alamat endpoint (base URL)" className="flex-[1.3]">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={onEnter}
              placeholder="http://localhost:11434/v1"
              spellCheck={false}
              className={cx(inputCls, 'h-11 font-mono text-sm')}
            />
          </Field>
        )}
        <Field label={isCustom ? 'API key (opsional)' : label} className="flex-1">
          <div className="relative">
            {showStored ? (
              <input
                readOnly
                value={revealed ?? preview ?? ''}
                aria-label={`${label} tersimpan`}
                className={cx(inputCls, 'h-11 cursor-default bg-canvas pr-11 font-mono text-sm')}
              />
            ) : (
              <input
                type={showTyped ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                autoFocus={!isCustom && !!preview}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={onEnter}
                placeholder={
                  isCustom ? (preview ? `Tersimpan (${preview}) · isi untuk mengganti` : 'Kosongkan untuk server lokal') : placeholder
                }
                className={cx(inputCls, 'h-11 pr-11')}
              />
            )}
            {(showStored || key.length > 0) && (
              <button
                type="button"
                aria-label={visible ? 'Sembunyikan kunci' : 'Tampilkan kunci'}
                title={visible ? 'Sembunyikan kunci' : 'Tampilkan kunci'}
                onClick={() => void toggleEye()}
                className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-fg"
              >
                {visible ? <EyeOff className="size-[17px]" /> : <Eye className="size-[17px]" />}
              </button>
            )}
          </div>
        </Field>
        {showStored ? (
          <Button
            className="h-11"
            onClick={() => {
              setEditing(true)
              setRevealed(null)
            }}
          >
            Ganti
          </Button>
        ) : (
          <Button variant="accent" className="h-11" disabled={!canSave} loading={busy === 'save'} onClick={() => void save()}>
            Simpan dan tes
          </Button>
        )}
        {!isCustom && editing && !!preview && (
          <Button
            variant="ghost"
            className="h-11"
            onClick={() => {
              setEditing(false)
              setKey('')
            }}
          >
            Batal
          </Button>
        )}
        {configured && (
          <>
            <Button className="h-11" loading={busy === 'test'} onClick={() => void test()}>
              Tes
            </Button>
            <IconButton label={`Hapus ${name}`} size={44} className="text-bad-ink" onClick={() => void clear()}>
              <Trash2 className="size-[18px]" />
            </IconButton>
          </>
        )}
      </div>
      {provider === 'openrouter' && !showStored && (
        <div className="-mt-1 flex items-center gap-2 text-[13px] text-fg-2">
          <span>Atau tanpa menyalin kunci:</span>
          <Button className="h-9" loading={busy === 'login'} disabled={!!busy && busy !== 'login'} onClick={() => void loginOpenRouter()}>
            {busy === 'login' ? 'Menunggu login di browser…' : 'Login dengan OpenRouter'}
          </Button>
          {busy === 'login' && (
            <Button variant="ghost" className="h-9" onClick={() => void window.api.auth.cancel()}>
              Batal
            </Button>
          )}
        </div>
      )}
      {unsaved && <p className="-mt-1 text-[13px] font-semibold text-link">Kunci belum tersimpan. Tekan Enter atau klik Simpan dan tes.</p>}
      {hint && <p className="-mt-1 text-[13px] text-fg-2">{hint}</p>}
      <div className="flex items-center gap-2 text-[13px] text-fg-2">
        <span className={cx('flex-1', configured && status?.lastOk === false && 'text-bad-ink')}>
          {configured && status?.lastMessage
            ? `${status.lastMessage}${status.checkedAt && !status.unreadable ? ` · dicek ${relativeTime(status.checkedAt)}` : ''}`
            : help}
        </span>
        {link && (
          <button
            type="button"
            onClick={() => void window.api.app.openExternal(link)}
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-link hover:underline"
          >
            {linkLabel}
            <ExternalLink className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-panel px-5 py-[18px]">{children}</section>
}

function SectionTitle({ icon, title, sub }: { icon: ReactNode; title: string; sub: ReactNode }) {
  return (
    <div className="mt-5 flex items-start gap-3">
      <span className="mt-1 text-fg">{icon}</span>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-bold leading-tight">{title}</h2>
        <p className="text-sm text-fg-2">{sub}</p>
      </div>
    </div>
  )
}

function LlmSection({
  settings,
  statusOf,
  chatgpt,
  onChanged,
  onSettings
}: {
  settings: AppSettings
  statusOf: (p: ApiProvider) => KeyStatus | undefined
  chatgpt?: AccountStatus
  onChanged: () => void
  onSettings: (s: AppSettings) => void
}) {
  const { toast } = useApp()
  const provider = settings.llmProvider
  const spec = LLM_PROVIDERS.find((p) => p.id === provider)!
  const status = provider === 'chatgpt' ? undefined : statusOf(provider)
  // ChatGPT is connected by signing in; every other provider by a saved key that did not fail its last check.
  const ready =
    provider === 'chatgpt'
      ? !!chatgpt?.signedIn && !chatgpt.needsReauth && chatgpt.planUsageAllowed !== false
      : !!status?.configured && status.lastOk !== false
  const [openPicker, setOpenPicker] = useState(false)
  const models = useModels(provider, ready, provider === 'custom' ? settings.customBaseUrl : provider === 'chatgpt' ? (chatgpt?.label ?? '') : '')
  const model = settings.llmModels[provider]
  const selected = models.models.find((m) => m.id === model)

  const options: ProviderOption<LlmProvider>[] = LLM_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    note: p.note,
    logo: p.id,
    status: p.id === 'chatgpt' ? chatgpt : statusOf(p.id)
  }))

  return (
    <>
      <SectionTitle
        icon={<Cpu className="size-5" />}
        title="Penyusun cerita (AI LLM)"
        sub="Pilih satu penyedia untuk menyusun klip, naskah, dan pemeran. Hanya penyedia yang dipilih yang dipakai."
      />
      <ProviderSelect
        value={provider}
        options={options}
        onChange={async (id) => {
          setOpenPicker(false)
          onSettings(await window.api.settings.set({ llmProvider: id }))
        }}
      />
      <Card key={provider}>
        {provider === 'chatgpt' ? (
          <ChatGptAccount
            account={chatgpt}
            welcomeSeen={settings.chatgptWelcomeSeen}
            onWelcomeSeen={async () => onSettings(await window.api.settings.set({ chatgptWelcomeSeen: true }))}
            onSignedIn={() => {
              void models.refresh()
              if (!model) setOpenPicker(true)
            }}
          />
        ) : (
          <KeyForm
            provider={provider}
            name={spec.name}
            status={status}
            help={provider === 'custom' ? 'Contoh: http://localhost:11434/v1 untuk Ollama, http://localhost:1234/v1 untuk LM Studio, https://api.x.ai/v1 untuk Grok.' : 'Setelah kunci disimpan, daftar model diambil langsung dari penyedianya.'}
            hint={provider === 'gemini' && settings.defaultTtsProvider === 'gemini' ? 'Kunci ini dipakai bersama untuk suara narator Gemini TTS.' : undefined}
            link={spec.link}
            linkLabel={spec.linkLabel}
            customUrl={settings.customBaseUrl}
            onChanged={onChanged}
            onSaved={async (r) => {
              if (!r.ok) return
              onSettings(await window.api.settings.get())
              if (ready) void models.refresh()
              if (!model) setOpenPicker(true)
            }}
          />
        )}
        {ready && (
          <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-4">
            <span className="text-sm font-semibold">Model untuk menyusun cerita</span>
            <ModelPicker
              value={model}
              models={models.models}
              loading={models.loading}
              error={models.error}
              fetchedAt={models.fetchedAt}
              onChange={async (id) => {
                setOpenPicker(false)
                onSettings(await window.api.settings.set({ llmModels: { ...settings.llmModels, [provider]: id } }))
                toast('success', `Cerita akan disusun oleh ${spec.name} · ${id}`)
              }}
              onRefresh={() => void models.refresh()}
              allowCustom={provider === 'custom'}
              defaultOpen={openPicker}
              placeholder="Pilih model dari daftar"
            />
            {selected?.description && <p className="line-clamp-2 text-[13px] text-muted">{selected.description}</p>}
            {selected && provider === 'openrouter' && !selected.tags.includes('JSON') && (
              <p className="text-[13px] text-sun-ink">
                Model ini tidak mendukung output JSON terstruktur. Aplikasi tetap mencoba, tapi model berlabel JSON biasanya lebih stabil.
              </p>
            )}
          </div>
        )}
      </Card>
    </>
  )
}

function TtsSection({ settings, statusOf, onChanged, onSettings }: { settings: AppSettings; statusOf: (p: ApiProvider) => KeyStatus | undefined; onChanged: () => void; onSettings: (s: AppSettings) => void }) {
  const provider = settings.defaultTtsProvider
  const status = statusOf(provider)
  const ready = !!status?.configured && status.lastOk !== false
  const models = useModels(provider === 'gemini' ? 'gemini-tts' : 'elevenlabs', ready)
  const options: ProviderOption<TtsProvider>[] = [
    {
      id: 'gemini',
      name: 'Gemini TTS',
      note: 'Suara Google Gemini, 30 pilihan suara, mendukung bahasa Indonesia.',
      logo: 'gemini',
      status: statusOf('gemini')
    },
    {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      note: 'Suara sangat natural dengan waktu kata yang presisi untuk caption karaoke.',
      logo: 'elevenlabs',
      status: statusOf('elevenlabs')
    }
  ]
  const value = provider === 'gemini' ? settings.geminiTtsModel : settings.elevenModel
  return (
    <>
      <SectionTitle
        icon={<Mic className="size-5" />}
        title="Suara narator (TTS)"
        sub="Penyedia suara bawaan untuk proyek baru. Setiap proyek tetap bisa memilih sendiri di langkah Ide cerita."
      />
      <ProviderSelect value={provider} options={options} onChange={async (id) => onSettings(await window.api.settings.set({ defaultTtsProvider: id }))} />
      <Card key={provider}>
        <KeyForm
          provider={provider}
          name={provider === 'gemini' ? 'Google Gemini' : 'ElevenLabs'}
          status={status}
          help={provider === 'gemini' ? 'Kunci Gemini dari Google AI Studio.' : 'Kunci API dari akun ElevenLabs.'}
          hint={provider === 'gemini' && settings.llmProvider === 'gemini' ? 'Kunci ini dipakai bersama dengan penyusun cerita Gemini.' : undefined}
          link={provider === 'gemini' ? 'https://aistudio.google.com/apikey' : 'https://elevenlabs.io/app/settings/api-keys'}
          linkLabel={provider === 'gemini' ? 'Buat kunci di Google AI Studio' : 'Buat kunci di ElevenLabs'}
          onChanged={onChanged}
          onSaved={(r) => r.ok && void models.refresh()}
        />
        {ready && (
          <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-4">
            <span className="text-sm font-semibold">Model suara</span>
            <ModelPicker
              value={value}
              models={models.models}
              loading={models.loading}
              error={models.error}
              fetchedAt={models.fetchedAt}
              onChange={async (id) => onSettings(await window.api.settings.set(provider === 'gemini' ? { geminiTtsModel: id } : { elevenModel: id }))}
              onRefresh={() => void models.refresh()}
            />
          </div>
        )}
      </Card>
    </>
  )
}

const MEDIA_KEY_FORMS: Record<MediaProvider, { name: string; placeholder?: string; help: string; link: string; linkLabel: string }> = {
  higgsfield: {
    name: 'Higgsfield',
    placeholder: 'Tempel hasil tombol Copy API key',
    help: 'Kunci dicek dengan permintaan estimasi biaya, tanpa memakai kredit.',
    link: 'https://open.higgsfield.ai/explore',
    linkLabel: 'Buka console Higgsfield'
  },
  fal: {
    name: 'fal.ai',
    placeholder: 'Tempel kunci fal.ai',
    help: 'Kunci dicek lewat daftar harga, tanpa memakai saldo.',
    link: 'https://fal.ai/dashboard/keys',
    linkLabel: 'Buka fal.ai'
  },
  gemini: {
    name: 'Google Gemini',
    help: 'Kunci Gemini dari Google AI Studio.',
    link: 'https://aistudio.google.com/apikey',
    linkLabel: 'Buat kunci di Google AI Studio'
  }
}

const MEDIA_COUNT = (p: MediaProvider, kind: 'image' | 'video'): number =>
  (kind === 'image' ? IMAGE_MODELS : VIDEO_MODELS).filter((m) => m.provider === p).length

function MediaSection({
  settings,
  statusOf,
  onChanged,
  onSettings
}: {
  settings: AppSettings
  statusOf: (p: ApiProvider) => KeyStatus | undefined
  onChanged: () => void
  onSettings: (s: AppSettings) => void
}) {
  const provider = defaultMediaProvider(settings)
  const status = statusOf(provider)
  const form = MEDIA_KEY_FORMS[provider]
  const chosen = providerDefaults(provider, settings)
  const counts = (p: MediaProvider): string => `${MEDIA_COUNT(p, 'image')} model gambar dan ${MEDIA_COUNT(p, 'video')} model video`
  const options: ProviderOption<MediaProvider>[] = [
    { id: 'higgsfield', name: 'Higgsfield', note: `${counts('higgsfield')}, dibayar dengan kredit Higgsfield.`, logo: 'higgsfield', status: statusOf('higgsfield') },
    { id: 'fal', name: 'fal.ai', note: `${counts('fal')}: Nano Banana, Flux, Seedream, Kling, Seedance, Wan. Dibayar dengan saldo fal.ai.`, logo: 'fal', status: statusOf('fal') },
    { id: 'gemini', name: 'Google Gemini', note: 'Nano Banana untuk gambar dan Gemini Omni Flash untuk video. Butuh billing aktif.', logo: 'gemini', status: statusOf('gemini') }
  ]
  const pickers = [
    { kind: 'image', label: 'Model gambar bawaan', value: chosen.imageModel, key: 'imageModel' },
    { kind: 'video', label: 'Model video bawaan', value: chosen.videoModel, key: 'videoModel' }
  ] as const
  return (
    <>
      <SectionTitle
        icon={<ImageIcon className="size-5" />}
        title="Gambar dan video"
        sub="Penyedia gambar dan video bawaan untuk proyek baru. Setiap proyek tetap bisa memilih sendiri di langkah Ide cerita."
      />
      <ProviderSelect value={provider} options={options} onChange={async (id) => onSettings(await window.api.settings.set(providerDefaults(id, settings)))} />
      <Card key={provider}>
        <KeyForm
          provider={provider}
          name={form.name}
          status={status}
          placeholder={form.placeholder}
          hint={
            provider === 'higgsfield' ? (
              <>
                Di console Higgsfield, buka API Keys lalu klik <strong className="text-fg">Copy API key</strong> dan tempel di sini. Formatnya{' '}
                <code className="rounded bg-raised px-1 font-mono text-xs">KEY_ID:KEY_SECRET</code>. Kalau kamu memegang Key ID dan Secret terpisah, gabungkan
                dengan titik dua.
              </>
            ) : provider === 'gemini' ? (
              'Kunci ini sama dengan kunci Gemini untuk penyusun cerita dan suara narator. Gambar dan video Gemini tidak termasuk kuota gratis, jadi aktifkan billing di Google AI Studio dulu.'
            ) : undefined
          }
          help={form.help}
          link={form.link}
          linkLabel={form.linkLabel}
          onChanged={onChanged}
        />
        <div className="grid grid-cols-2 gap-4 border-t border-dashed border-line pt-4">
          {pickers.map((x) => (
            <div key={x.kind} className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-semibold">{x.label}</span>
              <ModelPicker
                value={x.value}
                models={mediaModelOptions(x.kind, provider)}
                detail="description"
                renderIcon={(m) => <ModelLogo family={m.family} />}
                align={x.kind === 'video' ? 'right' : 'left'}
                menuClassName="w-[430px]"
                onChange={async (id) => onSettings(await window.api.settings.set({ ...chosen, [x.key]: id }))}
              />
            </div>
          ))}
        </div>
        <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-fg-2">
          <Film className="mt-0.5 size-4 shrink-0" />
          <span>
            Dipakai proyek baru. Di langkah <strong className="text-fg">Ide cerita</strong>, bagian Model AI, tiap proyek bisa memakai model dari penyedia
            mana pun yang kuncinya sudah diisi.
          </span>
        </p>
      </Card>
    </>
  )
}

export function Settings() {
  const { go, route } = useApp()
  const back = route.name === 'settings' && route.back ? route.back : ({ name: 'home' } as const)
  const [tab, setTab] = useState<Tab>('services')
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [accounts, setAccounts] = useState<AccountStatus[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [folder, setFolder] = useState('')

  const reload = (): void => {
    void window.api.settings.keys().then(setKeys)
    void window.api.auth.status().then(setAccounts)
    void window.api.settings.get().then(setSettings)
  }
  useEffect(() => {
    reload()
    void window.api.exporter.defaultFolder().then(setFolder)
    // Sign-ins finish in the browser and refreshes can end a session; the main process reports both.
    return window.api.on.auth((s) => setAccounts((list) => [...list.filter((a) => a.provider !== s.provider), s]))
  }, [])

  const statusOf = (p: ApiProvider): KeyStatus | undefined => keys.find((k) => k.provider === p)

  const NAV: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'services', label: 'Layanan AI dan kunci', icon: <KeyRound className="size-[18px]" /> },
    { id: 'general', label: 'Umum', icon: <SlidersHorizontal className="size-[18px]" /> },
    { id: 'about', label: 'Tentang aplikasi', icon: <Info className="size-[18px]" /> }
  ]

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[68px] shrink-0 items-center gap-3.5 border-b border-line bg-panel px-8">
        <button type="button" onClick={() => go({ name: 'home' })}>
          <Logo />
        </button>
        <span className="text-xl text-line-3">/</span>
        <span className="font-semibold">Pengaturan</span>
        <div className="flex-1" />
        <Button icon={<ArrowLeft className="size-[18px]" />} onClick={() => go(back)}>
          {back.name === 'project' ? 'Kembali ke proyek' : 'Kembali ke beranda'}
        </Button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Bagian pengaturan" className="flex flex-col gap-1 border-r border-line pl-6 pr-4 pt-7">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-current={tab === n.id ? 'page' : undefined}
              onClick={() => setTab(n.id)}
              className={cx(
                'flex h-11 items-center gap-3 rounded-lg px-3.5 text-left text-[15px]',
                tab === n.id ? 'bg-select font-semibold text-fg' : 'font-medium text-fg hover:bg-raised'
              )}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>
        <main className="scroll-thin overflow-y-auto">
          <div className="flex max-w-[900px] flex-col gap-3.5 px-14 pb-24 pt-8">
            {tab === 'services' && settings && (
              <>
                <div>
                  <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">Layanan AI dan kunci</h1>
                  <p className="mt-2 max-w-[700px] text-[15px] text-fg-2">
                    Video Story memakai akun layanan milikmu sendiri, lewat API key atau login akun. Kunci dan sesi login disimpan terenkripsi di
                    komputer ini dan hanya dikirim langsung ke layanan yang bersangkutan.
                  </p>
                </div>
                <LlmSection
                  settings={settings}
                  statusOf={statusOf}
                  chatgpt={accounts.find((a) => a.provider === 'chatgpt')}
                  onChanged={reload}
                  onSettings={setSettings}
                />
                <TtsSection settings={settings} statusOf={statusOf} onChanged={reload} onSettings={setSettings} />
                <MediaSection settings={settings} statusOf={statusOf} onChanged={reload} onSettings={setSettings} />
                <WhisperSection settings={settings} onSettings={setSettings} />
              </>
            )}

            {tab === 'general' && settings && (
              <>
                <div>
                  <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">Umum</h1>
                  <p className="mt-2 text-[15px] text-fg-2">Pilihan bawaan untuk proyek baru.</p>
                </div>
                <section className="flex flex-col gap-5 rounded-[14px] border border-line bg-panel p-6">
                  <Field label="Bahasa default naskah dan suara">
                    <Select
                      label="Bahasa default naskah dan suara"
                      value={settings.defaultLanguage}
                      onChange={async (v) => setSettings(await window.api.settings.set({ defaultLanguage: v }))}
                      options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                      className="max-w-[320px]"
                    />
                  </Field>
                  <Field label="Folder ekspor">
                    <div className="flex gap-2">
                      <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-line bg-raised px-3.5 font-mono text-[13px]">
                        <FolderOpen className="size-[17px] shrink-0 text-fg-2" />
                        <span className="truncate">{folder}</span>
                      </div>
                      <Button
                        className="h-11"
                        onClick={async () => {
                          const f = await window.api.exporter.pickFolder()
                          if (f) setFolder(f)
                        }}
                      >
                        Ganti folder
                      </Button>
                    </div>
                  </Field>
                </section>
              </>
            )}

            {tab === 'about' && <AboutSection />}
          </div>
        </main>
      </div>
    </div>
  )
}
