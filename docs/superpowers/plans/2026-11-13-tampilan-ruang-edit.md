# Tampilan "Ruang Edit" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seluruh aplikasi memakai gaya gelap "Ruang Edit", dengan kerangka menu sisi dan Beranda baru; Ide cerita dan perapian halaman lain menyusul.

**Architecture:**
- Tahap 1 mengganti fondasi di satu tempat: token `@theme` di `styles.css` diberi nama semantik dan nilai gelap, kelas Tailwind di semua `.tsx` diganti nama secara mekanis lewat skrip, lalu komponen dasar dan warna yang ditulis langsung dirapikan.
- Tahap 2 menambah satu komponen menu sisi (`AppRail`) yang dipakai Beranda dan Pengaturan, dan menyusun ulang Beranda dengan pita film.
- Dua tes otomatis menjaga fondasi: kontras pasangan warna, dan tidak adanya sisa nama kelas, font, atau warna lama.

**Tech Stack:** Electron 44, React 19, Tailwind CSS v4 (`@theme`), TypeScript strict, `node:test` + esbuild. Dependensi baru: `@fontsource/barlow`, `@fontsource/barlow-condensed` (OFL). Dilepas: `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/plus-jakarta-sans`.

**Spec:** `docs/superpowers/specs/2026-11-13-tampilan-ruang-edit-design.md` (mockup: `docs/superpowers/specs/assets/ruang-edit-beranda.png`)

## Global Constraints

**Aturan proyek (AGENTS.md, docs/konvensi.md)**
- Teks UI berbahasa Indonesia dengan "kamu"; komentar dan nama di kode berbahasa Inggris.
- `npm run typecheck`, `npm test`, dan `npm run build` bersih di akhir setiap task.
- Tidak ada `<select>` bawaan. Semua fungsi dan alur tetap sama; tidak ada fitur baru.
- File di `src/shared/` yang mengatur hasil video (`motion.ts`, `captions.ts`, `timeline.ts`, `overlays.ts`) dan font caption **tidak diubah**.
- Di akhir setiap tahap tidak ada halaman bertampilan campuran.

**Token baru (nama → nilai), pengganti seluruh blok warna `@theme`**

| Token | Nilai | Peran | Menggantikan |
|---|---|---|---|
| `canvas` | `#121026` | latar aplikasi; teks gelap di atas isian terang (`text-canvas`) | `paper` |
| `panel` | `#1B1838` | kartu, kolom isian | `surface` |
| `rail` | `#171431` | menu sisi kiri | baru |
| `raised` | `#24204A` | chip, hover, isian sekunder | `sand` |
| `strip` | `#0B0A1A` | pita film, area pratinjau | baru |
| `select` | `#3D3691` | isian pilihan aktif | `bg-ink` |
| `fg` | `#ECEAFB` | teks utama | `ink` (teks) |
| `fg-2` | `#C9C5EE` | teks kedua | `ink-2` |
| `muted` | `#A29EC9` | teks redup | `muted` |
| `faint` | `#8A85BC` | placeholder | baru |
| `line`, `line-2`, `line-3` | `#2A2656`, `#322D63`, `#3A3572` | garis | sama |
| `edge` | `#4A4488` | garis tegas | `border-ink`, `border-ink-2` |
| `accent` | `#7C6CFF` | aksen indigo, fokus | `accent` |
| `accent-press` | `#6657F0` | hover/tekan isian aksen | `accent-dark` (isian) |
| `accent-soft` | `#2B2566` | latar lembut aksen | `accent-soft` |
| `link` | `#A99EFF` | teks tautan | `text-accent-dark` |
| `sun` / `sun-on` | `#FFB627` / `#2A1C00` | tindakan utama dan teksnya | `sun` |
| `sun-soft` / `sun-ink` | `#3B2F00` / `#FFCF66` | peringatan, pilihan terpilih | sama |
| `ok-soft` / `ok-ink` | `#0F3A2B` / `#6FE3B5` | berhasil | sama |
| `info-soft` / `info-ink` | `#14305A` / `#8FC2FF` | info | sama |
| `bad-soft` / `bad-ink` | `#4A1512` / `#FF9A8F` | gagal | sama |
| `draft` | `#2A2656` | lencana netral | sama |

- `--font-display: 'Barlow Condensed'`, `--font-sans: 'Barlow'`, `--font-mono` tetap JetBrains Mono.
- `--shadow-pop: 0 14px 36px rgb(5 4 16 / 0.6)` untuk menu dan dialog. Semua `shadow-ink*` dihapus.
- `body { color-scheme: dark }`.

