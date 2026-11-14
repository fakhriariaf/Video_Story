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

/**
 * The project list drawn as a strip of film: each child is a frame. Frames wrap to further rows, three per row in a
 * narrow window and four once the strip is wide enough.
 */
export function FilmStrip({ children }: { children: ReactNode }) {
  return (
    <div className="@container relative rounded-[10px] bg-strip px-4 py-[22px]">
      <Holes className="top-[7px]" />
      <Holes className="bottom-[7px]" />
      <div className="grid grid-cols-3 gap-3.5 @4xl:grid-cols-4">{children}</div>
    </div>
  )
}
