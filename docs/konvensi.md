# Konvensi

## Bahasa

- **Teks yang dilihat pengguna: Bahasa Indonesia** yang santai dan jelas, menyapa dengan "kamu". Pesan error
  menjelaskan apa yang terjadi dan apa yang bisa dilakukan, misalnya: "Kredit Higgsfield tidak cukup. Isi ulang
  di dashboard Higgsfield."
- **Kode, nama, dan komentar: bahasa Inggris.** Komentar menjelaskan *kenapa* (alasan, jebakan, batasan), bukan
  mengulang apa yang sudah jelas dari kode.
- Angka desimal di UI memakai koma ("3,5 dtk"); satuan pendek: `dtk`, `dB`, `px`.
- Prompt untuk model AI ditulis dalam bahasa Inggris (lebih akurat), kecuali bagian yang memang untuk pengguna.

## TypeScript

- `strict`, `noUnusedLocals`, `noUnusedParameters`. Kode harus lolos `npm run typecheck` tanpa error.
- Tipe data bersama di `src/shared/types.ts`; tipe IPC di `src/shared/api.ts`.
- Fungsi murni yang dipakai main dan renderer ditaruh di `src/shared/` (tanpa impor Electron atau DOM).
- Ikuti gaya file di sekitarnya: kepadatan komentar, penamaan, pola yang sama.
- Belum ada konfigurasi Prettier/ESLint. Gaya yang dipakai: indentasi 2 spasi, tanpa titik koma, kutip tunggal.
  Komentar dibungkus sekitar 110 karakter; baris kode boleh lebih panjang kalau masih mudah dibaca.

## Tampilan (renderer)

### Design token (`src/renderer/src/styles.css`, Tailwind v4 `@theme`)

Tampilan memakai gaya **Ruang Edit**: gelap seperti ruang penyuntingan film. Token dinamai menurut **perannya**,
bukan warnanya, supaya tema lain (misalnya mode terang) bisa ditambahkan tanpa mengganti nama kelas.

| Token | Warna | Dipakai untuk |
|---|---|---|
| `canvas` / `panel` / `rail` / `raised` | `#121026` / `#1b1838` / `#171431` / `#24204a` | latar aplikasi / kartu dan kolom isian / menu sisi / chip, hover, tombol sekunder |
| `strip` | `#0b0a1a` | pita film, area pratinjau, tirai di belakang dialog (`bg-strip/75`) |
| `select` | `#3d3691` | isian pilihan aktif (tab, chip, baris menu terpilih) |
| `fg`, `fg-2`, `muted`, `faint` | `#eceafb`, `#c9c5ee`, `#a29ec9`, `#8a85bc` | teks utama, kedua, redup, placeholder |
| `line`, `line-2`, `line-3`, `edge` | indigo gelap bertingkat | garis; `edge` untuk garis tegas dan hover |
| `accent` (+ `-press`, `-soft`), `link` | `#7c6cff`, `#a99eff` | aksen indigo, fokus, tombol tingkat kedua; `link` untuk teks tautan |
| `sun` (+ `-on`, `-soft`, `-ink`) | `#ffb627` | **satu tindakan utama per layar** dan penanda posisi aktif; `-soft`/`-ink` untuk peringatan |
| `ok-*`, `info-*`, `bad-*`, `draft` | hijau, biru, merah, netral | lencana dan status |

Aturan pemakaian:

- **Kuning hanya untuk satu tindakan utama per layar** (`Button variant="primary"`) dan penanda posisi (langkah
  aktif, playhead, klip terpilih). Tindakan penting kedua memakai `variant="accent"`; sisanya `secondary`, `ghost`,
  atau `danger`.
- Teks di atas isian terang memakai warna gelap: `text-sun-on` di atas `sun`, `text-canvas` di atas `accent`.
- Tanpa bayangan keras. Permukaan dibedakan lewat isiannya; hanya menu dan dialog melayang yang memakai
  `shadow-pop`.
- Sudut: panel besar `rounded-[14px]`, tombol/chip/kolom isian `rounded-lg`, bingkai gambar `rounded-md`.
- Warna caption dan overlay (misalnya `TEXT_SWATCHES` di Inspector) adalah bagian dari video, bukan tema aplikasi.

`npm test` menjaga dua hal (`src/main/theme.test.ts`): setiap pasangan teks dan latar di tabel mencapai kontras
4,5:1, dan tidak ada nama kelas, font, atau warna dari desain lama yang tersisa di `src/renderer/src`.

Font UI: Barlow (teks), Barlow Condensed (judul dan kode waktu, `font-display`), JetBrains Mono (kunci API dan ID
model). Font caption ada terpisah di `captions.ts`.

### Komponen yang dipakai ulang