**Aturan tampilan dari spec**
- Kuning (`sun`) hanya untuk satu tindakan utama per layar dan penanda posisi aktif. Dua tombol utama di satu layar: yang memajukan ke langkah berikutnya tetap kuning, yang lain memakai varian `accent`.
- Tombol `Button`: `primary` (isian `sun`, teks `sun-on`), `accent` (isian `accent`, teks `canvas`), `secondary` (isian `raised`, garis `line-2`), `ghost`, `danger`. Varian `ink` dan tone lencana `ink` dihapus; pemakainya dipetakan ke `accent` atau `danger` sesuai maknanya.
- Pilihan aktif: `bg-select text-fg`. Sudut: panel 14 px, tombol/chip/kolom 8 px, bingkai gambar 6 px.
- Logo: bentuk tetap (lingkaran, segitiga putar, bintang); lingkaran `#7C6CFF`, segitiga `#121026`, bintang `#FFB627`, tanpa garis hitam.
- Tombol Beranda tetap "Mulai". Menu kartu proyek tetap Buka, Duplikat, Hapus.

## Review Focus

1. **Kelas yang terlewat skrip** (nama token lama di dalam template string, `var(--color-…)`, atau `cx(...)` bersyarat) membuat elemen kehilangan warna tanpa error. Dijaga tes `no legacy names` di Task 2 dan pemeriksaan screenshot di Task 4.
2. **Teks putih di atas isian terang** (`text-white` pada tombol indigo/kuning) jadi tak terbaca. Diperiksa satu per satu di Task 3 (7 pemakaian) dan dijaga tes kontras `canvas` di atas `accent`.
3. **Logo penyedia dan model di latar gelap**: logo hitam (OpenAI, ElevenLabs, Grok) harus tetap di kotak berlatar terang. Dicek di Task 3 (`ProviderLogo`, `ModelLogo`).
4. **Editor**: playhead, klip terpilih, gelombang suara, dan gagang potong harus tetap terlihat jelas di atas latar gelap. Dicek di Task 4 dengan screenshot Editor empat tab.
5. **Jendela sempit (lebar minimum 1180 px)**: menu sisi 228 px tidak boleh membuat kotak ide atau pita film terpotong. Dicek di Task 8 dengan screenshot pada lebar minimum.

---

## Tahap 1 — Fondasi (PR A)

### Task 1: Token, huruf, dan tes kontras

**Files:**
- Modify: `src/renderer/src/styles.css` (blok `@theme` warna, font, bayangan; `@layer base`)
- Modify: `src/renderer/src/main.tsx` (impor font), `package.json`
- Test: `src/main/theme.test.ts`

**Interfaces — Produces:** nama token di tabel Global Constraints sebagai utilitas Tailwind (`bg-canvas`, `text-fg`, `border-edge`, `bg-select`, `text-link`, `shadow-pop`, dan seterusnya).

- [ ] **Step 1: Write the failing test** `src/main/theme.test.ts`: baca `src/renderer/src/styles.css`, ambil semua `--color-<nama>: #hex`, lalu:

```ts
const PAIRS: [string, string][] = [
  ['fg', 'canvas'], ['fg', 'panel'], ['fg', 'raised'], ['muted', 'rail'], ['fg', 'select'], ['fg-2', 'panel'],
  ['muted', 'canvas'], ['muted', 'panel'], ['muted', 'raised'], ['faint', 'panel'], ['link', 'panel'],
  ['sun-on', 'sun'], ['canvas', 'accent'], ['ok-ink', 'ok-soft'], ['info-ink', 'info-soft'],
  ['sun-ink', 'sun-soft'], ['bad-ink', 'bad-soft'], ['fg-2', 'draft']
]
test('every text and background pair of the theme reaches 4.5:1', () => {
  for (const [text, bg] of PAIRS) assert.ok(contrast(color(text), color(bg)) >= 4.5, `${text} on ${bg}`)
})
test('the theme defines every token of the Ruang Edit palette', () => {
  for (const name of ['canvas', 'panel', 'rail', 'raised', 'strip', 'select', 'fg', 'fg-2', 'muted', 'faint', 'line', 'line-2', 'line-3', 'edge', 'accent', 'accent-press', 'accent-soft', 'link', 'sun', 'sun-on', 'sun-soft', 'sun-ink', 'ok-soft', 'ok-ink', 'info-soft', 'info-ink', 'bad-soft', 'bad-ink', 'draft'])
    assert.ok(color(name), name)
  assert.equal(color('canvas').toLowerCase(), '#121026')
  assert.equal(color('sun').toLowerCase(), '#ffb627')
})
```

