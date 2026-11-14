import { useId, useState } from 'react'
import { narrowHiddenIndex, stripStyles } from '@shared/slate'
import { getStyle, STYLE_CATEGORIES, VISUAL_STYLES, type StyleCategory } from '@shared/styles'
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
  const hiddenWhenNarrow = expanded ? -1 : narrowHiddenIndex(shown, value)
  const chosen = getStyle(value)
  const titleId = useId()
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby={titleId}>
      <div className="flex items-end gap-4">
        <h2 id={titleId} className="font-display text-2xl font-semibold leading-none">
          Gaya visual
        </h2>
        <div className="flex gap-4 pb-px" role="group" aria-label="Kategori gaya">
          {STYLE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cat === c.id}
              onClick={() => {
                setCat(c.id)
                // Each tab starts as one row; an unrolled strip from another tab would leave a dead "show less".
                setExpanded(false)
              }}
              className={cx('border-b-2 pb-1 text-sm', cat === c.id ? 'border-sun font-semibold text-fg' : 'border-transparent text-muted hover:text-fg')}
            >
              {c.label}
            </button>
          ))}
        </div>
        {total > 4 ? (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="ml-auto text-sm font-semibold text-link hover:underline">
            {expanded ? 'Tampilkan lebih sedikit' : `Lihat semua ${total} gaya`}
          </button>
        ) : null}
      </div>
      <FilmStrip columns="styles">
        {shown.map((s, i) => {
          const on = s.id === value
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(s.id)}
              title={s.niche}
              // The short strip is one row: one frame only shows where the strip has five columns.
              className={cx('group min-w-0 flex-col gap-1.5 text-left', i === hiddenWhenNarrow ? 'hidden @2xl:flex' : 'flex')}
            >
              <StyleSwatch
                styleId={s.id}
                className={cx('aspect-[4/3] w-full rounded-md', on ? 'outline outline-[3px] -outline-offset-[3px] outline-accent' : 'group-hover:brightness-110')}
                iconSize={26}
              />
              <span className={cx('truncate text-[12.5px]', on ? 'font-semibold text-fg' : 'text-fg-2')}>{s.name}</span>
            </button>
          )
        })}
      </FilmStrip>
      <p className="text-[13px] text-muted">
        {cat !== 'all' && chosen.category !== cat ? `Terpilih: ${chosen.name}. ` : ''}
        Dipakai untuk semua gambar di proyek ini, termasuk lembar karakter.
      </p>
    </section>
  )
}
