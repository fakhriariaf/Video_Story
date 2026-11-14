import { useEffect, useState } from 'react'
import { workLine } from '@shared/work'

/**
 * Takes the left side of a step's footer while the story model works: what is happening, for how long, and a moving
 * bar along the footer's top edge. The footer must be positioned (it is `absolute` in every step).
 */
export function WorkNote({ title, typicalSec }: { title: string; typicalSec: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Date.now() - started), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span aria-hidden="true" className="absolute inset-x-0 -top-px h-[3px] overflow-hidden bg-line">
        <span className="block h-full w-1/3 animate-[work-slide_1.6s_ease-in-out_infinite] rounded-full bg-accent motion-reduce:w-full motion-reduce:animate-[pulse-soft_1.6s_ease-in-out_infinite]" />
      </span>
      <span role="status" className="truncate text-[15px] font-semibold">
        {title}
      </span>
      {/* The clock ticks every second; read aloud it would never stop talking. */}
      <span aria-hidden="true" className="truncate text-[13px] tabular-nums text-muted">
        {workLine(elapsed, typicalSec)}
      </span>
    </div>
  )
}