`contrast` memakai rumus luminans relatif WCAG; `color(name)` melempar kalau token tidak ada.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (`fg on canvas`: token `fg` belum ada).
- [ ] **Step 3: Implement.** Ganti blok warna, font, dan bayangan `@theme` sesuai tabel; `::selection` memakai `sun` dengan teks `sun-on`; tambah `color-scheme: dark` di `body`; `scrollbar-color` memakai `line-3`. Jalankan `npm install @fontsource/barlow @fontsource/barlow-condensed` dan `npm uninstall @fontsource-variable/bricolage-grotesque @fontsource-variable/plus-jakarta-sans`; di `main.tsx` impor `@fontsource/barlow/{400,500,600}.css` dan `@fontsource/barlow-condensed/{500,600,700}.css`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. (`typecheck` dan `build` baru bersih setelah Task 2, karena kelas lama belum diganti; build tetap harus berhasil.)
- [ ] **Step 5: Commit** `feat: Ruang Edit theme tokens and Barlow typefaces`

### Task 2: Ganti nama kelas secara mekanis

**Files:**
- Create: `scripts/retheme.mjs` (skrip sekali pakai; dihapus di Step 5)
- Modify: semua `src/renderer/src/**/*.tsx` dan `styles.css`
- Test: `src/main/theme.test.ts` (tambah)

**Interfaces — Consumes:** token Task 1.

Aturan skrip, dijalankan per baris dan **berurutan**; `P` = `(?:text|bg|border|ring|fill|stroke|outline|divide|decoration|caret|placeholder|from|to|via|accent|shadow)` dan aturan juga berlaku untuk `var(--color-…)`:

1. Baris yang memuat `bg-ink` (bukan `bg-ink-2`): `text-paper` → `text-fg`.
2. `bg-ink-2` dan `bg-ink` → `bg-select`.
3. `border-ink-2` dan `border-ink` → `border-edge`.
4. Sisa `P-ink-2` → `P-fg-2`; sisa `P-ink` → `P-fg` (tidak menyentuh `sun-ink`, `ok-ink`, `info-ink`, `bad-ink`).
5. `P-paper` → `P-canvas`; `P-surface` → `P-panel`; `P-sand` → `P-raised`.
6. `text-accent-dark` → `text-link`; sisa `P-accent-dark` → `P-accent-press`.
7. `shadow-ink-lg` → `shadow-pop`; `shadow-ink-md`, `shadow-ink`, beserta awalan varian (`hover:`, `active:`) dan `active:translate-x-px`, `active:translate-y-px`, `active:shadow-none` yang menyertainya → dihapus.
8. `--color-ink` → `--color-fg`, `--color-paper` → `--color-canvas`, dan seterusnya untuk `var(...)`.

Skrip mencetak jumlah penggantian per aturan dan daftar baris yang masih memuat `text-white`, `bg-white`, atau warna hex, untuk ditangani tangan di Task 3.

- [ ] **Step 1: Write the failing test** (tambah di `theme.test.ts`):

```ts
test('no legacy class, font or colour names remain in the renderer', () => {
  const LEGACY = [
    /shadow-ink/, /\b[a-z]+-(paper|surface|sand|accent-dark)\b/, /\b(text|bg|border|ring|fill|stroke|outline|divide|decoration|caret|placeholder)-ink(-2)?\b/,
    /--color-(ink|paper|surface|sand)\b/, /Bricolage|Plus Jakarta/i,
    /#(faf7f2|f3efe8|1f1d1a|57524a|6b665e|e6dfd3|d4cbbb|bfb5a4|efeae2)\b/i
  ]
  const hits = rendererFiles().flatMap((f) => lines(f).filter((l) => LEGACY.some((r) => r.test(l.text))).map((l) => `${f}:${l.n}`))
  assert.deepEqual(hits, [])
})
```

