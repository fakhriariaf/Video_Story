# Ruang Edit Tahap 3: Ide Cerita "Papan Clapper" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Langkah Ide cerita memakai tata letak "Papan clapper": form di kiri, papan ringkasan dengan pratinjau dan perkiraan biaya di kanan, dan gaya visual di pita film.

**Architecture:**
- Isi papan dan daftar gaya yang tampil dihitung fungsi murni di `src/shared/slate.ts`, supaya bisa dites tanpa aplikasi.
- Dua komponen baru di `pages/project/`: `IdeaSlate` (papan clapper) dan `StyleStrip` (pita gaya). `IdeaStep` disusun ulang memakai keduanya; `ModelSection` melepas kalimat biaya ke papan.
- `FilmStrip` mendapat pilihan jumlah kolom supaya dipakai Beranda dan pita gaya.

**Tech Stack:** React 19, Tailwind CSS v4 (container queries), TypeScript strict, `node:test` + esbuild. Tanpa dependensi baru.

**Spec:** `docs/superpowers/specs/2026-11-13-tampilan-ruang-edit-design.md` bagian 6 (mockup: `docs/superpowers/specs/assets/ruang-edit-ide.html`, tata letak B)

## Global Constraints

- Teks UI berbahasa Indonesia dengan "kamu"; komentar dan nama di kode berbahasa Inggris.
- `npm run typecheck`, `npm test`, dan `npm run build` bersih di akhir setiap task.
- Semua perilaku lama tetap: `updateProject(...)` untuk setiap pilihan, `compose()` untuk susun naskah (termasuk konfirmasi susun ulang dan pesan "Tulis ide cerita atau sinopsis dulu."), pindah narator ke layanan yang kuncinya ada, tautan "Atur di Pengaturan", simpan model terakhir ke setelan.
- Token dan aturan Ruang Edit (`docs/konvensi.md`): satu tombol kuning per layar ("Susun naskah"), pilihan aktif `bg-select`, tab kategori bergaris bawah `sun`, sudut panel 14 px, tanpa bayangan keras.
- Lebar jendela minimum 1180 px: tidak ada yang terpotong atau menggulir mendatar.
- File `src/shared/` yang mengatur hasil video tidak diubah.
- Teks pada papan (label kiri): Adegan, Format, Bahasa, Narator, Gaya, Gambar, Video. Nilai Format: `16:9 YouTube` atau `9:16 Shorts, Reels, TikTok`.

## Review Focus

1. **Proyek 9:16:** bingkai pratinjau papan berbentuk potret dan tidak membuat papan lebih tinggi dari jendela 720 px. Dicek di Task 3 (harness, ganti format).
2. **Kunci penyedia model belum ada:** papan menampilkan "Perkiraan harga muncul setelah kunci … diisi di Pengaturan", bukan angka nol atau kosong. Dites di Task 1 (`costLines` tanpa estimasi) dan dicek di Task 3.
3. **Gaya terpilih di luar lima pertama:** tetap tampil di pita ringkas. Dites di Task 1 (`stripStyles`).
4. **Suara belum dimuat atau tidak dikenal:** baris Narator hanya menampilkan nama layanan, tanpa koma menggantung. Dites di Task 1.
5. **Jendela 1180 px:** panel pengaturan menjadi dua kali dua, pita gaya empat kolom, papan tetap 372 px. Dicek di Task 3.

---

### Task 1: Isi papan dan pita gaya (fungsi murni)

**Files:**
- Create: `src/shared/slate.ts`
- Test: `src/main/slate.test.ts`

**Interfaces — Produces:**

```ts
export interface SlateRow { label: string; value: string }
export function slateRows(p: { durationSec: number; aspectRatio: AspectRatio; language: string; ttsProvider: TtsProvider; voiceName: string | null; styleId: string; imageModel: string | null; videoModel: string | null }): SlateRow[]
/** "00:30", "10:00": the target length shown on the preview frame. */
export function slateTimecode(durationSec: number): string
/** Styles of a category for the strip: all of them when expanded, else the first `max` with the chosen one kept in view. */
export function stripStyles(category: StyleCategory | 'all', selectedId: string, expanded: boolean, max?: number): VisualStyle[]
/** The cost sentences of the slate, or one line saying why no price is known. */
export function costLines(a: { clipCount: number; perClipSec: number; image: CreditEstimate | null; video: CreditEstimate | null; imageKey: boolean; videoKey: boolean; imageProvider: string; videoProvider: string }): string[]
```