| Komponen | File | Catatan |
|---|---|---|
| `Button`, `IconButton`, `Chip`, `Segmented`, `Badge`, `Switch`, `Field`, `inputCls`, `Progress`, `Spinner`, `Kbd`, `Modal`, `Menu`, `confirmDialog` | `components/ui.tsx` | dasar semua halaman; `confirmDialog` mengembalikan `Promise<boolean>` |
| `Select` | `components/Select.tsx` | dropdown bergaya, dengan pencarian, grup, ikon, dan aksi per baris |
| `Popover` | `components/Popover.tsx` | panel mengambang di portal; menghentikan event agar tidak bocor ke elemen di belakangnya |
| `ModelPicker`, `ModelLogo`, `ProviderLogo` | `components/` | pemilih model AI dengan ikon dan biaya |
| `AutoTextarea` | `components/AutoTextarea.tsx` | textarea yang tumbuh mengikuti isi dan tetap bisa diubah ukurannya |
| `StyleMenu`, `StylePicker` | `components/` | pemilih gaya visual berupa grid thumbnail 1:1 |
| `AppRail` | `components/AppRail.tsx` | menu sisi kiri Beranda dan Pengaturan: logo, menu, sub-menu tab Pengaturan, ringkasan Layanan AI |
| `FilmStrip` | `components/FilmStrip.tsx` | daftar proyek sebagai pita film; 3 kolom, 4 kolom kalau pitanya cukup lebar |

### Kerangka halaman

- **Beranda dan Pengaturan** memakai `AppRail` (228 px) di kiri dan isi di kanan. Tab Pengaturan tampil sebagai
  sub-menu di rail; kalau Pengaturan dibuka dari dalam proyek, baris pertama rail adalah "Kembali ke proyek".
- **Halaman proyek** (Ide, Naskah, Storyboard, Editor) memakai bilah atas `ProjectHeader` dengan empat langkah,
  supaya Editor mendapat lebar penuh.
- Ringkasan Layanan AI di rail dihitung `serviceSummary` (`src/shared/services.ts`) dari setelan, status kunci,
  akun, dan status model Whisper.

### Aturan UI (hasil masukan pemilik aplikasi)

1. **Jangan pakai `<select>` bawaan.** Pakai `Select`/`Popover` supaya tampilannya seragam.
2. **Pilihan visual** (gaya gambar dll.) dipilih dari **grid thumbnail persegi 1:1**, bukan daftar teks. Contoh
   gambarnya berfokus pada karakter, menghadap kamera, dengan subjek berbeda tiap pilihan.
3. **Satu dropdown penyedia per bagian** (misalnya LLM atau TTS): hanya formulir penyedia terpilih yang
   ditampilkan. Kunci Higgsfield cukup satu kolom (format `KEY_ID:KEY_SECRET` dari tombol "Copy API key").
4. **Pilihan yang tidak bisa dipakai dinonaktifkan**, misalnya penyedia TTS tanpa kunci valid.
5. **Kurangi klik manual.** AI mengisi pengaturan per klip (gerak kamera, kekuatan, transisi, arahan video), dan
   pratinjau berjalan otomatis.
6. **Pilihan terpilih ditandai warna latar** (`bg-select`), bukan kolom centang. Baris model diberi ikon
   keluarganya.
7. **Pengaturan ada di tempat itemnya.** Contohnya transisi: tombol bulat di sambungan antar klip yang membuka
   panel Transisi, bukan isian di panel klip yang terkesan berlaku untuk semua.
8. **Timeline seperti CapCut.** Setiap item (klip, potongan caption, suara, musik, overlay, sambungan) bisa diklik
   dan membuka panelnya sendiri. Hanya item yang sedang diedit yang ditandai, dengan satu gaya cincin untuk semua
   (`SELECTED` di `Timeline.tsx`). Item yang tidak dipilih tidak boleh memakai warna accent.
9. **Pratinjau tanpa menggeser playhead** untuk pengaturan yang perlu dilihat (gerak kamera, transisi): pakai
   `useAudition`.
10. **Perubahan tersimpan otomatis** bila memungkinkan (misalnya edit teks caption), tanpa tombol "Simpan" terpisah.
11. Tata letak harus tetap rapi di jendela minimal 1180×720 dan tidak boleh melebar keluar layar. Grid berisi
    konten panjang perlu `min-w-0` atau `minmax(0,1fr)`.

## Keamanan dan privasi

- Kunci API hanya lewat `secrets.ts`; jangan pernah mencetak atau mengirimnya ke tempat lain.
- Tautan keluar hanya lewat `window.api.app.openExternal` (https saja).
- Jangan melonggarkan CSP kecuali perlu, dan sebutkan domain secara spesifik (seperti `frame-src https://www.youtube.com`).
- Saat menguji dengan data asli pengguna, pakai salinan dengan tabel `secrets` dikosongkan.