`rendererFiles()` = semua `.tsx`, `.ts`, `.css` di `src/renderer/src`.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL dengan daftar ratusan baris.
- [ ] **Step 3: Tulis `scripts/retheme.mjs`, jalankan `node scripts/retheme.mjs`**, perbaiki sisa yang dilaporkan tes dengan tangan (termasuk `Logo.tsx`: warna logo sesuai Global Constraints, dan nama font di `styles.css`).
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih.
- [ ] **Step 5: Hapus `scripts/retheme.mjs`, lalu commit** `refactor: rename theme classes to semantic Ruang Edit tokens`

### Task 3: Komponen dasar dan warna yang ditulis langsung

**Files:**
- Modify: `src/renderer/src/components/ui.tsx` (`Button`, `IconButton`, `Segmented`, `Chip`, `Badge`, `Menu`, `Switch`, `Progress`, dialog konfirmasi, `inputCls`), `Select.tsx`, `Popover.tsx`, `ModelPicker.tsx`, `Toasts.tsx`, `ProviderLogo.tsx`, `ModelLogo.tsx`, `ChatGptAccount.tsx`, `pages/Settings.tsx` (`ProviderSelect`, `KeyForm`)
- Modify (hex): `pages/project/editor/Inspector.tsx`, `Timeline.tsx`, `Waveform.tsx`, `Player.tsx`

**Aturan:**
- `VARIANTS`: `primary: 'bg-sun text-sun-on hover:brightness-105 font-semibold'`, `accent: 'bg-accent text-canvas hover:bg-accent-press font-semibold'`, `secondary: 'bg-raised text-fg border border-line-2 hover:border-edge font-medium'`, `ghost: 'bg-transparent text-fg-2 hover:bg-raised hover:text-fg font-medium'`, `danger: 'bg-bad-soft text-bad-ink hover:brightness-110 font-medium'`. Hapus `ink` dari `Variant` dan `Tone`; perbaiki pemakainya (`confirmDialog` berbahaya → `danger`; tombol ChatGPT dan lainnya → `accent`).
- `SIZES` memakai `rounded-lg` (8 px). Panel besar (`Card` di Settings, kartu proyek, kotak ide) `rounded-[14px]`; bingkai gambar `rounded-md`.
- Setiap `text-white`/`bg-white` yang dilaporkan Task 2: di atas isian `accent`/`sun` → `text-canvas`/`text-sun-on`; di atas gambar atau video (kode waktu, tombol putar) tetap putih.
- `ProviderLogo`/`ModelLogo`: latar kotak logo tetap seperti sekarang (putih atau warna merek); garis tepinya `border-line-2`.
- Warna hex di Editor diganti token: latar pratinjau dan lintasan timeline `strip`, klip terpilih garis `sun`, playhead `sun`, gelombang suara `accent`. Warna yang merupakan bagian gambar video (pratinjau caption, overlay) **tidak diubah**.
- Fokus keyboard: `outline 2px accent` tetap terlihat di semua komponen dasar.

- [ ] **Step 1:** Implementasikan aturan di atas. `npm run typecheck` menunjukkan semua pemakai varian `ink` yang harus dipetakan.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih.
- [ ] **Step 3: Commit** `feat: Ruang Edit base components`

### Task 4: Sapu semua halaman, dokumentasi, PR

**Files:**
- Modify: halaman mana pun yang terlihat salah di screenshot; `docs/konvensi.md` (tabel token, font, aturan tombol, aturan kuning); `CHANGELOG.md`

- [ ] **Step 1: Dev harness** (`STUDIO_USER_DATA` sementara; langkah `seed`, `speech`, `videos`, `overlays`, kunci palsu untuk semua penyedia). Ambil screenshot: Beranda, Pengaturan (tiga tab), Ide cerita (atas dan bawah, satu pemilih model terbuka), Naskah, Storyboard, Editor (tab Klip, Caption, Overlay, Transisi), dialog ekspor, dialog konfirmasi hapus, satu toast. Simpan di scratchpad.
- [ ] **Step 2: Periksa setiap screenshot** terhadap Review Focus 1–4: tidak ada area krem atau putih polos, tidak ada teks tak terbaca, tidak ada garis hitam, pilihan aktif terlihat, tepat satu tombol kuning per layar. Perbaiki, lalu ulangi Step 1 untuk halaman yang berubah.
- [ ] **Step 3: Ekspor tidak berubah.** Ekspor proyek demo di cabang ini dan di `feat/penyedia-gambar-video`; bandingkan durasi video/audio dan satu frame di detik ke-3 (`ffmpeg -ss 3 -frames:v 1`). Expected: durasi sama, frame sama (MD5 PNG sama).
- [ ] **Step 4:** Perbarui `docs/konvensi.md` dan `CHANGELOG.md`.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih. Commit `docs: Ruang Edit conventions`, lalu serahkan ke pemilik untuk dicoba dan PR (Tahap 1).