Aturan:
- `slateRows` berurutan Adegan, Format, Bahasa, Narator, Gaya, Gambar, Video. Adegan: `± N, masing-masing M detik` (`clipCountFor`, `M = round(durationSec / N)`). Narator: `Gemini TTS, Charon` atau hanya nama layanan kalau `voiceName` kosong. Gambar/Video: `<nama model> (<penyedia>)`.
- `stripStyles` dengan `max` bawaan 5: kalau gaya terpilih termasuk kategori itu tapi di luar `max` pertama, ia menggantikan butir terakhir.
- `costLines`: harga memakai `kr` untuk kredit (pembulatan satu desimal di bawah 10) atau `US$` dengan koma desimal; kunci tidak ada → `Perkiraan harga gambar muncul setelah kunci <penyedia> diisi di Pengaturan.` (dan padanannya untuk video); estimasi `null` padahal kunci ada → `Perkiraan harga gambar belum tersedia.`

- [ ] **Step 1: Write the failing tests** (`src/main/slate.test.ts`):

```ts
const base = { durationSec: 30, aspectRatio: '16:9' as const, language: 'id', ttsProvider: 'elevenlabs' as const, voiceName: 'Rachel', styleId: 'watercolor', imageModel: 'fal:google/nano-banana-2.1', videoModel: 'fal:fal-ai/kling-video/v3/standard/image-to-video' }
test('slateRows lists the project choices in order', () => {
  assert.deepEqual(slateRows(base), [
    { label: 'Adegan', value: '± 5, masing-masing 6 detik' },
    { label: 'Format', value: '16:9 YouTube' },
    { label: 'Bahasa', value: 'Indonesia' },
    { label: 'Narator', value: 'ElevenLabs, Rachel' },
    { label: 'Gaya', value: 'Buku cerita cat air' },
    { label: 'Gambar', value: 'Nano Banana 2.1 (fal.ai)' },
    { label: 'Video', value: 'Kling 3.0 Standard (fal.ai)' }
  ])
})
test('slateRows copes with portrait, an unknown voice and default models', () => {
  const rows = slateRows({ ...base, aspectRatio: '9:16', voiceName: null, ttsProvider: 'gemini', imageModel: null, videoModel: null })
  assert.equal(rows[1].value, '9:16 Shorts, Reels, TikTok')
  assert.equal(rows[3].value, 'Gemini TTS')
  assert.match(rows[5].value, /\\(Higgsfield\\)$/)
})
test('slateTimecode formats the target length', () => {
  assert.equal(slateTimecode(30), '00:30'); assert.equal(slateTimecode(60), '01:00'); assert.equal(slateTimecode(600), '10:00')
})
test('stripStyles shows five styles and keeps the chosen one in view', () => {
  const first = stripStyles('all', 'stickman', false)
  assert.equal(first.length, 5); assert.equal(first[0].id, 'stickman')
  const late = stripStyles('all', 'epic', false)
  assert.equal(late.length, 5); assert.equal(late[4].id, 'epic'); assert.equal(late[0].id, 'stickman')
  assert.equal(stripStyles('all', 'epic', true).length, VISUAL_STYLES.length)
  assert.ok(stripStyles('3d', 'stickman', false).every((s) => s.category === '3d'))
})
test('costLines sums image cost and prices one video', () => {
  assert.deepEqual(
    costLines({ clipCount: 5, perClipSec: 6, image: { credits: null, usd: 0.05 }, video: { credits: null, usd: 0.42 }, imageKey: true, videoKey: true, imageProvider: 'fal.ai', videoProvider: 'fal.ai' }),
    ['5 gambar ≈ US$0,25', 'Video AI ≈ US$0,42 per klip 6 detik, hanya untuk klip yang kamu jadikan video.']
  )
  assert.equal(costLines({ clipCount: 4, perClipSec: 5, image: { credits: 1.5, usd: null }, video: null, imageKey: true, videoKey: true, imageProvider: 'Higgsfield', videoProvider: 'Higgsfield' })[0], '4 gambar ≈ 6 kr')
})
test('costLines says why a price is missing', () => {
  const lines = costLines({ clipCount: 5, perClipSec: 6, image: null, video: null, imageKey: false, videoKey: true, imageProvider: 'fal.ai', videoProvider: 'Google Gemini' })
  assert.equal(lines[0], 'Perkiraan harga gambar muncul setelah kunci fal.ai diisi di Pengaturan.')
  assert.equal(lines[1], 'Perkiraan harga video belum tersedia.')
})
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (modul belum ada).
- [ ] **Step 3: Implement** `src/shared/slate.ts`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: slate rows, style strip and cost lines for the Idea step`

### Task 2: Komponen papan clapper dan pita gaya

**Files:**
- Create: `src/renderer/src/pages/project/IdeaSlate.tsx`, `src/renderer/src/pages/project/StyleStrip.tsx`
- Modify: `src/renderer/src/components/FilmStrip.tsx`

**Interfaces:**
- Consumes: Task 1; `useEstimate`; `StyleSwatch`; `FilmStrip`.
- Produces:

