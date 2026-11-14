import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { VISUAL_STYLES, getStyle, type StyleCategory } from '@shared/styles'
import { Popover } from './Popover'
import { StyleSwatch } from './StyleArt'
import { cx } from './ui'

const CATEGORY_LABEL: Record<StyleCategory, string> = { '2d': '2D', '3d': '3D', realistis: 'Realistis' }
const COLUMNS = 8

/** A pill that opens every visual style as a grid of square previews, so the look is clear before picking. */
export function StyleMenu({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [peek, setPeek] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const current = getStyle(value)
  const shown = getStyle(peek ?? value)

  useEffect(() => {
    if (!open) return
    setPeek(null)
    // Start keyboard navigation on the chosen style.
    const id = requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  const pick = (id: string): void => {
    onChange(id)
    setOpen(false)
    trigger.current?.focus()
  }

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }[e.key]
    if (!move) return
    e.preventDefault()
    const tiles = [...(grid.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
    const at = tiles.indexOf(document.activeElement as HTMLElement)
    tiles[Math.min(tiles.length - 1, Math.max(0, at + move))]?.focus()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Gaya visual: ${current.name}`}
        onClick={() => setOpen(!open)}
        className={cx(
          'inline-flex h-10 min-w-0 items-center gap-2 rounded-lg border bg-raised pl-3.5 pr-3 text-sm font-medium transition-colors',
          open ? 'border-edge' : 'border-line-2 hover:border-edge'
        )}
      >
        <StyleSwatch styleId={value} className="-ml-1.5 size-7 shrink-0 rounded-full border border-edge" iconSize={14} />
        <span className="truncate">{current.name}</span>
        <ChevronDown className={cx('size-3.5 shrink-0 text-fg-2 transition-transform', open && 'rotate-180')} />
      </button>

      <Popover
        anchor={trigger}
        open={open}
        onClose={(why) => {
          setOpen(false)
          if (why === 'escape') trigger.current?.focus()
        }}
        width={880} maxHeight={520} label="Pilih gaya visual">
        <div className="flex items-end gap-4 border-b border-line px-4 pb-3 pt-3.5">
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold">Gaya visual</span>
            <span className="text-xs text-muted">Dipakai untuk semua gambar dan lembar karakter di proyek ini.</span>
          </div>
          <div className="flex-1" />
          <span className="truncate text-right text-[13px] text-fg-2">
            <span className="font-semibold text-fg">{shown.name}</span> · cocok untuk {shown.niche.toLowerCase()}
          </span>
        </div>
        <div
          ref={grid}
          role="radiogroup"
          aria-label="Gaya visual"
          onKeyDown={onGridKey}
          onMouseLeave={() => setPeek(null)}
          className="scroll-thin grid min-h-0 gap-x-2.5 gap-y-3 overflow-y-auto p-3.5"
          style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
        >
          {VISUAL_STYLES.map((s) => {
            const on = s.id === value
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                title={`${s.name} · ${s.niche}`}
                onClick={() => pick(s.id)}
                onMouseEnter={() => setPeek(s.id)}
                onFocus={() => setPeek(s.id)}
                className="group flex flex-col gap-1.5 rounded-lg text-left outline-none"
              >
                <span
                  className={cx(
                    'relative block aspect-square w-full overflow-hidden rounded-[11px] bg-raised transition-shadow',
                    on ? 'border-2 border-accent' : 'border border-line group-hover:border-edge group-focus-visible:ring-2 group-focus-visible:ring-accent'
                  )}
                >
                  <StyleSwatch styleId={s.id} className="size-full transition-transform duration-500 ease-out group-hover:scale-[1.07]" iconSize={24} />
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-strip/75 px-1.5 py-px text-[10px] font-semibold text-fg">
                    {CATEGORY_LABEL[s.category]}
                  </span>
                  {on && (
                    <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-canvas">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className={cx('line-clamp-2 px-0.5 text-[12.5px] leading-tight', on ? 'font-bold text-fg' : 'font-semibold text-fg-2 group-hover:text-fg')}>
                  {s.name}
                </span>
              </button>
            )
          })}
        </div>
      </Popover>
    </>
  )
}
