import { useState } from 'react'
import { stripStyles } from '@shared/slate'
import { STYLE_CATEGORIES, VISUAL_STYLES, type StyleCategory } from '@shared/styles'
import { FilmStrip } from '../../components/FilmStrip'
import { StyleSwatch } from '../../components/StyleArt'
import { cx } from '../../components/ui'

/**
 * The visual style of a project, picked from a strip of film. One row by default so the page stays short; the link
 * unrolls every style of the category in place.
 */
export function StyleStrip({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [cat, setCat] = useState<StyleCategory | 'all'>('all')
  const [expanded, setExpanded] = useState(false)
  const total = VISUAL_STYLES.filter((s) => cat === 'all' || s.category === cat).length
  const shown = stripStyles(cat, value, expanded)
  return (
    <section className="flex flex-col gap-2.5" aria-label="Gaya visual">
      <div className="flex items-end gap-4">
        <h2 className="font-display text-2xl font-semibold leading-none">Gaya visual</h2>
        <div className="flex gap-4 pb-px" role="group" aria-label="Kategori gaya">
          {STYLE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cat === c.id}
              onClick={() => setCat(c.id)}
              className={cx('border-b-2 pb-1 text-sm', cat === c.id ? 'border-sun font-semibold text-fg' : 'border-transparent text-muted hover:text-fg')}
            >
              {c.label}
            </button>
          ))}
        </div>
        {total > shown.length || expanded ? (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="ml-auto text-sm font-semibold text-link hover:underline">
            {expanded ? 'Tampilkan lebih sedikit' : `Lihat semua ${total} gaya`}
          </button>
        ) : null}
      </div>
      <FilmStrip columns="styles">
        {shown.map((s) => {
          const on = s.id === value
          return (
            <button key={s.id} type="button" aria-pressed={on} onClick={() => onChange(s.id)} title={s.niche} className="group flex min-w-0 flex-col gap-1.5 text-left">
              <StyleSwatch
                styleId={s.id}
                className={cx('aspect-[4/3] w-full rounded-md', on ? 'outline outline-2 outline-offset-2 outline-accent' : 'group-hover:brightness-110')}
                iconSize={26}
              />
              <span className={cx('truncate text-[12.5px]', on ? 'font-semibold text-fg' : 'text-fg-2')}>{s.name}</span>
            </button>
          )
        })}
      </FilmStrip>
    </section>
  )
}
