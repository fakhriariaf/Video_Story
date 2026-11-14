import { effectiveResolution, getImageModel, getVideoModel, PROVIDER_LABEL, type MediaProvider } from '@shared/media'
import { clipCountFor } from '@shared/models'
import { costLines, slateRows, slateTimecode } from '@shared/slate'
import type { Project } from '@shared/types'
import { StyleSwatch } from '../../components/StyleArt'
import { cx } from '../../components/ui'
import { useEstimate } from '../../lib/useEstimate'

/**
 * The clapper slate of the Idea step: what this project will be, like the board held up before a take. It shows a
 * frame in the chosen format, every choice in one list, and what the pictures and videos will cost.
 */
export function IdeaSlate({
  project,
  voiceName,
  hasKey
}: {
  project: Project
  voiceName: string | null
  /** Whether a provider's key is saved; null while the keys are still loading. */
  hasKey: (p: MediaProvider) => boolean | null
}) {
  const image = getImageModel(project.imageModel)
  const video = getVideoModel(project.videoModel)
  const clipCount = clipCountFor(project.durationSec)
  const perClip = Math.round(project.durationSec / clipCount)
  const imageKey = hasKey(image.provider)
  const videoKey = hasKey(video.provider)
  const imageCost = useEstimate('image', image.id, project.aspectRatio, undefined, undefined, imageKey === true)
  const videoCost = useEstimate('video', video.id, project.aspectRatio, perClip, effectiveResolution(video, project.videoResolution), videoKey === true)
  const rows = slateRows({ ...project, voiceName })
  const loading = imageKey === null || (imageKey && imageCost === undefined) || (videoKey && videoCost === undefined)
  const costs = costLines({
    clipCount,
    perClipSec: perClip,
    image: imageCost ?? null,
    video: videoCost ?? null,
    imageKey: imageKey === true,
    videoKey: videoKey === true,
    imageProvider: PROVIDER_LABEL[image.provider],
    videoProvider: PROVIDER_LABEL[video.provider]
  })
  const portrait = project.aspectRatio === '9:16'
  return (
    <aside className="overflow-hidden rounded-[14px] border border-line-2 bg-panel" aria-label="Ringkasan proyek">
      {/* The clapper stripes are the one ornament of this page; they carry no information. */}
      <div
        aria-hidden="true"
        className="h-[26px]"
        style={{ background: 'repeating-linear-gradient(-55deg, var(--color-fg) 0 22px, var(--color-strip) 22px 44px)' }}
      />
      <div className="flex flex-col px-4 pb-4 pt-3.5">
        <h2 className="line-clamp-2 font-display text-[22px] font-semibold leading-tight">{project.title}</h2>
        <div className="mb-1 mt-3 flex justify-center rounded-md bg-strip">
          <div className={cx('relative overflow-hidden rounded-md', portrait ? 'aspect-[9/16] w-[46%]' : 'aspect-video w-full')}>
            <StyleSwatch styleId={project.styleId} className="size-full" iconSize={40} />
            <span className="absolute bottom-2 right-2 rounded bg-strip/85 px-1.5 font-display text-[15px] font-semibold tracking-wide text-fg">
              {slateTimecode(project.durationSec)}
            </span>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] text-sm">
          {rows.map((r) => (
            <div key={r.label} className="col-span-2 grid grid-cols-subgrid border-b border-line py-[7px]">
              <dt className="pr-3 text-muted">{r.label}</dt>
              <dd className="truncate text-right font-medium" title={r.value}>
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-col gap-1 rounded-lg bg-canvas px-3 py-2.5 text-[13.5px] leading-snug text-fg-2">
          {loading ? <span className="text-muted">Menghitung perkiraan harga…</span> : costs.map((c) => <span key={c}>{c}</span>)}
        </div>
      </div>
    </aside>
  )
}
