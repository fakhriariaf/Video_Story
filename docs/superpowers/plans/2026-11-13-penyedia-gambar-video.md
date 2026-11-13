# Penyedia Gambar & Video (Gemini dan fal.ai) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gambar klip, lembar karakter, dan video AI bisa dibuat lewat Higgsfield, fal.ai, atau Google Gemini, dipilih per proyek.

**Architecture:**
- Katalog model Higgsfield di `src/shared/higgsfield.ts` menjadi katalog umum `src/shared/media.ts` (`MediaModel` dengan `provider`). Isinya digabung dari tiga sumber: katalog Higgsfield (apa adanya), `fal-catalog.json` (dibuat skrip dari OpenAPI fal.ai), dan model Gemini yang ditulis tangan.
- Pembentuk isian permintaan tetap di `shared`, sehingga estimasi dan pratinjau memakai aturan yang sama.
- Di proses utama, `generation.ts` memanggil satu antarmuka `MediaBackend` per penyedia (`src/main/media/backends.ts`) dan tidak lagi memanggil `services/higgsfield.ts` langsung.
- Bagian murni dari setiap layanan baru (pesan error, membaca status, harga) dipisah ke file `*-format.ts` supaya bisa dites tanpa Electron.

**Tech Stack:** Electron 44, TypeScript 5.9 strict, React 19, better-sqlite3, `node:test` + esbuild (`npm test`). Tidak ada dependensi baru.

**Spec:** `docs/superpowers/specs/2026-11-13-penyedia-gambar-video-design.md`

## Global Constraints

**Aturan proyek (AGENTS.md)**
- Teks UI berbahasa Indonesia dengan "kamu". Komentar dan nama di kode berbahasa Inggris. Komentar menjelaskan *kenapa*.
- TypeScript strict (`noUnusedLocals`/`noUnusedParameters`). `npm run typecheck`, `npm test`, dan `npm run build` wajib bersih di akhir setiap task.
- IPC baru ditambah di tiga tempat: `src/main/ipc.ts`, `src/shared/api.ts`, `src/preload/index.ts`.
- **Tidak ada migrasi database.** ID model disimpan sebagai teks: model Higgsfield **tanpa awalan** (ID lama tetap valid), model baru berawalan `fal:` dan `gemini:`.
- Kunci API tidak pernah dicetak ke log, pesan error, atau file. Kunci hanya dikirim ke layanannya sendiri.
- Aturan yang memengaruhi hasil (durasi, resolusi, isian) ditulis sekali di `src/shared/` lalu dipakai renderer dan main.
- Tidak memakai `<select>` bawaan (pakai `Select`/`Popover`/`ModelPicker`).

**fal.ai**
- Antrean: `POST https://queue.fal.run/{endpoint}`, header `Authorization: Key <kunci>`.
  - Respons: `request_id`, `status_url`, `response_url`, `cancel_url`.
  - Status: `IN_QUEUE`, `IN_PROGRESS`, `COMPLETED`.
  - Batal: `PUT {cancel_url}`.
- Skema isian: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>`.
- Unggah file: `POST https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3` dengan body `{file_name, content_type}`, menghasilkan `upload_url` dan `file_url`. Lalu `PUT upload_url` berisi byte file.
- Harga: `GET https://api.fal.ai/v1/models/pricing?endpoint_id=<endpoint>`.

**Gemini**
- Header `x-goog-api-key`, base `https://generativelanguage.googleapis.com/v1beta`.
- Gambar: `POST models/{model}:generateContent` dengan `generationConfig.responseModalities: ["TEXT","IMAGE"]`, `imageConfig.aspectRatio`, dan `imageConfig.imageSize` (`2K` bila model mendukung). Referensi dikirim sebagai `inline_data`.
- Video: `POST models/{veo}:predictLongRunning`.
  - `instances[0]`: `{ prompt, image: { inlineData: { mimeType, data } } }`.
  - `parameters`: `{ aspectRatio, durationSeconds, resolution, personGeneration: "allow_adult" }`.
  - Poll `GET {operation.name}` sampai `done`, lalu unduh `response.generateVideoResponse.generatedSamples[0].video.uri` dengan header kunci.
- Veo: durasi 4/6/8 detik. `1080p`/`4k` hanya 8 detik. **Klip yang butuh di bawah 8 detik dengan 1080p/4k diturunkan ke `720p`** (keputusan pemilik).

**Model dan teks**
- Model bawaan tetap `marketing-studio/image/sunburst` dan `kling-video/v3.0/std/image-to-video`. Kalau kunci Higgsfield tidak ada, proyek baru memakai model rekomendasi penyedia pertama yang kuncinya ada, dengan urutan `higgsfield`, `fal`, `gemini`.
- Pesan error yang dipatok spec:
  - "Gambar dan video Gemini butuh billing aktif di Google AI Studio."
  - "Saldo fal.ai habis. Isi ulang di fal.ai/dashboard/billing."
  - "Kunci fal.ai tidak valid…"

## Review Focus

