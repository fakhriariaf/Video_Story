import { stat } from 'node:fs/promises'
import { nativeImage } from 'electron'
import type { MediaModel, MediaProvider } from '@shared/media'
import type { Asset, CreditEstimate } from '@shared/types'
import { assetAbsPath } from '../paths'
import { updateAssetMeta } from '../repo'
import * as fal from '../services/fal'
import * as geminiMedia from '../services/gemini-media'
import * as hf from '../services/higgsfield'

/**
 * One adapter per image/video provider, so generation.ts runs every job the same way: prepare the reference
 * images, submit, wait (also after a restart), download, and estimate what a request costs.
 */

const DAY = 24 * 60 * 60 * 1000

export interface MediaResult {
  url?: string
  bytes?: Buffer
  contentType?: string
}

export interface Submitted {
  remoteId: string
  resume?: Record<string, string>
}

export type Tick = (state: 'queued' | 'running', elapsedMs: number) => void

export interface MediaBackend {
  label: string
  queue: MediaProvider
  /** A reference image or first frame in the form the provider takes: a public URL, or a data URI for Gemini. */
  prepareRef(asset: Asset, signal: AbortSignal): Promise<string>
  /** Sends the request; providers that answer at once (Gemini images) return the result instead of an id. */
  submit(endpoint: string, body: Record<string, unknown>, kind: 'image' | 'video', signal: AbortSignal): Promise<Submitted | { done: MediaResult }>
  wait(remoteId: string, resume: Record<string, string> | undefined, onTick: Tick, signal: AbortSignal, timeoutMs: number): Promise<MediaResult>
  cancel(remoteId: string, resume?: Record<string, string>): Promise<void>
  estimate(m: MediaModel, request: { endpoint: string; body: Record<string, unknown> }, kind: 'image' | 'video', seconds: number): Promise<CreditEstimate | null>
}

const higgsfield: MediaBackend = {
  label: 'Higgsfield',
  queue: 'higgsfield',
  /** Higgsfield's own recent result URL, a recent upload, or a fresh upload. */
  async prepareRef(asset, signal) {
    if (asset.remoteUrl && asset.provider === 'higgsfield' && Date.now() - asset.createdAt < 6 * DAY) return asset.remoteUrl
    const up = asset.meta.uploadedUrl as string | undefined
    const at = asset.meta.uploadedAt as number | undefined
    if (up && at && Date.now() - at < 0.5 * DAY) return up
    const url = await hf.uploadFile(assetAbsPath(asset.projectId, asset.localPath), signal)
    updateAssetMeta(asset.id, { ...asset.meta, uploadedUrl: url, uploadedAt: Date.now() })
    return url
  },
  async submit(endpoint, body, _kind, signal) {
    return { remoteId: await hf.submit(endpoint, body, signal) }
  },
  async wait(remoteId, _resume, onTick, signal, timeoutMs) {
    const r = await hf.waitForResult(remoteId, (status, elapsed) => onTick(status === 'queued' ? 'queued' : 'running', elapsed), signal, timeoutMs)
    const url = r.video?.url ?? r.images?.[0]?.url
    if (!url) throw new Error('Higgsfield selesai tanpa file hasil')
    return { url }
  },
  cancel: (remoteId) => hf.cancelRequest(remoteId),
  estimate: (_m, request) => hf.estimate(request.endpoint, request.body)
}

const falBackend: MediaBackend = {
  label: 'fal.ai',
  queue: 'fal',
  async prepareRef(asset, signal) {
    if (asset.remoteUrl && asset.provider === 'fal' && Date.now() - asset.createdAt < 0.5 * DAY) return asset.remoteUrl
    const up = asset.meta.falUrl as string | undefined
    const at = asset.meta.falAt as number | undefined
    if (up && at && Date.now() - at < 0.5 * DAY) return up
    const url = await fal.uploadFile(assetAbsPath(asset.projectId, asset.localPath), signal)
    updateAssetMeta(asset.id, { ...asset.meta, falUrl: url, falAt: Date.now() })
    return url
  },
  async submit(endpoint, body, _kind, signal) {
    const s = await fal.submit(endpoint, body, signal)
    return { remoteId: s.requestId, resume: { statusUrl: s.statusUrl, responseUrl: s.responseUrl, cancelUrl: s.cancelUrl } }
  },
  async wait(_remoteId, resume, onTick, signal, timeoutMs) {
    if (!resume?.statusUrl || !resume.responseUrl) throw new Error('Permintaan fal.ai ini tidak bisa dilanjutkan. Coba lagi.')
    return fal.waitForResult({ statusUrl: resume.statusUrl, responseUrl: resume.responseUrl }, onTick, signal, timeoutMs)
  },
  async cancel(_remoteId, resume) {
    if (resume?.cancelUrl) await fal.cancel(resume.cancelUrl)
  },
  async estimate(_m, request, kind, seconds) {
    const usd = await fal.priceUsd(request.endpoint, kind, seconds)
    return usd == null ? null : { credits: null, usd }
  }
}

/** Gemini takes images inline; big sheets are shrunk so the request stays well under its size limit. */
async function dataUri(abs: string): Promise<string> {
  const img = nativeImage.createFromPath(abs)
  if (img.isEmpty()) throw new Error('Gambar referensi tidak bisa dibaca')
  if ((await stat(abs)).size <= 3 * 1024 * 1024) return /\.jpe?g$/i.test(abs) ? `data:image/jpeg;base64,${img.toJPEG(95).toString('base64')}` : img.toDataURL()
  const { width, height } = img.getSize()
  const scale = 1536 / Math.max(width, height)
  const small = scale < 1 ? img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' }) : img
  return `data:image/jpeg;base64,${small.toJPEG(90).toString('base64')}`
}

const gemini: MediaBackend = {
  label: 'Google Gemini',
  queue: 'gemini',
  prepareRef: (asset) => dataUri(assetAbsPath(asset.projectId, asset.localPath)),
  async submit(endpoint, body, kind, signal) {
    if (kind === 'image') return { done: await geminiMedia.generateImage(endpoint, body, signal) }
    const file = await geminiMedia.startVideo(body, signal)
    return { remoteId: file, resume: { file } }
  },
  async wait(remoteId, resume, onTick, signal, timeoutMs) {
    return geminiMedia.waitForVideo(resume?.file ?? remoteId, (elapsed) => onTick('running', elapsed), signal, timeoutMs)
  },
  // Omni has no cancel; the abandoned file expires on its own.
  cancel: async () => {},
  async estimate(m, _request, _kind, seconds) {
    if (!m.price) return null
    return { credits: null, usd: m.price.per === 'second' ? m.price.usd * seconds : m.price.usd }
  }
}

export const BACKENDS: Record<MediaProvider, MediaBackend> = { higgsfield, fal: falBackend, gemini }
