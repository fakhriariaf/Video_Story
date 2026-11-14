# Ruang Edit Tahap 4: Perapian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semua halaman konsisten dalam gaya Ruang Edit, dan hal-hal kecil yang ditunda dari review tahap 1–3 dibereskan.

**Architecture:** Tidak ada struktur baru. Tes penjaga tema diperketat, format harga disatukan di `src/shared/price.ts`, lalu satu sapuan konsistensi di komponen dan halaman yang ada. Tata letak Editor tidak berubah.

**Tech Stack:** React 19, Tailwind CSS v4, TypeScript strict, `node:test` + esbuild. Tanpa dependensi baru.

**Spec:** `docs/superpowers/specs/2026-11-13-tampilan-ruang-edit-design.md` bagian 3 dan 7; daftar "Hal kecil yang ditunda" di PR #4 dan PR #6.

## Global Constraints

- Teks UI berbahasa Indonesia dengan "kamu"; komentar dan nama di kode berbahasa Inggris.
- `npm run typecheck`, `npm test`, dan `npm run build` bersih di akhir setiap task.
- Tidak ada perubahan perilaku selain yang disebut di sini. File `src/shared/` yang mengatur hasil video dan tata letak Editor tidak diubah.
- Aturan Ruang Edit (`docs/konvensi.md`): satu tombol kuning per layar; pilihan aktif `bg-select`; kartu pilihan besar `border-accent bg-accent-soft`; kuning hanya untuk tindakan utama dan penanda posisi.
- Lebar jendela minimum 1180 px tetap tanpa gulir mendatar.

**Di luar tahap ini (dicatat, tidak dikerjakan):**
- Screenshot README (`docs/images/*.webp`): proyek demo hanya berisi gambar uji berwarna, jadi hasilnya tidak layak untuk README. Diambil ulang setelah ada proyek sungguhan milik pemilik.
- Tes "setiap kelas warna cocok dengan token": butuh daftar pengecualian panjang untuk kelas bawaan Tailwind; manfaatnya tidak sebanding.
- Indentasi sisa di `Settings.tsx`: perubahan besar tanpa pengaruh ke pengguna.

## Review Focus

1. **Tombol nonaktif** harus tetap terbaca dan jelas tidak bisa diklik di semua varian (utama, aksen, sekunder, bahaya). Dicek di Task 3 lewat screenshot Pengaturan ("Simpan dan tes" sebelum kunci diketik) dan Storyboard.
2. **Fokus keyboard** terlihat di kartu proyek, kolom cari, kotak ide, dan bingkai gaya, dan berbeda dari tanda "terpilih". Dicek di Task 3 dengan menekan Tab di harness.
3. **Klik ganda pada "Mulai"/"Proyek baru"** hanya membuat satu proyek. Dicek di Task 3 lewat harness (dua klik cepat, hitung proyek).
4. **Daftar kunci gagal dimuat**: papan Ide cerita dan menu sisi tidak menggantung di keadaan memuat. Dicek di Task 2 lewat tes fungsi murni dan pembacaan kode.
5. **Titik transisi dan tab alat Editor** tetap mudah dibedakan antara terpilih dan tidak setelah warnanya diubah. Dicek di Task 3 lewat screenshot Editor.

---

### Task 1: Tes penjaga lebih ketat, warna sisa, dan huruf

**Files:**
- Modify: `src/main/theme.test.ts`, `src/renderer/src/pages/project/editor/OverlayPanel.tsx`, `src/renderer/src/pages/project/editor/Timeline.tsx`, `src/renderer/src/main.tsx`, `package.json`