1. **Job lama setelah pembaruan.** Job Higgsfield yang terkirim sebelum pembaruan tidak punya `provider` di payload. `resumePlan` tetap memperlakukannya sebagai Higgsfield. Dites di Task 5 (`resumePlan treats legacy payload as higgsfield`).
2. **Gemini mengembalikan teks tanpa gambar, atau memblokir karena keamanan.** Hasilnya harus error berbahasa Indonesia yang menyarankan mengubah adegan, bukan `undefined`. Dites di Task 4 (`imageFromResponse` blocked/no image).
3. **ID model tersimpan yang sudah hilang dari katalog** (misalnya `fal:` yang dibuang, atau awalan asing) harus jatuh ke model bawaan, bukan crash. Dites di Task 1.
4. **Klip lebih panjang dari 8 detik dengan Veo** menghasilkan video 8 detik dengan resolusi pilihan. Sisa klip memakai frame terakhir (perilaku lama). Dites di Task 1 (`videoPlan 12 s`).
5. **Kunci penyedia model proyek dihapus** setelah proyek dibuat. Membuat gambar harus gagal dengan pesan "Kunci API fal.ai belum diatur…" (`requireSecret`), dan job tercatat gagal, bukan menggantung. Dicek manual di Task 8.

---

### Task 1: Katalog model umum (`src/shared/media.ts`)

**Files:**
- Rename: `src/shared/higgsfield.ts` → `src/shared/media.ts`. Perbarui semua import `@shared/higgsfield` (main: `generation.ts`, `settings.ts`; renderer: `ModelSection.tsx`, `StoryboardStep.tsx`, `IdeaStep.tsx`, `Settings.tsx`).
- Create: `src/shared/gemini-media.ts` (model Gemini yang ditulis tangan + pembentuk isian Gemini)
- Create: `src/shared/fal-catalog.json` (sementara `{"source":"fal.ai","fetchedAt":"","models":[]}`; diisi di Task 2)
- Test: `src/shared/media.test.ts`

**Interfaces — Produces:**

```ts
export type MediaProvider = 'higgsfield' | 'fal' | 'gemini'
export interface MediaVariant { endpoint: string; input: MediaModel['input']; required: string[]; props: Record<string, FieldSchema> }
export interface MediaModel {
  id: string                 // stored id: Higgsfield id as-is, 'fal:<endpoint>', 'gemini:<model>'
  provider: MediaProvider
  endpoint: string           // what the provider API is called with
  name: string; family: string; kind: 'image' | 'video'
  input: { field: string | null; mode: 'none' | 'first-frame' | 'reference'; max: number }
  required: string[]; props: Record<string, FieldSchema>
  durations: { values: number[] } | { min: number; max: number } | null
  tags: string[]
  withRefs?: MediaVariant                          // fal edit endpoint used when reference sheets are sent
  durationsByResolution?: Record<string, number[]> // Veo: { '1080p': [8], '4k': [8] }
  price?: { usd: number; per: 'image' | 'second'; byResolution?: Record<string, number> } // published price (Gemini)
}
export const MEDIA_PROVIDERS: MediaProvider[]              // ['higgsfield','fal','gemini']
export const PROVIDER_LABEL: Record<MediaProvider, string> // Higgsfield, fal.ai, Google Gemini
export const RECOMMENDED: Record<MediaProvider, { image: string; video: string }>
export const IMAGE_MODELS: MediaModel[]; export const VIDEO_MODELS: MediaModel[]
export function getImageModel(id?: string | null): MediaModel  // unknown -> DEFAULT_IMAGE_MODEL
export function getVideoModel(id?: string | null): MediaModel
export function videoPlan(m: MediaModel, seconds: number, want?: string | null): { duration: number | null; resolution: string | null }
export function effectiveResolution(m: MediaModel, want?: string | null, seconds?: number): string | null
export function imageRequest(m: MediaModel, prompt: string, aspect: AspectRatio, refs: string[]): { endpoint: string; body: Record<string, unknown> }
export function videoRequest(m: MediaModel, prompt: string, image: string, seconds: number, aspect: AspectRatio, resolution?: string | null): { endpoint: string; body: Record<string, unknown> }
export function mediaModelOptions(kind: 'image' | 'video'): ModelOption[] // grouped by provider, RECOMMENDED first in each group
export function newProjectModels(current: { imageModel: string; videoModel: string }, hasKey: (p: MediaProvider) => boolean): { imageModel: string; videoModel: string }
```

Tetap diekspor dengan perilaku sama: `maxRefs`, `promptLimit`, `fitDuration`, `durationLabel`, `resolutionOptions`, `NO_MUSIC`, `videoPrompt`, `describeModel`, `DEFAULT_IMAGE_MODEL`, `DEFAULT_VIDEO_MODEL`.

**Aturan:**
- Model Higgsfield mendapat `provider: 'higgsfield'` dan `endpoint = id` saat katalog dimuat. JSON-nya tidak diubah.
- Model fal mendapat `id = 'fal:' + endpoint`.
- Untuk model Gemini, `imageRequest` dan `videoRequest` mendelegasikan ke `geminiImageBody` dan `veoBody` di `gemini-media.ts`. Kedua fungsi itu menerima referensi/gambar awal berupa **data URI** (`data:image/png;base64,...`) dan memecahnya menjadi `{mimeType, data}`.
- `maxRefs(m)` memakai `m.withRefs.input.max` kalau model punya varian referensi (fal), selain itu aturan lama.
- `ModelOption` (di `shared/types.ts`) mendapat `group?: string` (label penyedia). Daftar dari `mediaModelOptions` diurutkan per `MEDIA_PROVIDERS`.
- Isi awal `gemini-media.ts`:
  - Gambar: Nano Banana 2 (`gemini-3.1-flash-image`, referensi maks 14, `imageSize` 2K) dan Nano Banana Pro (`gemini-3-pro-image`).
  - Video: Veo 3.1 Fast dan Veo 3.1 (`resolution` enum `720p`/`1080p`/`4k`, `durations.values [4,6,8]`, `durationsByResolution {'1080p':[8],'4k':[8]}`, `input.mode 'first-frame'`).
  - Nama model dan `price` dicek di ai.google.dev/gemini-api/docs/pricing dan models saat membangun. Perbedaannya dicatat sebagai ruling.