```ts
export function FilmStrip(props: { children: ReactNode; columns?: 'projects' | 'styles' }): JSX.Element  // styles: 4 kolom, 5 kalau lebar
export function IdeaSlate(props: { project: Project; voiceName: string | null; hasKey: (p: MediaProvider) => boolean | null }): JSX.Element
export function StyleStrip(props: { value: string; onChange: (id: string) => void }): JSX.Element
```

Aturan:
- `IdeaSlate`: panel `rounded-[14px]`; pita clapper setinggi 26 px dari `repeating-linear-gradient(-55deg, fg 0 22px, strip 22px 44px)`; judul proyek `font-display` 22 px; bingkai pratinjau `rounded-md` berisi `StyleSwatch`/gambar gaya dengan `aspect-video`, atau untuk 9:16 `aspect-[9/16]` selebar 46% dan di tengah; kode waktu di pojok kanan bawah; `<dl>` dari `slateRows`; kotak biaya dari `costLines` (estimasi lewat `useEstimate` untuk model gambar, dan untuk model video dengan `perClip` dan resolusi proyek, hanya kalau kuncinya ada).
- `StyleStrip`: judul "Gaya visual", tab kategori (tombol teks, yang aktif bergaris bawah `sun`, `aria-pressed`), tautan `Lihat semua N gaya` / `Tampilkan lebih sedikit` (`aria-expanded`), lalu `FilmStrip columns="styles"` berisi tombol gaya (`aria-pressed`, gambar 4:3 `rounded-md`, nama di bawah; terpilih: garis `accent` 2 px dan nama tebal).

- [ ] **Step 1:** Implementasikan ketiga perubahan.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih (komponen belum dipakai halaman mana pun).
- [ ] **Step 3: Commit** `feat: clapper slate and style strip components`

### Task 3: Susun ulang langkah Ide cerita

**Files:**
- Modify: `src/renderer/src/pages/project/IdeaStep.tsx`, `src/renderer/src/pages/project/ModelSection.tsx`
- Delete: `src/renderer/src/components/StylePicker.tsx` (kalau tidak dipakai lagi)

Aturan:
- Tata letak: `grid-cols-[minmax(0,1fr)_372px] gap-7`, isi maksimum 1320 px; kolom kanan `IdeaSlate` dengan `sticky top-0`.
- Kiri berurutan: judul 44 px dan kalimat penjelasan (tanpa "Langkah 1 dari 4"); kotak ide (label hanya untuk pembaca layar, tips dan penghitung karakter di bawah garis); panel pengaturan `@container` dengan `grid-cols-2 @3xl:grid-cols-[2.1fr_1.55fr_.9fr_1.35fr]` berisi Durasi (`Chip`), Format (dua `Chip`: `16:9 YouTube`, `9:16 Shorts`), Bahasa (`Select`), Suara narator (`Segmented` + `VoicePicker`, pesan kunci dan tautan Pengaturan tetap); `StyleStrip`; `ModelSection`.
- `VoicePicker` melaporkan nama suara terpilih ke `IdeaStep` (prop `onName`) untuk papan.
- `ModelSection`: kalimat biaya (`Cost`) dihapus dari kedua kartu; pemilih model, resolusi, dan catatan lembar karakter/gerak kamera tetap; judul bagian memakai `font-display` 24 px.
- Bilah bawah: `Naskah disusun oleh <penyedia>` + model + `Ganti`; tombol tetap.

- [ ] **Step 1:** Implementasikan.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih.
- [ ] **Step 3: Dev harness** (proyek demo, kunci palsu fal dan gemini), `console.log` dan screenshot:
  - jendela bawaan: papan berisi tujuh baris; pita gaya 5 butir; klik "Lihat semua" → 16 butir; pilih gaya lain → baris Gaya dan gambar papan berubah;
  - ganti Format ke 9:16 → nilai Format di papan berubah dan bingkai berbentuk potret; tinggi papan < tinggi jendela;
  - model Higgsfield tanpa kunci → papan menampilkan kalimat "muncul setelah kunci Higgsfield diisi";
  - kosongkan ide lalu klik "Susun ulang naskah"/"Susun naskah" → toast "Tulis ide cerita atau sinopsis dulu.";
  - jendela 1180 px: tidak ada gulir mendatar, panel pengaturan dua kali dua, pita gaya 4 kolom.
- [ ] **Step 4: Commit** `feat: Idea step with the clapper slate layout`

### Task 4: Dokumentasi dan verifikasi

- [ ] **Step 1:** Perbarui `docs/konvensi.md` (tabel komponen: `IdeaSlate`, `StyleStrip`, `FilmStrip columns`) dan `CHANGELOG.md`.
- [ ] **Step 2:** Ulangi screenshot Beranda (pita proyek tidak berubah oleh `columns`) dan Storyboard/Naskah (tidak tersentuh).
- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih. Commit `docs: Idea step slate layout`.
