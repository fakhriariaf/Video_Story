import type { ReactNode } from 'react'
import { cx } from './cx'

/** One row of sprocket holes. Decoration only: it tells nothing the frames do not already say. */
function Holes({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('pointer-events-none absolute inset-x-3 h-2 rounded-sm', className)}
      style={{ background: 'repeating-linear-gradient(90deg, var(--color-line) 0 14px, transparent 14px 28px)' }}
    />
  )
}

// Column counts follow the strip's own width (container query), so they adapt to the space beside a rail or a slate.
const COLUMNS = {
  projects: 'grid-cols-3 @4xl:grid-cols-4',
  styles: 'grid-cols-4 @2xl:grid-cols-5'
}

/**
 * A list drawn as a strip of film: each child is a frame. Frames wrap to further rows. Used for the projects on Home
 * and the visual styles in the Idea step.
 */
export function FilmStrip({ children, columns = 'projects' }: { children: ReactNode; columns?: keyof typeof COLUMNS }) {
  return (
    <div className="@container relative rounded-[10px] bg-strip px-4 py-[22px]">
      <Holes className="top-[7px]" />
      <Holes className="bottom-[7px]" />
      <div className={cx('grid', columns === 'styles' ? 'gap-2.5' : 'gap-3.5', COLUMNS[columns])}>{children}</div>
    </div>
  )
}