- [ ] **Step 1: Write the failing tests** (tambah atau ubah di `theme.test.ts`):
  - Pola warna lama memakai `(?![0-9a-f])` sebagai ganti `\b` di akhir, dan ditambah `/rgba?\(\s*31,\s*29,\s*26/` (tinta lama ditulis sebagai rgb).
  - `test('the bold sans weight used in the UI is loaded')`: `main.tsx` memuat `@fontsource/barlow/700.css`.
  - `test('font packages are build-time only')`: `package.json` `dependencies` tidak berisi nama yang diawali `@fontsource`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (OverlayPanel dan Timeline terdaftar; 700 belum dimuat; font masih di `dependencies`).
- [ ] **Step 3: Implement.** Ganti warna sisa dengan token (`raised`/`line` untuk pola kotak-kotak transparansi di OverlayPanel, `strip` untuk bayangan di Timeline); impor `@fontsource/barlow/700.css`; pindahkan ketiga paket `@fontsource*` ke `devDependencies` (lalu `npm install` supaya lockfile ikut).
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih.
- [ ] **Step 5: Commit** `chore: tighter theme guards, last legacy colours, Barlow 700`

### Task 2: Satu format harga, dan keadaan memuat yang tidak menggantung

**Files:**
- Create: `src/shared/price.ts`
- Modify: `src/shared/slate.ts`, `src/renderer/src/lib/format.ts`, `src/renderer/src/lib/useServices.ts`, `src/renderer/src/pages/project/IdeaStep.tsx`, `src/renderer/src/lib/useEstimate.ts`
- Test: `src/main/price.test.ts`

**Interfaces — Produces:**

```ts
// price.ts
export function creditLabel(n: number): string            // "12", "1,5"
export function usdLabel(n: number): string               // "US$0,25"
export function costLabel(e: { credits: number | null; usd: number | null } | null | undefined, times?: number): string | null
```

Aturan:
- `lib/format.ts` mengekspor ulang ketiganya dari `@shared/price`; `slate.ts` memakainya dan membuang `price()` miliknya.
- `IdeaStep`: `keys` bertipe `KeyStatus[] | null` (null = belum dimuat), panggilan `settings.keys()` diberi `.catch(() => setKeys([]))`, dan `mediaKeys` dihitung dengan `useMemo`.
- `useServices`: mengembalikan `[]` sampai daftar kunci dan status Whisper diketahui; `whisper.status()` diberi `.catch`.
- `useEstimate`: saat masukan berubah, nilai lama langsung diganti `undefined` sebelum permintaan baru (tidak ada harga lama yang sempat tampil).

- [ ] **Step 1: Write the failing tests** (`src/main/price.test.ts`):

```ts
test('creditLabel rounds like the pickers do', () => { assert.equal(creditLabel(12.4), '12'); assert.equal(creditLabel(1.55), '1,6'); assert.equal(creditLabel(6), '6') })
test('usdLabel uses Indonesian decimals and three places under a dollar', () => { assert.equal(usdLabel(0.25), 'US$0,25'); assert.equal(usdLabel(0.0504), 'US$0,05'); assert.equal(usdLabel(0.624), 'US$0,624'); assert.equal(usdLabel(3.5), 'US$3,50') })
test('costLabel picks credits first, then dollars, then nothing', () => {
  assert.equal(costLabel({ credits: 2, usd: 0.1 }, 3), '6 kr'); assert.equal(costLabel({ credits: null, usd: 0.05 }, 5), 'US$0,25'); assert.equal(costLabel(null), null); assert.equal(costLabel({ credits: null, usd: null }), null)
})
```

(Nilai `usdLabel(0.0504)` mengikuti perilaku sekarang: minimal 2, maksimal 3 angka di belakang koma; sesuaikan angka harapan dengan keluaran fungsi yang ada sebelum memindahkannya, jangan mengubah perilakunya.)

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (modul belum ada).
- [ ] **Step 3: Implement** sesuai aturan.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS; tes `costLines` yang ada tetap lolos.
- [ ] **Step 5: Commit** `refactor: one price formatter; loading states that cannot hang`

### Task 3: Sapuan konsistensi

