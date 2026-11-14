import { useState, type ReactNode } from 'react'
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Loader2, Pencil, Save, SlidersHorizontal } from 'lucide-react'
import type { Step } from '@shared/types'
import { Button, IconButton, Kbd, cx } from '../../components/ui'
import { relativeTime } from '../../lib/format'
import { useApp } from '../../store/app'
import { useProject } from '../../store/project'

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Ide cerita' },
  { n: 2, label: 'Naskah' },
  { n: 3, label: 'Storyboard' },
  { n: 4, label: 'Editor' }
]

function SaveStatus() {
  const { saveState, saveError, savedAt, save } = useProject()
  if (saveState === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-xs text-sun-ink">
        <Loader2 className="size-3.5 animate-[spin_0.8s_linear_infinite]" />
        Menyimpan…
      </span>
    )
  if (saveState === 'dirty')
    return (
      <span className="flex items-center gap-1.5 text-xs text-link">
        <span className="size-[7px] rounded-full bg-accent" />
        Ada perubahan belum disimpan
      </span>
    )
  if (saveState === 'error')
    return (
      <span className="flex items-center gap-1.5 text-xs text-bad-ink" title={saveError ?? ''}>
        <AlertCircle className="size-3.5" />
        Gagal menyimpan ·
        <button type="button" className="font-semibold underline" onClick={() => void save()}>
          Coba lagi
        </button>
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 text-xs text-ok-ink">
      <CheckCircle2 className="size-3.5" />
      Tersimpan · {savedAt ? relativeTime(savedAt) : 'baru saja'}
    </span>
  )
}

export function ProjectHeader({ doneSteps, right }: { doneSteps: Step[]; right?: ReactNode }) {
  const { project, updateProject, save, flush } = useProject()
  const { go } = useApp()
  const [editing, setEditing] = useState(false)
  if (!project) return null

  const setStep = (n: Step): void => {
    const s = project.status
    const status =
      n === 4 && s !== 'exported' ? 'editing' : n === 3 && (s === 'draft' || s === 'script') ? 'storyboard' : n === 2 && s === 'draft' ? 'script' : s
    updateProject({ step: n, status })
  }

  return (
    <header className="grid h-[68px] shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-line bg-panel px-6">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton
          label="Kembali ke beranda"
          onClick={async () => {
            await flush()
            go({ name: 'home' })
          }}
        >
          <ArrowLeft className="size-[18px]" />
        </IconButton>
        <div className="flex min-w-0 flex-col gap-px">
          <div className="flex min-w-0 items-center gap-1">
            {editing ? (
              <input
                autoFocus
                defaultValue={project.title}
                aria-label="Judul proyek"
                onBlur={(e) => {
                  updateProject({ title: e.target.value.trim() || project.title })
                  setEditing(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="h-8 w-[320px] rounded-lg border border-edge bg-panel px-2 font-display text-lg font-semibold outline-none"
              />
            ) : (
              <>
                <span className="truncate font-display text-lg font-semibold">{project.title}</span>
                <button
                  type="button"
                  aria-label="Ganti nama proyek"
                  onClick={() => setEditing(true)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-fg"
                >
                  <Pencil className="size-[15px]" />
                </button>
              </>
            )}
          </div>
          <SaveStatus />
        </div>
      </div>

      <nav aria-label="Langkah pembuatan" className="flex items-center gap-1 rounded-full border border-line bg-raised p-1">
        {STEPS.map((s) => {
          const active = project.step === s.n
          const done = doneSteps.includes(s.n) && !active
          return (
            <button
              key={s.n}
              type="button"
              aria-current={active ? 'step' : undefined}
              onClick={() => setStep(s.n)}
              className={cx(
                'inline-flex h-9 items-center gap-2 rounded-full py-0 pl-1.5 pr-4 text-sm',
                active ? 'bg-select font-semibold text-fg' : 'font-medium text-fg-2 hover:text-fg'
              )}
            >
              <span
                className={cx(
                  'inline-flex size-6 items-center justify-center rounded-full text-xs',
                  active ? 'bg-sun text-sun-on' : done ? 'bg-ok-soft text-ok-ink' : 'border border-line-2 bg-panel text-fg-2'
                )}
              >
                {done ? <Check className="size-[13px]" strokeWidth={3} /> : s.n}
              </span>
              {s.label}
            </button>
          )
        })}
      </nav>

      <div className="flex items-center justify-end gap-2.5">
        <Button icon={<Save className="size-[17px]" />} onClick={() => void save()}>
          Simpan
          <Kbd>Ctrl S</Kbd>
        </Button>
        <IconButton
          label="Pengaturan"
          onClick={async () => {
            await flush()
            go({ name: 'settings', back: { name: 'project', id: project.id } })
          }}
        >
          <SlidersHorizontal className="size-[18px]" />
        </IconButton>
        {right}
      </div>
    </header>
  )
}