- [ ] **Step 1: Write the failing tests** di `src/shared/media.test.ts`:

```ts
test('legacy Higgsfield ids still resolve unchanged', () => {
  assert.equal(getImageModel('marketing-studio/image/sunburst').provider, 'higgsfield')
  assert.equal(getVideoModel('kling-video/v3.0/std/image-to-video').endpoint, 'kling-video/v3.0/std/image-to-video')
})
test('unknown or removed ids fall back to the defaults', () => {
  assert.equal(getImageModel('fal:does/not-exist').id, DEFAULT_IMAGE_MODEL)
  assert.equal(getVideoModel('weird:thing').id, DEFAULT_VIDEO_MODEL)
  assert.equal(getImageModel(null).id, DEFAULT_IMAGE_MODEL)
})
test('gemini models are addressable with their prefix', () => {
  const m = getImageModel('gemini:gemini-3.1-flash-image')
  assert.equal(m.provider, 'gemini'); assert.equal(m.endpoint, 'gemini-3.1-flash-image')
})
test('videoPlan drops Veo to 720p when the clip needs less than 8 s', () => {
  const veo = getVideoModel(RECOMMENDED.gemini.video)
  assert.deepEqual(videoPlan(veo, 3, '1080p'), { duration: 4, resolution: '720p' })
  assert.deepEqual(videoPlan(veo, 5, '4k'), { duration: 6, resolution: '720p' })
  assert.deepEqual(videoPlan(veo, 7.5, '1080p'), { duration: 8, resolution: '1080p' })
  assert.deepEqual(videoPlan(veo, 12, '1080p'), { duration: 8, resolution: '1080p' })
})
test('videoPlan keeps Higgsfield behaviour', () => {
  const kling = getVideoModel(DEFAULT_VIDEO_MODEL)
  assert.equal(videoPlan(kling, 4, null).duration, fitDuration(kling, 4))
})
test('geminiImageBody sends prompt, references as inline data and the frame', () => {
  const m = getImageModel('gemini:gemini-3.1-flash-image')
  const { endpoint, body } = imageRequest(m, 'a cat', '9:16', ['data:image/png;base64,AAA'])
  assert.equal(endpoint, 'gemini-3.1-flash-image')
  const parts = (body as any).contents[0].parts
  assert.deepEqual(parts[1], { inline_data: { mime_type: 'image/png', data: 'AAA' } })
  assert.equal((body as any).generationConfig.imageConfig.aspectRatio, '9:16')
  assert.deepEqual((body as any).generationConfig.responseModalities, ['TEXT', 'IMAGE'])
})
test('veoBody sends first frame, string duration, 720p fallback and allow_adult', () => {
  const v = getVideoModel(RECOMMENDED.gemini.video)
  const { body } = videoRequest(v, 'walks', 'data:image/jpeg;base64,BBB', 3, '16:9', '1080p')
  const b = body as any
  assert.deepEqual(b.instances[0].image, { inlineData: { mimeType: 'image/jpeg', data: 'BBB' } })
  assert.equal(b.parameters.durationSeconds, '4'); assert.equal(b.parameters.resolution, '720p')
  assert.equal(b.parameters.personGeneration, 'allow_adult'); assert.equal(b.parameters.aspectRatio, '16:9')
  assert.match(b.instances[0].prompt, /Silent clip/)
})
test('newProjectModels keeps a model whose provider has a key', () => {
  const cur = { imageModel: DEFAULT_IMAGE_MODEL, videoModel: DEFAULT_VIDEO_MODEL }
  assert.deepEqual(newProjectModels(cur, (p) => p === 'higgsfield'), cur)
})
test('newProjectModels falls back to the first provider with a key', () => {
  const cur = { imageModel: DEFAULT_IMAGE_MODEL, videoModel: DEFAULT_VIDEO_MODEL }
  assert.deepEqual(newProjectModels(cur, (p) => p === 'gemini'), { imageModel: RECOMMENDED.gemini.image, videoModel: RECOMMENDED.gemini.video })
  assert.deepEqual(newProjectModels(cur, () => false), cur)
})
test('options are grouped by provider in a fixed order', () => {
  const groups = [...new Set(mediaModelOptions('image').map((o) => o.group))]
  assert.equal(groups[0], 'Higgsfield')
  assert.equal(groups[groups.length - 1], 'Google Gemini')
})
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (`media.ts` belum ada).
- [ ] **Step 3: Implement.**
  - `git mv src/shared/higgsfield.ts src/shared/media.ts`, lalu terapkan tipe dan fungsi di atas.
  - `imageBody`/`videoBody` menjadi `imageRequest`/`videoRequest`. Untuk fal `withRefs`, isian dibangun dari varian saat `refs.length > 0`.
  - `videoRequest` memakai `videoPlan` untuk durasi dan resolusi.
  - Perbarui semua pemanggil (`generation.ts` memakai `.body`/`.endpoint`; `estimateCredits` juga). Tes `npm run typecheck` harus bersih.
  - Di AGENTS.md aturan 1, ganti `higgsfield.ts` menjadi `media.ts`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS, bersih.
- [ ] **Step 5: Commit** (ikut sertakan file spec dan plan):

```bash
git add -A src/shared AGENTS.md src/main src/renderer docs/superpowers
git commit -m "refactor: general media model catalog with Gemini models and Veo 720p fallback"
```

### Task 2: Daftar model fal.ai

**Files:**
- Create: `scripts/fal-catalog.mjs`
- Modify: `src/shared/fal-catalog.json` (hasil skrip)
- Test: `src/shared/media.test.ts` (tambah)

**Interfaces:**
- Consumes: bentuk `MediaModel`/`MediaVariant` dari Task 1.
- Produces: `fal-catalog.json` `{ source, fetchedAt, models: MediaModel[] }`, yang dimuat `media.ts` dengan `provider: 'fal'` dan `id: 'fal:' + endpoint`. `RECOMMENDED.fal` diisi dengan endpoint terpilih.

**Skrip:**
- Daftar kurasi ditulis di dalam skrip sebagai entri `{ endpoint, refEndpoint?, name, family, kind, inputField, refField?, mode, tags }`.
- Daftar awal sesuai spec bagian 1:
  - Gambar: Nano Banana 2 (+edit), Flux Kontext Pro/Max, Seedream (+edit), Flux dev/pro, Qwen Image (+edit).
  - Video image-to-video: Kling standar/pro terbaru, Seedance lite/pro, Hailuo, Wan, Veo 3.1 Fast.
- Untuk setiap entri:
  - Ambil OpenAPI-nya. Input schema adalah request body dari operasi `POST` (`$ref` di-resolve dari `components.schemas`).
  - Simpan `props`, `required`, dan `durations` dari enum atau rentang `duration`. Nilai string seperti `"5"` diubah ke angka.
  - Varian edit disimpan ke `withRefs`. `input.max` diambil dari `maxItems` field referensi.
- Endpoint yang tidak ditemukan (404) atau yang `required`-nya berisi field yang tidak bisa diisi aplikasi (selain prompt, gambar, aspect_ratio, resolution, duration) **dilewati dengan peringatan**, bukan menggagalkan skrip.
- Jalankan: `node scripts/fal-catalog.mjs`. Butuh internet, tanpa kunci.

- [ ] **Step 1: Write the failing test:**

```ts
test('every fal model builds a request that satisfies its schema', () => {
  const fal = [...IMAGE_MODELS, ...VIDEO_MODELS].filter((m) => m.provider === 'fal')
  assert.ok(fal.length >= 10, 'fal catalog has at least 10 models')
  for (const m of fal) {
    const r = m.kind === 'image'
      ? imageRequest(m, 'p', '16:9', maxRefs(m) ? ['https://x/a.png'] : [])
      : videoRequest(m, 'p', 'https://x/a.png', 5, '9:16', null)
    const variant = m.kind === 'image' && maxRefs(m) && m.withRefs ? m.withRefs : m
    for (const f of variant.required) assert.ok(r.body[f] !== undefined, `${m.id} misses ${f}`)
    assert.equal(r.endpoint, variant.endpoint)
  }
})
test('fal image models without references use the text-to-image endpoint', () => {
  const m = IMAGE_MODELS.find((x) => x.provider === 'fal' && x.withRefs)!
  assert.equal(imageRequest(m, 'p', '16:9', []).endpoint, m.endpoint)
})
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (`fal catalog has at least 10 models`).
- [ ] **Step 3: Tulis skrip, jalankan, lalu commit hasil JSON-nya.** Isi `RECOMMENDED.fal`: gambar = Nano Banana 2 (edit tersedia), video = Kling standar terbaru. Model yang dilewati dan endpoint yang diganti dicatat sebagai ruling.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add scripts/fal-catalog.mjs src/shared/fal-catalog.json src/shared/media.ts src/shared/media.test.ts
git commit -m "feat: curated fal.ai image and video catalog generated from fal OpenAPI"
```

### Task 3: Layanan fal.ai

**Files:**
- Create: `src/main/services/fal-format.ts` (murni), `src/main/services/fal.ts`
- Test: `src/main/services/fal-format.test.ts`

**Interfaces — Produces:**

```ts
// fal-format.ts
export function falError(status: number, body: string): ApiError   // Indonesian, retryable for 429/5xx
export function falUsd(price: { unit_price: number; unit: string } | null, kind: 'image' | 'video', seconds: number): number | null
// fal.ts
export interface FalSubmitted { requestId: string; statusUrl: string; responseUrl: string; cancelUrl: string }
export async function submit(endpoint: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<FalSubmitted>
export async function waitForResult(s: Pick<FalSubmitted, 'statusUrl' | 'responseUrl'>, onTick: (state: 'queued' | 'running', elapsedMs: number) => void, signal?: AbortSignal, timeoutMs?: number): Promise<{ url: string }>
export async function cancel(cancelUrl: string): Promise<void>
export async function uploadFile(absPath: string, signal?: AbortSignal): Promise<string>  // file_url
export async function priceUsd(endpoint: string, kind: 'image' | 'video', seconds: number): Promise<number | null>
export async function testKey(key?: string): Promise<KeyTestResult>  // pricing call, no spend
```

**Aturan:**
- Hasil gambar diambil dari `images[0].url`, hasil video dari `video.url`.
- `waitForResult` memakai pola backoff 2 s → 10 s seperti Higgsfield, lalu `GET responseUrl` setelah `COMPLETED`. Respons berisi `error`/`detail` dilempar lewat `falError`.
- `falError`:
  - 401/403 → "Kunci fal.ai tidak valid. Buat kunci baru di fal.ai/dashboard/keys lalu tempel di Pengaturan."
  - Detail berisi `balance`/`exhausted`/`locked`, atau status 402 → "Saldo fal.ai habis. Isi ulang di fal.ai/dashboard/billing."
  - 422 → "fal.ai menolak isian: <detail>."
  - 429 dan ≥500 → retryable.
- `falUsd`:
  - unit `image`/`images` → `unit_price`.
  - unit `second`/`seconds` → `unit_price * seconds`.
  - unit `video`/`videos` → `unit_price`.
  - unit lain (misalnya `megapixel`) → `null`.
- Kunci diambil dari `requireSecret('fal')` (Task 6 menambah `'fal'` ke `ApiProvider`; sampai saat itu task ini menambahkannya ke tipe dan `PROVIDERS`/`PROVIDER_NAMES` di `secrets.ts`).

- [ ] **Step 1: Write the failing tests:**

```ts
test('falError explains a bad key', () => assert.match(falError(401, '{"detail":"Unauthorized"}').message, /Kunci fal\.ai tidak valid/))
test('falError explains an empty balance', () => {
  assert.match(falError(403, '{"detail":"User is locked. Reason: Exhausted balance."}').message, /Saldo fal\.ai habis/)
})
test('falError marks rate limits and server errors retryable', () => {
  assert.equal(falError(429, '').retryable, true); assert.equal(falError(503, '').retryable, true); assert.equal(falError(422, '{"detail":[{"msg":"bad"}]}').retryable, false)
})
test('falUsd prices per image, per second and per video', () => {
  assert.equal(falUsd({ unit_price: 0.04, unit: 'image' }, 'image', 0), 0.04)
  assert.equal(falUsd({ unit_price: 0.1, unit: 'seconds' }, 'video', 5), 0.5)
  assert.equal(falUsd({ unit_price: 0.3, unit: 'video' }, 'video', 5), 0.3)
  assert.equal(falUsd({ unit_price: 0.02, unit: 'megapixel' }, 'image', 0), null)
  assert.equal(falUsd(null, 'image', 0), null)
})
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** kedua file. `falError` membaca detail lewat logika yang sama dengan `readError` (pisahkan bagian murninya dari `http.ts` bila perlu).
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: fal.ai queue, upload and pricing client"`

### Task 4: Layanan gambar dan video Gemini

**Files:**
- Create: `src/main/services/gemini-media-format.ts` (murni), `src/main/services/gemini-media.ts`
- Test: `src/main/services/gemini-media-format.test.ts`

**Interfaces — Produces:**

```ts
// gemini-media-format.ts
export function imageFromResponse(json: unknown): { mimeType: string; data: string }   // throws Error (Indonesian)
export function videoUriFromOperation(json: unknown): { done: false } | { done: true; uri: string } // throws on error/filtered
export function geminiMediaError(status: number, body: string): ApiError
// gemini-media.ts
export async function generateImage(model: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<{ bytes: Buffer; contentType: string }>
export async function startVideo(model: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<string> // operation name
export async function waitForVideo(operation: string, onTick: (elapsedMs: number) => void, signal?: AbortSignal, timeoutMs?: number): Promise<{ bytes: Buffer; contentType: string }>
```

**Aturan:**
- `imageFromResponse`:
  - Ambil bagian `inlineData` (atau `inline_data`) pertama dari `candidates[0].content.parts`.
  - Kalau ada `promptFeedback.blockReason` atau `finishReason` berisi `SAFETY`/`IMAGE_SAFETY`/`PROHIBITED`, lempar "Gemini menolak membuat gambar adegan ini karena aturan keamanan konten. Ubah deskripsi adegannya lalu coba lagi."
  - Kalau tidak ada gambar, lempar "Gemini tidak mengembalikan gambar. Coba lagi atau pilih model lain."
- `videoUriFromOperation`:
  - Kalau ada `error.message`, lempar "Veo gagal membuat video: …".
  - Kalau `generateVideoResponse.raiMediaFilteredReasons` tidak kosong, lempar pesan keamanan konten seperti di atas, untuk video.
- `geminiMediaError`:
  - 429/`RESOURCE_EXHAUSTED` yang menyebut `free_tier` atau `limit: 0`, atau 400 `FAILED_PRECONDITION` billing → "Gambar dan video Gemini butuh billing aktif di Google AI Studio."
  - 429 lain → retryable dengan pesan kuota.
  - 401/403 → kunci tidak valid.
  - ≥500 → retryable.
- Unduh video memakai `fetch(uri, { headers: { 'x-goog-api-key': key }, redirect: 'follow' })`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('imageFromResponse returns the first inline image', () => {
  const r = imageFromResponse({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: 'QQ' } }] } }] })
  assert.deepEqual(r, { mimeType: 'image/png', data: 'QQ' })
})
test('imageFromResponse explains a safety block', () => {
  assert.throws(() => imageFromResponse({ promptFeedback: { blockReason: 'SAFETY' } }), /aturan keamanan konten/)
  assert.throws(() => imageFromResponse({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }), /aturan keamanan konten/)
})
test('imageFromResponse explains a text-only answer', () => {
  assert.throws(() => imageFromResponse({ candidates: [{ content: { parts: [{ text: 'no' }] } }] }), /tidak mengembalikan gambar/)
})
test('videoUriFromOperation reads pending, done and filtered operations', () => {
  assert.deepEqual(videoUriFromOperation({ name: 'op', done: false }), { done: false })
  assert.deepEqual(videoUriFromOperation({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://v' } }] } } }), { done: true, uri: 'https://v' })
  assert.throws(() => videoUriFromOperation({ done: true, response: { generateVideoResponse: { raiMediaFilteredReasons: ['x'] } } }), /aturan keamanan konten/)
  assert.throws(() => videoUriFromOperation({ done: true, error: { message: 'boom' } }), /Veo gagal membuat video: boom/)
})
test('geminiMediaError asks for billing when the free tier has no quota', () => {
  const body = '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 0"}}'
  assert.equal(geminiMediaError(429, body).message, 'Gambar dan video Gemini butuh billing aktif di Google AI Studio.')
  assert.equal(geminiMediaError(503, '').retryable, true)
})
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Kunci diambil dari `requireSecret('gemini')`. Interval poll Veo 10 s; timeout bawaan 15 menit.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: Gemini image (Nano Banana) and Veo video client"`

### Task 5: Lapisan penyedia di proses utama

**Files:**
- Create: `src/main/media/payload.ts` (murni), `src/main/media/backends.ts`
- Modify: `src/main/generation.ts`, `src/main/jobs.ts` (`QueueName`, `LIMITS`, `cancelJob`), `src/main/ipc.ts` (`generate:estimate`), `src/shared/types.ts` (`CreditEstimate`)
- Test: `src/main/media/payload.test.ts`

**Interfaces:**
- Consumes: Task 1 (`imageRequest`, `videoRequest`, `getImageModel`, `getVideoModel`, `videoPlan`, `MediaProvider`), Task 3 (`fal.*`), Task 4 (`geminiMedia.*`).
- Produces:

```ts
// payload.ts
export interface MediaPayload {
  target: 'clip-image' | 'sheet' | 'clip-video'; model: string; prompt: string
  provider?: MediaProvider              // absent on jobs saved before this change = higgsfield
  resume?: Record<string, string>       // fal: statusUrl/responseUrl/cancelUrl; gemini video: operation
}
export function resumePlan(row: { provider: string; remote_id: string | null; payload_json: string | null }): { provider: MediaProvider; payload: MediaPayload } | null
// backends.ts
export interface MediaResult { url?: string; bytes?: Buffer; contentType?: string }
export interface MediaBackend {
  label: string                                         // 'Higgsfield' | 'fal.ai' | 'Google Gemini'
  queue: QueueName                                      // 'higgsfield' | 'fal' | 'gemini'
  prepareRef(asset: Asset, signal: AbortSignal): Promise<string>  // URL, or data URI for Gemini
  submit(endpoint: string, body: Record<string, unknown>, kind: 'image' | 'video', signal: AbortSignal): Promise<{ remoteId: string; resume?: Record<string, string> } | { done: MediaResult }>
  wait(remoteId: string, resume: Record<string, string> | undefined, kind: 'image' | 'video', onTick: (state: 'queued' | 'running', elapsedMs: number) => void, signal: AbortSignal, timeoutMs: number): Promise<MediaResult>
  cancel(remoteId: string, resume?: Record<string, string>): Promise<void>
  estimate(m: MediaModel, request: { endpoint: string; body: Record<string, unknown> }, seconds: number, resolution: string | null): Promise<CreditEstimate | null>
}
export const BACKENDS: Record<MediaProvider, MediaBackend>
// types.ts
export interface CreditEstimate { credits: number | null; usd: number | null }  // credits only for Higgsfield
```

**Aturan:**
- `startHiggsfield`/`finishHiggsfield` menjadi `startMedia`/`finishMedia`. `insertJob` memakai `provider: model.provider`. `runJob` memakai `BACKENDS[provider].queue`.
- Teks progres memakai `label`, misalnya `Mengirim ke fal.ai`, `Mengantre di Google Gemini`.
- Aset menyimpan `provider: model.provider` dan `model: model.id`.
- `prepareRef` per penyedia:
  - Higgsfield: logika `publicUrlFor` yang sekarang.
  - fal: `asset.meta.falUrl` dan `falAt` dipakai ulang kalau umurnya < 0,5 hari; kalau tidak, `fal.uploadFile`.
  - Gemini: data URI dari file lokal. Kalau file > 3 MB, perkecil dengan `nativeImage` (sisi terpanjang 1536 px, JPEG kualitas 90).
- Gambar Gemini selesai langsung (`{ done }`). Job yang terputus karena aplikasi ditutup ditandai gagal seperti TTS (`resumePlan` mengembalikan `null` kalau `remote_id` kosong).
- `estimateCredits` menjadi `estimateCost` dengan signature IPC yang sama:
  - Higgsfield: `{credits, usd}` dari estimasi API.
  - fal: `{credits: null, usd: fal.priceUsd(...)}`.
  - Gemini: `{credits: null, usd}` dari `m.price` (per gambar, atau per detik × durasi sesuai `videoPlan`, memakai `byResolution` kalau ada).
- `forgetEstimates(provider?)` hanya menghapus cache penyedia itu. Kunci cache diberi awalan `estimate:<provider>:`.
- Pemakai `credits` di renderer menangani `null`. Tampilannya diperbaiki di Task 7; di task ini cukup lolos `typecheck`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('resumePlan treats legacy payload as higgsfield', () => {
  const r = resumePlan({ provider: 'higgsfield', remote_id: 'abc', payload_json: '{"target":"clip-image","model":"m","prompt":"p"}' })
  assert.equal(r?.provider, 'higgsfield'); assert.equal(r?.payload.target, 'clip-image')
})
test('resumePlan resumes fal and Veo jobs that were submitted', () => {
  const fal = resumePlan({ provider: 'fal', remote_id: 'r1', payload_json: JSON.stringify({ target: 'clip-video', model: 'fal:x', prompt: 'p', provider: 'fal', resume: { statusUrl: 's', responseUrl: 'r', cancelUrl: 'c' } }) })
  assert.equal(fal?.provider, 'fal'); assert.equal(fal?.payload.resume?.statusUrl, 's')
  assert.equal(resumePlan({ provider: 'gemini', remote_id: 'operations/1', payload_json: JSON.stringify({ target: 'clip-video', model: 'gemini:veo', prompt: 'p', provider: 'gemini', resume: { operation: 'operations/1' } }) })?.provider, 'gemini')
})
test('resumePlan gives up on jobs that never reached the provider', () => {
  assert.equal(resumePlan({ provider: 'gemini', remote_id: null, payload_json: '{"target":"clip-image","model":"m","prompt":"p"}' }), null)
  assert.equal(resumePlan({ provider: 'fal', remote_id: 'r', payload_json: '{"target":"clip-image","model":"m","prompt":"p","provider":"fal"}' }), null) // no resume urls
  assert.equal(resumePlan({ provider: 'tts', remote_id: 'x', payload_json: '{}' }), null)
})
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `payload.ts`, `backends.ts`, dan perubahan di `generation.ts`, `jobs.ts`, `ipc.ts`. `LIMITS`: higgsfield 3, fal 3, gemini 2. `cancelJob` memanggil `BACKENDS[provider].cancel(remote_id, payload.resume)` untuk ketiga penyedia.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih.
- [ ] **Step 5: Commit** `git commit -m "feat: provider layer for image and video generation (Higgsfield, fal.ai, Gemini)"`

### Task 6: Kunci fal.ai, Pengaturan, dan model bawaan proyek baru

**Files:**
- Modify:
  - `src/shared/types.ts` (`ApiProvider` + `'fal'`, kalau belum dari Task 3)
  - `src/main/secrets.ts`
  - `src/main/ipc.ts` (`testProvider`, `setKey`/`clearKey` → `forgetEstimates(provider)` untuk higgsfield/fal/gemini)
  - `src/main/repo.ts` (proyek baru memakai `newProjectModels`)
  - `src/renderer/src/pages/Settings.tsx` (bagian "Gambar dan video")
  - `src/renderer/src/components/ProviderLogo.tsx` + `src/renderer/src/assets/providers/fal.svg`
  - `src/renderer/src/pages/Home.tsx` (`setupIssues`)

**Interfaces:**
- Consumes: `newProjectModels`, `MEDIA_PROVIDERS` (Task 1); `fal.testKey` (Task 3).
- Produces: `ProviderLogoId` + `'fal'`.

**Aturan:**
- Bagian Pengaturan "Gambar dan video":
  - Subjudul: "Pilih penyedianya per proyek di langkah Ide cerita. Isi kunci untuk penyedia yang mau kamu pakai."
  - Kartu Higgsfield tetap seperti sekarang.
  - Kartu **fal.ai** berisi `KeyForm` dengan placeholder "Tempel kunci fal.ai", help "Kunci dicek lewat daftar harga, tanpa memakai saldo.", link `https://fal.ai/dashboard/keys`, dan linkLabel "Buka fal.ai".
  - Kartu **Google Gemini** tanpa form. Isinya menjelaskan bahwa kunci Gemini di bagian Suara narator juga dipakai di sini, bahwa gambar dan video Gemini butuh billing aktif, dan menautkan `https://aistudio.google.com/`.
- `ProviderLogo` fal: ikon dari LobeHub Icons (MIT) kalau ada. Kalau tidak, tulis tanda teks "fal" sederhana dan catat ruling. Perbarui `AboutSection` (daftar merek).
- `repo.createProject`: `newProjectModels({imageModel, videoModel}, (p) => !!getSecret(p))` (ketiga `MediaProvider` juga `ApiProvider`). Kunci Gemini dihitung ada kalau tersimpan.
- `setupIssues`: gambar terblokir hanya kalau tidak ada satu pun dari `higgsfield`/`fal`/`gemini` yang `ok`. Pesannya `{ what: 'kunci Higgsfield, fal.ai, atau Gemini', blocks: 'gambar' }`.

- [ ] **Step 1:** Implementasikan perubahan di atas. Logika murninya sudah dites di Task 1; sisanya diverifikasi dengan typecheck dan dev harness.
- [ ] **Step 2: Run** `npm run typecheck && npm run build`. Expected: bersih.
- [ ] **Step 3: Dev harness** (folder data sementara `STUDIO_USER_DATA`): buka Pengaturan, ambil screenshot bagian "Gambar dan video", lalu `console.log` judul ketiga kartu. Expected: tiga kartu (Higgsfield, fal.ai, Google Gemini). Tanpa kunci apa pun, Beranda menampilkan "kunci Higgsfield, fal.ai, atau Gemini".
- [ ] **Step 4: Commit** `git commit -m "feat: fal.ai key, image and video provider settings, default model by available key"`

### Task 7: Pemilih model dan teks penyedia di proyek

**Files:**
- Modify:
  - `src/renderer/src/components/ModelPicker.tsx` (judul grup, baris terkunci, urut termurah per grup, harga dolar)
  - `src/shared/types.ts` (`ModelOption.locked?: string`)
  - `src/renderer/src/pages/project/ModelSection.tsx`
  - `src/renderer/src/lib/useEstimate.ts`
  - `src/renderer/src/pages/project/StoryboardStep.tsx`
  - `src/renderer/src/pages/project/editor/Inspector.tsx`
  - `src/renderer/src/pages/project/IdeaStep.tsx`
  - `src/renderer/src/components/ModelLogo.tsx` (family baru: Flux, Seedream, Qwen, Nano Banana/Gemini, Veo, Hailuo, Wan bila logonya belum ada)

**Interfaces:**
- Consumes: `mediaModelOptions`, `PROVIDER_LABEL`, `videoPlan`, `effectiveResolution(m, want, seconds)` (Task 1); `CreditEstimate {credits: number|null; usd: number|null}` (Task 5); daftar kunci dari `window.api.settings.keys()`.

**Aturan:**
- `ModelPicker`:
  - Kalau ada opsi dengan `group`, tampilkan judul grup (logo penyedia + label) dan pertahankan urutan grup.
  - "Termurah dulu" mengurutkan di dalam grup dengan kunci `credits ?? usd`.
  - Baris `locked` tampil redup dan tidak bisa dipilih, dengan teks kecil dari nilai `locked`, misalnya "Isi kunci fal.ai di Pengaturan".
  - Kolom harga: `credits != null` → "N kr" seperti sekarang; selain itu `usd != null` → `usdLabel(usd)`.
- `ModelSection`:
  - Judul: "N model gambar dan M model video dari 3 penyedia".
  - Estimasi hanya diminta untuk model dari penyedia yang kuncinya ada.
  - Teks `Cost` menyebut kredit untuk Higgsfield dan "≈ US$… per gambar" untuk yang lain. Gemini diberi tambahan "(perkiraan dari tarif Google)".
  - Pesan tanpa kunci menyebut penyedia model terpilih, bukan selalu Higgsfield.
- Resolusi video yang ditampilkan memakai `effectiveResolution(video, project.videoResolution, perClip)`.
- `StoryboardStep`:
  - Subjudul pilihan "Video AI" menjadi `${PROVIDER_LABEL[provider]} · pakai saldo` untuk fal/Gemini, dan tetap "Higgsfield · pakai kredit".
  - Baris model di kartu klip memakai `videoPlan(model, clip.durationMs/1000, project.videoResolution)`.
  - Kalau resolusinya turun dari yang dipilih, tampilkan "Veo · 720p (1080p hanya untuk 8 detik)", dengan 1080p/4k sesuai pilihan proyek.
- `Inspector`: "Klip ini memakai video dari {label penyedia aset}".

- [ ] **Step 1:** Implementasikan.
- [ ] **Step 2: Run** `npm run typecheck && npm test && npm run build`. Expected: bersih.
- [ ] **Step 3: Dev harness:** buka proyek demo (`{"main":"seed"}`) dengan kunci palsu fal tersimpan, buka pemilih model gambar, ambil screenshot, dan `console.log` judul grup dan jumlah baris terkunci. Expected:
  - Grup Higgsfield, fal.ai, dan Google Gemini muncul berurutan.
  - Tanpa kunci Gemini, semua baris Gemini terkunci.
  - Pilih Veo 1080p pada klip 3 detik → kartu klip menampilkan "720p (1080p hanya untuk 8 detik)".
- [ ] **Step 4: Commit** `git commit -m "feat: model picker grouped by provider with locked rows and dollar estimates"`

### Task 8: Dokumentasi dan verifikasi akhir

**Files:**
- Modify: `docs/layanan-ai.md`, `docs/arsitektur.md`, `docs/alur-produksi.md`, `docs/pengembangan.md` (cara menjalankan `node scripts/fal-catalog.mjs`), `docs/masalah-diketahui.md` (model fal/Gemini belum semuanya diuji langsung), `AGENTS.md` (paragraf pembuka dan peta kode: `media/`, `services/fal.ts`, `services/gemini-media.ts`), `README.md`, `CHANGELOG.md`.

- [ ] **Step 1:** Perbarui dokumentasi. Teks yang menyebut "Higgsfield membuat gambar dan video" menjadi "Higgsfield, fal.ai, atau Google Gemini".
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run build`. Expected: semua lolos dan bersih.
- [ ] **Step 3: Cek manual (Review Focus 5):** dengan dev harness, simpan kunci fal palsu, pilih model fal, buat gambar, lalu hapus kuncinya dan buat gambar lagi. Expected: job gagal dengan pesan "Kunci API fal.ai belum diatur…", tidak menggantung.
- [ ] **Step 4: Commit** `git commit -m "docs: image and video providers"`
- [ ] **Step 5:** Siapkan daftar uji langsung untuk pemilik (memakai saldo kecil):
  - Satu gambar dan satu video per penyedia baru.
  - Satu gambar fal dengan lembar karakter.
  - Satu video fal yang dilanjutkan setelah aplikasi ditutup.
  - Satu gambar Gemini tanpa billing, untuk mengecek pesannya.