## Tahap 2 — Kerangka dan Beranda (PR B, di atas PR A)

### Task 5: Ringkasan Layanan AI

**Files:**
- Create: `src/shared/services.ts`
- Test: `src/main/services-summary.test.ts`

**Interfaces — Produces:**

```ts
export interface ServiceLine { id: 'story' | 'voice' | 'media' | 'caption'; label: string; provider: string; ok: boolean }
export function serviceSummary(a: { settings: AppSettings; keys: KeyStatus[]; accounts: AccountStatus[]; whisperReady: boolean }): ServiceLine[]
```

Aturan: `label` = Cerita, Suara, Gambar, Caption. `provider` = nama penyedia terpilih (`llmName`, "Gemini TTS"/"ElevenLabs", `PROVIDER_LABEL[defaultMediaProvider(settings)]`, "Whisper" atau "Belum diunduh"). `ok`: kunci tersimpan dan `lastOk !== false`; untuk `chatgpt` masuk, tidak `needsReauth`, dan `planUsageAllowed !== false`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('lists the four services with the chosen providers', () => {
  const lines = serviceSummary({ settings: { ...base, llmProvider: 'chatgpt', defaultTtsProvider: 'elevenlabs', imageModel: RECOMMENDED.fal.image }, keys: [key('elevenlabs', true), key('fal', true)], accounts: [chatgptIn], whisperReady: false })
  assert.deepEqual(lines.map((l) => [l.label, l.provider, l.ok]), [['Cerita', 'ChatGPT (langganan)', true], ['Suara', 'ElevenLabs', true], ['Gambar', 'fal.ai', true], ['Caption', 'Belum diunduh', false]])
})
test('a key that failed its last check is not ok', () => {
  const lines = serviceSummary({ settings: base, keys: [{ ...key('gemini', true), lastOk: false }], accounts: [], whisperReady: true })
  assert.equal(lines[0].ok, false); assert.equal(lines[3].provider, 'Whisper'); assert.equal(lines[3].ok, true)
})
test('ChatGPT without plan usage is not ok', () => {
  assert.equal(serviceSummary({ settings: { ...base, llmProvider: 'chatgpt' }, keys: [], accounts: [{ ...chatgptIn, planUsageAllowed: false }], whisperReady: false })[0].ok, false)
})
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (modul belum ada).
- [ ] **Step 3: Implement** `serviceSummary`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: AI service summary for the app rail`

### Task 6: Menu sisi (`AppRail`) untuk Beranda dan Pengaturan

**Files:**
- Create: `src/renderer/src/components/AppRail.tsx`
- Modify: `src/renderer/src/pages/Home.tsx`, `src/renderer/src/pages/Settings.tsx`

**Interfaces — Produces:**

```ts
export function AppRail(props: {
  active: 'home' | 'settings'
  /** Settings tabs shown as sub-items under "Pengaturan". */
  sub?: { id: string; label: string; icon: ReactNode; on: boolean; onPick: () => void }[]
  /** Shown first when Settings was opened from a project. */
  backToProject?: () => void
  services: ServiceLine[]
}): JSX.Element
```

**Aturan:**
- Lebar 228 px, latar `bg-rail`, garis kanan `line`.
- Isi dari atas: logo (klik → Beranda); "Kembali ke proyek" bila `backToProject` ada; menu Beranda dan Pengaturan; sub-menu `sub` menjorok di bawah Pengaturan; di dasar, "Layanan AI" berisi `services` (titik `ok-ink` bila `ok`, `line-3` bila tidak), dan seluruh blok itu tombol menuju Pengaturan.
- Item aktif: `bg-raised text-fg` dengan garis kiri 3 px `sun`.
- Beranda: header atas lama dihapus; tata letak menjadi `grid-cols-[228px_minmax(0,1fr)]`.
- Pengaturan: header atas dan `nav` 280 px miliknya dihapus; tab tetap state lokal Pengaturan dan dikirim lewat `sub`. Judul halaman tetap di isi.
- Data `services`: Beranda dan Pengaturan sudah memuat `settings`, `keys`, `accounts`; `whisperReady` dari `window.api.whisper` (status model terunduh).

- [ ] **Step 1:** Implementasikan `AppRail` dan pasang di kedua halaman.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih.
- [ ] **Step 3: Dev harness:** Beranda dan Pengaturan (dibuka dari Beranda, dan dari dalam proyek). `console.log` isi menu sisi. Expected: dari Beranda menu berisi Beranda, Pengaturan + tiga sub-menu; dari proyek baris pertama "Kembali ke proyek" dan mengkliknya kembali ke proyek; empat baris Layanan AI sesuai kunci palsu.
- [ ] **Step 4: Commit** `feat: app rail for Home and Settings`

### Task 7: Beranda baru dengan pita film

**Files:**
- Create: `src/renderer/src/components/FilmStrip.tsx`
- Modify: `src/renderer/src/pages/Home.tsx`

**Aturan (lihat mockup):**
- Judul `font-display` 52 px berat 600, kalimat penjelasan `text-muted` 16 px.
- Kotak ide: `bg-panel border border-line-2 rounded-[14px]`; teks ide 18 px; baris bawah berisi kontrol yang ada sekarang (durasi, bahasa, format, gaya, suara) bergaya chip `bg-raised`, dan tombol `primary` "Mulai" di kanan. Perilaku `start()` tidak berubah.
- "Coba ide ini" bergaya pil garis putus-putus.
- Kepala "Proyek kamu": judul `font-display` 28 px, tab saringan berupa teks dengan garis bawah `sun` pada yang aktif dan jumlahnya, kolom "Cari proyek" di kanan (menggantikan kolom cari di header lama).
- `FilmStrip`: wadah `bg-strip rounded-[10px] px-4 py-[22px]`, kisi 4 kolom (3 kolom di bawah lebar isi 900 px), dan dua baris lubang pita (atas dan bawah) dari `repeating-linear-gradient` warna `line`. Lubang pita hanya hiasan (`aria-hidden`).
- Bingkai proyek: gambar 16:9 `rounded-md`, kode waktu `font-display` di pojok kanan bawah, judul, lencana status, waktu relatif, dan menu titik-tiga (Buka, Duplikat, Hapus) seperti sekarang. Kartu "Proyek baru" pertama, bergaris putus-putus.
- Keadaan kosong (belum ada proyek, atau saringan tanpa hasil): pita tetap tampil dengan kartu "Proyek baru" dan satu kalimat keterangan.
- Peringatan setup tetap di atas kotak ide dengan gaya `bg-sun-soft text-sun-ink`.

- [ ] **Step 1:** Implementasikan.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih.
- [ ] **Step 3: Dev harness:** Beranda dengan 0, 1, dan 6 proyek (duplikat proyek demo), pada lebar jendela bawaan dan lebar minimum 1180 px; saring "Draf"; cari judul; buat proyek lewat "Mulai". Expected: tata letak seperti mockup, pita melipat ke baris kedua pada 6 proyek, tidak ada yang terpotong di 1180 px (Review Focus 5), proyek baru terbuka di Ide cerita.
- [ ] **Step 4: Commit** `feat: Home with idea composer and film strip`

### Task 8: Verifikasi Tahap 2, dokumentasi, PR

- [ ] **Step 1:** Ulangi sapuan screenshot Task 4 Step 1 untuk Beranda dan Pengaturan; pastikan halaman proyek tidak berubah oleh Tahap 2.
- [ ] **Step 2:** Perbarui `docs/arsitektur.md` (kerangka: `AppRail`), `docs/konvensi.md`, `CHANGELOG.md`.
- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih. Commit `docs: app rail and Home`, lalu serahkan untuk dicoba dan PR (Tahap 2).

## Tahap 3 dan 4 — garis besar

Rencana rincinya ditulis setelah Tahap 2 selesai dan mockup-nya disetujui.

- **Tahap 3, Ide cerita:** buat mockup HTML (`docs/superpowers/specs/assets/ruang-edit-ide.html`) dalam gaya Ruang Edit yang memuat semua isi wajib di spec bagian 6; pemilik menyetujui; lalu susun ulang `IdeaStep.tsx`, `ModelSection.tsx`, `StylePicker.tsx`, dan `ProjectHeader.tsx` (bilah langkah).
- **Tahap 4, perapian:** Naskah, Storyboard, Editor (hanya gaya), Pengaturan; ganti screenshot README (`docs/images/*.webp`) dengan tampilan baru.
