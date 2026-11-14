import { useMemo, type ReactNode } from 'react'
import { Film, Image as ImageIcon, Move, Users } from 'lucide-react'
import {
  effectiveResolution,
  fitDuration,
  getImageModel,
  getVideoModel,
  IMAGE_MODELS,
  MEDIA_PROVIDERS,
  maxRefs,
  mediaModelOptions,
  PROVIDER_LABEL,
  resolutionOptions,
  VIDEO_MODELS,
  type MediaProvider
} from '@shared/media'
import type { CreditEstimate, ModelOption, Project } from '@shared/types'
import { ModelLogo } from '../../components/ModelLogo'
import { ModelPicker } from '../../components/ModelPicker'
import { ProviderLogo } from '../../components/ProviderLogo'
import { Segmented } from '../../components/ui'
import { useEstimates } from '../../lib/useEstimate'

const IMAGE_OPTIONS = mediaModelOptions('image')
const VIDEO_OPTIONS = mediaModelOptions('video')
const PROVIDER_OF = new Map([...IMAGE_MODELS, ...VIDEO_MODELS].map((m) => [m.id, m.provider]))
const LOGO_OF = Object.fromEntries(MEDIA_PROVIDERS.map((p) => [PROVIDER_LABEL[p], p])) as Record<string, MediaProvider>

/** Locks rows of providers without a key, and adds each unlocked model's estimated price once it arrives. */
function decorate(options: ModelOption[], costs: Record<string, CreditEstimate | null>, unit: (id: string) => string, hasKey: (p: MediaProvider) => boolean): ModelOption[] {
  return options.map((o) => {
    const p = PROVIDER_OF.get(o.id)!
    if (!hasKey(p)) return { ...o, locked: `Isi kunci ${PROVIDER_LABEL[p]} di Pengaturan untuk memakai model ini` }
    return {
      ...o,
      credits: o.id in costs ? (costs[o.id]?.credits ?? null) : undefined,
      usd: costs[o.id]?.usd ?? null,
      creditUnit: unit(o.id)
    }
  })
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-line-2 bg-panel p-3.5">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-fg-2">
        {icon}
        {title}
      </span>
      {children}
    </div>
  )
}

/**
 * Which provider and model draw and animate this project's clips. What the choice costs is shown on the slate
 * beside the form; the pickers still list a price per model.
 */
export function ModelSection({
  project,
  perClip,
  keys,
  onChange
}: {
  project: Project
  perClip: number
  /** Providers with a saved key; null while the keys are still loading. */
  keys: Set<MediaProvider> | null
  onChange: (patch: { imageModel?: string; videoModel?: string; videoResolution?: string | null }) => void
}) {
  const image = getImageModel(project.imageModel)
  const video = getVideoModel(project.videoModel)
  const resolutions = resolutionOptions(video)
  const resolution = effectiveResolution(video, project.videoResolution)
  const hasKey = (p: MediaProvider): boolean => !!keys?.has(p)
  const imageIds = useMemo(() => IMAGE_OPTIONS.filter((o) => keys?.has(PROVIDER_OF.get(o.id)!)).map((o) => o.id), [keys])
  const videoIds = useMemo(() => VIDEO_OPTIONS.filter((o) => keys?.has(PROVIDER_OF.get(o.id)!)).map((o) => o.id), [keys])
  const imageCosts = useEstimates('image', imageIds, project.aspectRatio, undefined, imageIds.length > 0)
  const videoCosts = useEstimates('video', videoIds, project.aspectRatio, perClip, videoIds.length > 0)
  const imageModels = useMemo(() => decorate(IMAGE_OPTIONS, imageCosts, () => '', hasKey), [imageCosts, keys])
  const videoModels = useMemo(
    () => decorate(VIDEO_OPTIONS, videoCosts, (id) => `${fitDuration(getVideoModel(id), perClip)} dtk`, hasKey),
    [videoCosts, perClip, keys]
  )
  const anyKey = !!keys?.size

  return (
    <section className="flex flex-col gap-2.5" aria-label="Model AI">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-2xl font-semibold leading-none">Model AI</h2>
        <span className="text-[13px] text-muted">
          {IMAGE_OPTIONS.length} model gambar dan {VIDEO_OPTIONS.length} model video dari {MEDIA_PROVIDERS.length} penyedia
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card icon={<ImageIcon className="size-4" />} title="Gambar klip">
          <ModelPicker
            value={image.id}
            models={imageModels}
            footerNote={anyKey ? 'harga per gambar: kredit Higgsfield, dolar untuk fal.ai dan Gemini' : undefined}
            renderIcon={(m) => <ModelLogo family={m.family} />}
            renderGroup={(g) => LOGO_OF[g] && <ProviderLogo id={LOGO_OF[g]} size={18} />}
            detail="description"
            tagFilters={['Rekomendasi', 'Referensi', 'Murah', 'GPT Image', 'Soul', '4K']}
            menuClassName="w-[430px]"
            onChange={(id) => onChange({ imageModel: id })}
          />
          <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
            <Users className="mt-px size-3.5 shrink-0" />
            {maxRefs(image)
              ? 'Pakai lembar karakter, jadi wajah dan kostum tokoh tetap sama di tiap klip.'
              : 'Tanpa lembar karakter, jadi tampilan tokoh bisa sedikit berubah antar klip.'}
          </p>
        </Card>
        <Card icon={<Film className="size-4" />} title="Video AI">
          <ModelPicker
            value={video.id}
            models={videoModels}
            footerNote={anyKey ? `harga per video untuk klip ±${perClip} detik` : undefined}
            renderIcon={(m) => <ModelLogo family={m.family} />}
            renderGroup={(g) => LOGO_OF[g] && <ProviderLogo id={LOGO_OF[g]} size={18} />}
            detail="description"
            tagFilters={['Rekomendasi', 'Kling', 'Seedance', 'Wan', 'Murah', '4K']}
            align="right"
            menuClassName="w-[430px]"
            onChange={(id) => onChange({ videoModel: id })}
          />
          {resolutions.length > 1 ? (
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 text-[12.5px] font-medium text-fg-2">Resolusi</span>
              <Segmented
                size="sm"
                value={resolution ?? resolutions[0]}
                onChange={(v) => onChange({ videoResolution: v })}
                options={resolutions.map((r) => ({ id: r, label: /^\d+k$/i.test(r) ? r.toUpperCase() : r }))}
                className="min-w-0 flex-1"
              />
            </div>
          ) : (
            resolution && <p className="text-[12.5px] text-fg-2">Resolusi {resolution} (satu-satunya pilihan model ini)</p>
          )}
          <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
            <Move className="mt-px size-3.5 shrink-0" />
            Hanya untuk klip yang kamu jadikan Video AI. Gerak kamera tetap gratis.
          </p>
        </Card>
      </div>
    </section>
  )
}