**Files (Modify):** `components/ui.tsx`, `components/AppRail.tsx`, `components/StyleMenu.tsx`, `pages/Home.tsx`, `pages/Settings.tsx`, `pages/project/ScriptStep.tsx`, `pages/project/StoryboardStep.tsx`, `pages/project/EditorStep.tsx`, `pages/project/StyleStrip.tsx`, `pages/project/editor/TransitionButton.tsx`, `pages/project/editor/Player.tsx`, `src/main/theme.test.ts` (pasangan kontras)

Aturan:
- **Tombol:** `accent` memakai `hover:brightness-110` (bukan isian lebih gelap). Semua varian saat nonaktif: `disabled:bg-raised disabled:text-muted disabled:border-line-2 disabled:brightness-100` menggantikan `disabled:opacity-50`.
- **Judul halaman:** Naskah dan Storyboard memakai gaya judul Ide cerita (`font-display font-semibold leading-none`, 44 px untuk judul halaman); tulisan "Langkah 2 dari 4" di Naskah dihapus.
- **Pilihan aktif:** tab alat di kiri Editor dan baris terpilih di dropdown penyedia Pengaturan memakai `bg-select text-fg`.
- **Titik transisi:** transisi biasa `bg-accent text-canvas`; kuning (`bg-sun text-sun-on`) hanya saat titik itu sedang dipilih.
- **Fokus:** tombol kartu proyek di Beranda `focus-visible:-outline-offset-2`; kolom cari dan kotak ide Beranda `focus-within:border-accent`; bingkai gaya terpilih memakai `ring-2 ring-inset ring-accent` (tanpa jarak), sehingga garis fokus bawaan tetap terlihat berbeda; ubin gaya di `StyleMenu` sama.
- **Menu sisi:** nama penyedia dan judul proyek yang terpotong diberi `title`; titik "belum siap" menjadi lingkaran kosong bergaris `muted`; garis pemisah blok Layanan AI pindah ke pembungkus (tidak ikut melengkung atau tertutup hover); item "Pengaturan" menampilkan titik `sun` kecil kalau Cerita, Suara, atau Gambar belum siap.
- **Beranda:** `start()` langsung kembali kalau `creating` sudah true (klik ganda tidak membuat dua proyek).
- **Pita gaya:** tautan "Lihat semua" tampil kalau kategori berisi lebih dari 4 gaya; `section` memakai `aria-labelledby` ke judulnya.
- **Sisa:** hapus `hover:bg-select` yang tidak berpengaruh di `Player.tsx` dan `transition-shadow`/`shadow-none` di `Settings.tsx`.

- [ ] **Step 1:** Implementasikan.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih.
- [ ] **Step 3: Dev harness** (proyek demo dengan suara, video, overlay; kunci palsu):
  - screenshot Beranda, Pengaturan (Layanan AI, tombol "Simpan dan tes" nonaktif), Naskah, Storyboard, Editor (Klip dan Transisi), Ide cerita;
  - dua klik cepat pada "Mulai" → `projects.list()` bertambah tepat satu;
  - `Tab` dari awal Beranda sampai kartu proyek → elemen aktif punya garis fokus (cek `getComputedStyle(...).outlineStyle !== 'none'`);
  - jendela 1180 px di Beranda dan Ide cerita: tidak ada gulir mendatar.
- [ ] **Step 4: Commit** `feat: Ruang Edit consistency pass`

### Task 4: Dokumentasi dan verifikasi akhir

- [ ] **Step 1:** Perbarui `docs/konvensi.md` (dua tingkat tanda terpilih; menu sisi memakai `bg-raised` + garis `sun`; kode waktu di kartu memakai `font-display`, angka teknis `font-mono`; gambar gaya 4:3 di pita dan 1:1 di menu Beranda; tombol nonaktif), `docs/masalah-diketahui.md` (screenshot README menunggu proyek sungguhan), `CHANGELOG.md`.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS, bersih. Commit `docs: Ruang Edit conventions after the consistency pass`.
