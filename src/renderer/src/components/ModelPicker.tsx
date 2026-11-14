import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowDownNarrowWide, ChevronDown, RefreshCw, Search, X } from 'lucide-react'
import type { ModelOption } from '@shared/types'
import { creditLabel, relativeTime, usdLabel } from '../lib/format'
import { Spinner, cx } from './ui'

function ctxLabel(n?: number | null): string | null {
  if (!n) return null
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`
  return `${Math.round(n / 1000)}K`
}

function priceLabel(m: ModelOption): string | null {
  if (m.priceIn == null || m.priceOut == null) return null
  if (m.priceIn === 0 && m.priceOut === 0) return 'Gratis'
  const f = (v: number): string => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(3).replace(/0+$/, ''))
  return `$${f(m.priceIn)} / $${f(m.priceOut)}`
}

/** Every search word must appear in the model id, name or description. */
function matches(m: ModelOption, words: string[]): boolean {
  const hay = `${m.id} ${m.name} ${m.description ?? ''}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

export function ModelPicker({
  value,
  models,
  loading,
  error,
  fetchedAt,
  onChange,
  onRefresh,
  allowCustom,
  placeholder = 'Pilih model',
  defaultOpen,
  disabled,
  detail = 'id',
  tagFilters,
  align = 'left',
  menuClassName,
  footerNote,
  renderIcon,
  renderGroup
}: {
  value: string
  models: ModelOption[]
  loading?: boolean
  error?: string | null
  fetchedAt?: number | null
  onChange: (id: string) => void
  onRefresh?: () => void
  allowCustom?: boolean
  placeholder?: string
  defaultOpen?: boolean
  disabled?: boolean
  /** Second line under each model name: its id, or its description. */
  detail?: 'id' | 'description'
  /** Filter chips to offer instead of the most common tags. */
  tagFilters?: string[]
  /** Which edge a menu wider than the button lines up with. */
  align?: 'left' | 'right'
  menuClassName?: string
  /** Extra text in the list footer, e.g. what the listed credits pay for. */
  footerNote?: string
  /** A mark shown before each model name, e.g. its brand logo. */
  renderIcon?: (m: ModelOption) => ReactNode
  /** A mark shown before each group heading, e.g. the provider's logo. */
  renderGroup?: (group: string) => ReactNode
}) {
  const [menu, setMenu] = useState<{ up: boolean; max: number }>({ up: false, max: 440 })
  const [open, setOpen] = useState(!!defaultOpen)
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const [cheapFirst, setCheapFirst] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])

  useEffect(() => {
    if (!open) return
    // Open toward the side with more room, and never past the window edge.
    const rect = root.current?.getBoundingClientRect()
    if (rect) {
      const below = window.innerHeight - rect.bottom - 14
      const above = rect.top - 14
      const up = below < 320 && above > below
      setMenu({ up, max: Math.max(220, Math.min(440, up ? above : below)) })
    }
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    setTimeout(() => input.current?.focus(), 0)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const allTags = useMemo(() => {
    if (tagFilters) return tagFilters.filter((t) => models.some((m) => m.tags.includes(t)))
    const count = new Map<string, number>()
    for (const m of models) for (const t of m.tags) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count.entries()]
      .filter(([, n]) => n < models.length)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t)
  }, [models, tagFilters])

  // Image and video lists carry price estimates (creditUnit marks them); known prices can be sorted cheapest first.
  const priced = models.some((m) => m.credits != null || (m.creditUnit !== undefined && m.usd != null))

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const list = models.filter((m) => matches(m, words) && tags.every((t) => m.tags.includes(t)))
    if (!cheapFirst) return list
    // Credits and dollars do not compare, so cheapest-first sorts inside each provider group.
    const groups = [...new Set(models.map((m) => m.group))]
    const cost = (m: ModelOption): number => m.credits ?? m.usd ?? Infinity
    return [...list].sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || cost(a) - cost(b))
  }, [models, query, tags, cheapFirst])

  const customId = query.trim()
  const showCustom = allowCustom && customId && !models.some((m) => m.id === customId)
  const rows = filtered.length + (showCustom ? 1 : 0)

  useEffect(() => setActive(0), [query, tags, cheapFirst])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (id: string): void => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(rows - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active < filtered.length) {
        if (!filtered[active].locked) pick(filtered[active].id)
      }
      else if (showCustom) pick(customId)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const current = models.find((m) => m.id === value)

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx(
          'flex h-12 w-full items-center gap-3 rounded-lg border bg-panel px-3.5 text-left transition-colors disabled:opacity-50',
          open ? 'border-edge' : value ? 'border-line-2 hover:border-edge' : 'border border-accent bg-accent-soft'
        )}
      >
        {renderIcon && current && renderIcon(current)}
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          {value ? (
            <>
              <span className="truncate text-[15px] font-semibold">{current?.name ?? value}</span>
              {detail === 'description'
                ? current?.description && <span className="truncate text-xs text-muted">{current.description}</span>
                : current && current.name !== value && <span className="truncate font-mono text-xs text-muted">{value}</span>}
            </>
          ) : (
            <span className="text-[15px] font-semibold text-link">{loading ? 'Memuat daftar model…' : placeholder}</span>
          )}
        </span>
        {current && ctxLabel(current.contextLength) && (
          <span className="shrink-0 rounded-md bg-raised px-1.5 py-0.5 font-mono text-[11px] text-fg-2">{ctxLabel(current.contextLength)}</span>
        )}
        {loading ? <Spinner className="size-4 text-muted" /> : <ChevronDown className={cx('size-4 shrink-0 transition-transform', open && 'rotate-180')} />}
      </button>

      {open && (
        <div
          className={cx(
            'absolute z-40 flex min-w-full flex-col overflow-hidden rounded-[14px] border border-edge bg-panel shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
            menu.up ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            menuClassName
          )}
          style={{ maxHeight: menu.max }}
        >
          <div className="flex flex-col gap-2 border-b border-line p-2.5">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-line-2 bg-canvas px-3 focus-within:border-edge">
              <Search className="size-4 shrink-0 text-muted" />
              <input
                ref={input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder={models.length ? `Cari dari ${models.length.toLocaleString('id-ID')} model…` : allowCustom ? 'Ketik ID model…' : 'Cari model…'}
                aria-label="Cari model"
                role="combobox"
                aria-expanded="true"
                aria-controls="model-list"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {query && (
                <button type="button" aria-label="Hapus pencarian" onClick={() => setQuery('')} className="text-muted hover:text-fg">
                  <X className="size-4" />
                </button>
              )}
            </label>
            {(allTags.length > 0 || priced) && (
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((t) => {
                  const on = tags.includes(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                      className={cx(
                        'h-7 rounded-full border px-2.5 text-xs font-medium',
                        on ? 'border-edge bg-select text-fg' : 'border-line-2 text-fg-2 hover:border-edge'
                      )}
                    >
                      {t}
                    </button>
                  )
                })}
                {priced && (
                  <button
                    type="button"
                    aria-pressed={cheapFirst}
                    onClick={() => setCheapFirst(!cheapFirst)}
                    className={cx(
                      'ml-auto inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium',
                      cheapFirst ? 'border-edge bg-select text-fg' : 'border-line-2 text-fg-2 hover:border-edge'
                    )}
                  >
                    <ArrowDownNarrowWide className="size-3.5" />
                    Termurah dulu
                  </button>
                )}
              </div>
            )}
          </div>

          <div ref={list} id="model-list" role="listbox" className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1.5">
            {error && <p className="m-1 rounded-lg bg-bad-soft px-3 py-2.5 text-[13px] text-bad-ink">{error}</p>}
            {!error && loading && !models.length && (
              <p className="flex items-center gap-2 px-3 py-4 text-sm text-fg-2">
                <Spinner />
                Mengambil daftar model dari penyedia…
              </p>
            )}
            {filtered.map((m, i) => {
              const selected = m.id === value
              const price = priceLabel(m)
              const heading = m.group && m.group !== filtered[i - 1]?.group
              return (
                <div key={m.id}>
                  {heading && (
                    <div className="flex items-center gap-2 px-3 pb-1 pt-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                      {renderGroup?.(m.group!)}
                      {m.group}
                    </div>
                  )}
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={!!m.locked}
                  data-row={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => !m.locked && pick(m.id)}
                  title={m.locked ?? (detail === 'description' ? m.id : undefined)}
                  // The chosen model is marked by its background, which keeps the list narrow.
                  className={cx(
                    'flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left',
                    m.locked ? 'cursor-not-allowed opacity-50' : selected ? 'bg-select' : i === active ? 'bg-raised' : 'hover:bg-raised/60'
                  )}
                >
                  {renderIcon?.(m)}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{m.name}</span>
                      {m.tags
                        .filter((t) => !m.name.toLowerCase().includes(t.toLowerCase()))
                        // Description rows already say what the tags say; one keeps names readable.
                        .slice(0, detail === 'description' ? 1 : 3)
                        .map((t) => (
                          <span key={t} className="shrink-0 rounded-full bg-draft px-1.5 py-px text-[10.5px] font-semibold text-fg-2">
                            {t}
                          </span>
                        ))}
                    </span>
                    {m.locked ? (
                      <span className="truncate text-[12px] text-fg-2">{m.locked}</span>
                    ) : detail === 'description' ? (
                      m.description && <span className="truncate text-[12px] text-fg-2">{m.description}</span>
                    ) : (
                      m.name !== m.id && <span className="truncate font-mono text-[11.5px] text-muted">{m.id}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 text-[11.5px] text-fg-2">
                    {ctxLabel(m.contextLength) && <span className="font-mono">{ctxLabel(m.contextLength)} konteks</span>}
                    {price && <span className={cx('font-mono', price === 'Gratis' && 'font-semibold text-ok-ink')}>{price}</span>}
                    {m.creditUnit !== undefined &&
                      !m.locked &&
                      (m.credits === undefined ? (
                        <Spinner className="mt-1 size-3.5 text-muted" />
                      ) : m.credits !== null ? (
                        <>
                          <span className="font-mono text-[12.5px] font-semibold text-fg">{creditLabel(m.credits)} kr</span>
                          <span className="font-mono text-muted">{[m.creditUnit, m.usd != null && usdLabel(m.usd)].filter(Boolean).join(' · ')}</span>
                        </>
                      ) : m.usd != null ? (
                        <>
                          <span className="font-mono text-[12.5px] font-semibold text-fg">{usdLabel(m.usd)}</span>
                          {m.creditUnit && <span className="font-mono text-muted">{m.creditUnit}</span>}
                        </>
                      ) : (
                        <span className="text-muted" title="Penyedia tidak memberi perkiraan harga untuk model ini">
                          —
                        </span>
                      ))}
                  </span>
                </button>
                </div>
              )
            })}
            {showCustom && (
              <button
                type="button"
                data-row={filtered.length}
                onMouseEnter={() => setActive(filtered.length)}
                onClick={() => pick(customId)}
                className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm', active === filtered.length ? 'bg-raised' : 'hover:bg-raised/60')}
              >
                <span className="size-4" />
                Pakai model <span className="font-mono font-semibold">{customId}</span>
              </button>
            )}
            {!loading && !error && rows === 0 && (
              <p className="px-3 py-4 text-sm text-muted">{models.length ? 'Tidak ada model yang cocok.' : 'Daftar model kosong.'}</p>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-line bg-canvas px-3 py-2 text-xs text-muted">
            <span className="flex-1">
              {filtered.length.toLocaleString('id-ID')} dari {models.length.toLocaleString('id-ID')} model
              {models.some((m) => m.priceIn != null) && ' · harga per 1 juta token (masuk / keluar)'}
              {footerNote && ` · ${footerNote}`}
              {fetchedAt ? ` · diperbarui ${relativeTime(fetchedAt)}` : ''}
            </span>
            {onRefresh && (
              <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1 font-semibold text-fg-2 hover:text-fg disabled:opacity-50">
                <RefreshCw className={cx('size-3.5', loading && 'animate-[spin_0.8s_linear_infinite]')} />
                Muat ulang
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
