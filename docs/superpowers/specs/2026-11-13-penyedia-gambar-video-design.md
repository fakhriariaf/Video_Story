# Desain: penyedia gambar dan video selain Higgsfield (Gemini dan fal.ai)

Tanggal: 2026-11-13 · Status: draf, menunggu persetujuan pemilik (pertanyaan builder check sudah dijawab)

> **Pembaruan saat membangun (2026-11-13):** Veo 3.1 di Gemini API sudah dimatikan Google pada 22 Oktober 2026.
> Video Gemini memakai penggantinya, **Gemini Omni Flash 1.2** (`gemini-omni-1.2-flash`, `POST /v1beta/interactions`,
> image-to-video, `response_format.duration` 3–15 detik, 720p/1080p/4K, sekitar $0,07 per detik di 720p). Omni tidak mengikat resolusi ke durasi, jadi
> aturan "turun ke 720p" di bagian 5 tidak lagi berlaku untuk model mana pun. Model gambar Gemini:
> `gemini-nano-banana-2.1` (rekomendasi), `gemini-3-pro-image`, `gemini-3.1-flash-lite-image`.

## Maksud dan alasan

Saat ini gambar klip, lembar karakter, dan video AI **hanya bisa dibuat lewat Higgsfield**. Pemakai yang tidak punya
saldo Higgsfield tidak bisa membuat visual sama sekali. Pemilik ingin pemakai **bisa memilih penyedia** sesuai kunci
dan saldo yang mereka punya.

Penyedia baru tahap ini (dipilih pemilik):

- **Google Gemini.** Kuncinya sudah dipakai untuk suara narator, jadi pemakai yang sudah mengisinya langsung bisa
  membuat gambar (Nano Banana) dan video (Veo).
- **fal.ai.** Satu kunci untuk banyak model populer (Flux, Seedream, Nano Banana, Kling, Seedance, Hailuo, Wan, Veo).

## Sasaran

1. Pemilih model gambar dan video di proyek menampilkan model dari **Higgsfield, fal.ai, dan Gemini**, dikelompokkan
   per penyedia ("Penyedia · Model").
2. Semua langkah yang sekarang memakai Higgsfield bekerja sama dengan penyedia baru: gambar klip, lembar karakter,
   gambar memakai lembar karakter sebagai referensi, video dari gambar klip, buat ulang, riwayat versi, dan
   melanjutkan job yang sedang berjalan setelah aplikasi dibuka ulang (untuk job yang bisa dilanjutkan).
3. Kunci **fal.ai** bisa diisi dan dites di Pengaturan › Layanan AI dan kunci. Gemini memakai kunci yang sudah ada.
4. Pemakai melihat **perkiraan harga** sebelum membuat: kredit untuk Higgsfield (seperti sekarang), dolar untuk fal.ai
   dan Gemini.
5. Proyek lama tetap berjalan persis seperti sekarang, tanpa migrasi data.

## Bukan sasaran

- Daftar model fal.ai yang diambil langsung dari fal.ai (600+ model, pendekatan B). Bisa menyusul sebagai "Cari model
  lain" setelah tahap ini stabil.
- OpenAI (gpt-image, Sora), gambar lewat OpenRouter, Replicate, ComfyUI lokal: tahap berikutnya.
- Login akun (OAuth) untuk fal.ai atau Gemini: keduanya hanya kunci API.
- Login Higgsfield lewat MCP (Fase 3 desain login akun): tetap ditunda sampai akun pemilik punya kredit.
- Mengganti penyedia per klip. Pilihan tetap per proyek, seperti sekarang.

## Yang tidak boleh terjadi (anti-sasaran)

- Model di pemilih yang **langsung gagal** saat dipakai pertama kali karena isian yang tidak cocok. Setiap model di
  daftar sudah dicek isiannya (lihat Pengujian).
- Uang terpakai tanpa pemakai melihat perkiraan harga lebih dulu (kalau harganya bisa diketahui).
- Kunci API tercetak di log, pesan error, atau file (aturan BYOK di AGENTS.md).
- Pratinjau dan ekspor jadi berbeda karena penyedia baru (aturan 1 di AGENTS.md).

## Batasan yang sudah diketahui (dari dokumentasi resmi, dicek 2026-11-13)

**Gemini API**

- Gambar: `POST /v1beta/models/{model}:generateContent`, `responseModalities: ["TEXT","IMAGE"]`,
  `imageConfig.aspectRatio` (ada `16:9` dan `9:16`) dan `imageSize` (`1K`/`2K`/`4K`, hanya model tertentu). Gambar
  referensi dikirim sebagai `inline_data` base64 (sampai 14 gambar untuk model Nano Banana terbaru). Hasil kembali
  langsung (sinkron) sebagai base64.
- Model gambar yang disebut dokumentasi: `gemini-2.5-flash-image`, `gemini-3.1-flash-image` (Nano Banana 2),
  `gemini-3-pro-image`, `gemini-nano-banana-2.1`. Nama pasti dicek ulang saat membangun.
- **Gambar Gemini tidak tersedia di free tier**: harga paid tier sekitar $0,034 (1K) sampai $0,076 (4K) per gambar
  untuk Nano Banana 2. Pemakai perlu billing aktif di Google AI Studio.
- Video: `POST /v1beta/models/{veo-model}:predictLongRunning`, isi `instances[0].image` (gambar awal, base64) dan
  `parameters.aspectRatio` (`16:9`/`9:16`), `durationSeconds` (`4`/`6`/`8`), `resolution` (`720p`; `1080p`/`4k` hanya
  untuk 8 detik), `personGeneration: "allow_adult"` untuk image-to-video. Hasilnya operation yang di-poll lewat
  `GET /v1beta/{operation.name}` sampai `done`, lalu video diunduh dari
  `response.generateVideoResponse.generatedSamples[0].video.uri` dengan header `x-goog-api-key`.
- Veo **selalu membuat suara**. Suara itu dibuang seperti suara model Higgsfield sekarang (narasi dari editor).
- Model Veo: Veo 3.1, 3.1 Fast, 3.1 Lite (preview), Veo 3/3 Fast (stable). Status free tier untuk Veo dicek saat
  membangun; anggap berbayar.

**fal.ai**

- Antrean: `POST https://queue.fal.run/{endpoint_id}` dengan header `Authorization: Key <kunci>` → `request_id`,
  `status_url`, `response_url`, `cancel_url`. Status `IN_QUEUE` / `IN_PROGRESS` / `COMPLETED`. Batal:
  `PUT .../requests/{id}/cancel`.
- Skema isian setiap model: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>` (JSON Schema, bentuknya
  sama dengan yang dipakai katalog Higgsfield sekarang).
- Unggah file: REST storage (`https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3` → `upload_url`
  + `file_url`). Data URI base64 juga diterima, tapi tidak disarankan untuk file besar.
- Harga: `GET https://api.fal.ai/v1/models/pricing?endpoint_id=...` (satuan tagihan dan harga per satuan), juga
  endpoint estimasi biaya.
- Di fal.ai, model teks-ke-gambar dan model "edit" (yang menerima gambar referensi) sering **endpoint terpisah**,
  misalnya `fal-ai/nano-banana-2` dan versi `/edit`-nya.

## Pendekatan

| | Cara | Kelebihan | Kekurangan |
|---|---|---|---|
| **A (dipilih)** | Lapisan penyedia di proses utama + daftar model fal.ai terpilih (15–25 model) yang disimpan di repo, plus model Gemini yang ditulis tangan | Setiap model di daftar terjamin cocok; kunci Gemini yang ada langsung berguna; proyek lama tidak berubah | Model fal.ai baru perlu ditambahkan ke daftar secara manual (lewat skrip) |
| B | Seperti A, tapi daftar fal.ai diambil langsung dari fal.ai saat aplikasi berjalan | Selalu terbaru, ratusan model | Banyak model dengan isian berbeda atau tanpa gambar referensi, jadi sering gagal |
| C | Hanya fal.ai (fal.ai juga punya Nano Banana dan Veo) | Kode paling sedikit | Kunci Gemini pemakai tidak terpakai; harus isi saldo di tempat lain |

Pemilik memilih **A** (2026-11-13) karena memberi pilihan penyedia sekaligus memanfaatkan kunci Gemini yang sudah ada.

## Desain

### 1. Katalog model bersama (`src/shared/`)

- Tipe `HfModel` menjadi `MediaModel` dengan field tambahan `provider: 'higgsfield' | 'fal' | 'gemini'`. Bentuk lain
  (`input`, `props`, `durations`, `tags`, `required`) tetap, sehingga `fitDuration`, `resolutionOptions`,
  `describeModel`, `imageBody`, `videoBody` bisa dipakai untuk semua penyedia.
- **ID model yang disimpan di proyek**: model Higgsfield tetap tanpa awalan (ID lama tetap valid, **tanpa migrasi**);
  model baru memakai awalan `fal:` dan `gemini:` (contoh `fal:fal-ai/kling-video/v2.5/image-to-video`,
  `gemini:gemini-3.1-flash-image`). `getImageModel`/`getVideoModel` mencari di gabungan ketiga katalog, dengan
  fallback ke model bawaan seperti sekarang.
- **fal.ai**: file `fal-catalog.json` dengan bentuk sama seperti `higgsfield-catalog.json`, dibuat oleh skrip
  `scripts/fal-catalog.mjs` dari daftar endpoint terpilih + OpenAPI masing-masing endpoint, lalu di-commit. Model
  gambar yang punya endpoint edit terpisah menyimpan keduanya (`endpoint` dan `refEndpoint`): tanpa lembar karakter
  memakai `endpoint`, dengan lembar karakter memakai `refEndpoint`.
- **Gemini**: daftar kecil yang ditulis tangan (model gambar Nano Banana dan model Veo) dengan pembentuk isian sendiri
  (`geminiImageBody`, `veoBody`), karena API-nya bukan berbentuk skema isian bebas.
- Daftar awal fal.ai (diverifikasi satu per satu saat membangun; yang tidak lolos dibuang):
  - Gambar: Nano Banana 2 (+edit), Flux Kontext Pro/Max, Seedream (+edit), Flux dev/pro (tanpa referensi), Qwen Image
    (+edit), Ideogram atau Recraft bila isiannya cocok.
  - Video (image-to-video): Kling (versi terbaru standar dan pro), Seedance (lite/pro), Hailuo, Wan, Veo 3.1 Fast,
    Pixverse atau Luma bila isiannya cocok.
- Model bawaan (`DEFAULT_IMAGE_MODEL`/`DEFAULT_VIDEO_MODEL`) tetap model Higgsfield sekarang, **kecuali** pemakai
  tidak punya kunci Higgsfield. Dalam kasus itu, model untuk proyek baru otomatis memakai model rekomendasi dari
  penyedia pertama yang kuncinya ada (urutan: Higgsfield, fal.ai, Gemini). Pemakai yang hanya punya kunci Gemini tidak
  mendapat proyek pertama yang terkunci. *(Keputusan pembangun, setelah builder check.)*
- Daftar masalah setup di Beranda mengecek penyedia dari **model untuk proyek baru** (setelan di atas). Gambar dianggap
  terblokir hanya kalau tidak ada satu pun kunci penyedia gambar.

### 2. Lapisan penyedia di proses utama (`src/main/`)

- `generation.ts` tidak lagi memanggil `services/higgsfield.ts` langsung, tapi lewat satu antarmuka per penyedia:
  - `prepareRef(asset, signal)`: menyiapkan gambar referensi atau gambar awal dalam bentuk yang diterima penyedia
    (Higgsfield: unggah seperti sekarang; fal.ai: unggah ke storage fal, cache URL di `asset.meta` seperti
    `uploadedUrl`; Gemini: base64 dari file lokal).
  - `submit(model, body, signal)`: mengirim permintaan, mengembalikan ID jarak jauh (Higgsfield request id, fal
    request id + endpoint, nama operation Veo) atau hasil langsung (gambar Gemini).
  - `wait(remoteId, onProgress, signal, timeout)`: menunggu sampai selesai, mengembalikan URL atau byte hasil.
  - `cancel(remoteId)` dan `estimate(model, body)`.
- Penyimpanan hasil (`finishHiggsfield` sekarang) menjadi umum: unduh atau tulis byte, simpan aset dengan
  `provider` dan `model` yang benar, lalu perbarui klip atau lembar karakter seperti sekarang.
- Kolom `provider` di tabel `jobs` dan `assets` sudah berupa teks, jadi cukup diisi `fal`/`gemini`. **Tidak ada
  migrasi.**
- `resumeJobs`: job Higgsfield dan fal.ai yang sudah terkirim di-poll lagi setelah aplikasi dibuka ulang; job video
  Veo juga (nama operation disimpan sebagai `remote_id`). Gambar Gemini sinkron, jadi kalau aplikasi ditutup di
  tengah jalan job ditandai gagal, seperti TTS.
- Layanan baru: `services/fal.ts` dan `services/gemini-media.ts`. Pesan error berbahasa Indonesia dan bisa
  ditindaklanjuti, misalnya:
  - fal.ai 401: "Kunci fal.ai tidak valid…"; saldo habis: "Saldo fal.ai habis. Isi ulang di fal.ai/dashboard/billing."
  - Gemini kuota nol atau free tier: "Gambar dan video Gemini butuh billing aktif di Google AI Studio."
  - Gemini menolak karena keamanan konten: pesan yang menyebut adegan bisa diubah.

### 3. Kunci dan Pengaturan

- `ApiProvider` mendapat `'fal'`, dengan nama "fal.ai", logo di `ProviderLogo`, kotak isian kunci, tombol Tes, dan
  tautan "Buat kunci" ke halaman kunci fal.ai. Tes kunci memakai panggilan harga (tidak memakan saldo).
- Bagian "Gambar dan video" di Pengaturan memakai satu dropdown penyedia (lihat perubahan 2026-11-13 di bawah).
  Gemini menyebut bahwa gambar dan video butuh billing aktif.
- Mengganti kunci fal.ai atau Gemini menghapus cache perkiraan harga penyedia itu (seperti `forgetEstimates` untuk
  Higgsfield sekarang).

#### Perubahan 2026-11-13: satu dropdown penyedia (disetujui pemilik)

Tiga kartu penyedia di Pengaturan diganti **satu dropdown** (`ProviderSelect`), sama seperti Penyusun cerita dan
Suara narator, supaya ketiga bagian konsisten dan penyedia baru cukup menambah satu baris.

- Pilihan: Higgsfield, fal.ai, Google Gemini, masing-masing dengan logo, keterangan, dan lencana status kuncinya.
- Di bawah dropdown hanya tampil milik penyedia terpilih: kotak kunci (Gemini memakai kunci yang sama dengan TTS dan
  catatan billing), lalu **Model gambar bawaan** dan **Model video bawaan** yang isinya hanya model penyedia itu.
- Penyedia terpilih adalah **bawaan untuk proyek baru**. Tidak ada setelan baru: penyedia terpilih adalah penyedia
  dari `settings.imageModel`; mengganti penyedia mengisi `imageModel` dan `videoModel` dengan model rekomendasi
  penyedia itu. Proyek lama tidak berubah, dan di langkah Ide cerita model penyedia lain yang kuncinya ada tetap bisa
  dipilih.
- `newProjectModels` tetap berlaku: kalau penyedia bawaan belum punya kunci, proyek baru memakai penyedia pertama
  yang kuncinya ada.

### 4. Pemilih model dan tampilan proyek

- `ModelSection` dan `ModelPicker` menampilkan model **dikelompokkan per penyedia** dengan logo penyedia. Judul
  bagian menjadi "N model gambar dan M model video dari 3 penyedia".
- Penyedia yang kuncinya belum diisi tetap tampil, tapi barisnya diberi tanda "Isi kunci fal.ai di Pengaturan" dan
  tidak bisa dipilih.
- Harga per baris: kredit untuk Higgsfield (seperti sekarang); dolar untuk fal.ai (dari API harga, dihitung sesuai
  satuannya, misalnya per gambar atau per detik video) dan Gemini (dari tabel harga resmi yang disimpan di katalog,
  ditandai "perkiraan dari tarif Google"). Pengurutan "termurah dulu" bekerja di dalam satu satuan.
- Teks yang sekarang menyebut Higgsfield secara tetap diganti nama penyedia model yang dipakai: subjudul "Video AI"
  di Storyboard, Inspector ("Klip ini memakai video dari …"), progres job ("Mengantre di fal.ai"), dan daftar masalah
  setup di Beranda (lihat aturan model bawaan di bagian 1).

### 5. Durasi video

Durasi video tetap mengikuti `fitDuration` (durasi terpendek yang menutup klip, atau yang terpanjang). Veo hanya 4,
6, atau 8 detik, dan 1080p/4k hanya 8 detik; aturan ini dimasukkan ke data model Veo.

**Kalau proyek memilih 1080p/4k dan klip butuh video kurang dari 8 detik, video Veo dibuat 720p** dengan durasi yang
pas (4 atau 6 detik), bukan dipaksa 8 detik. Pemakai membayar hanya detik yang perlu. Kartu klip memberi tahu, misalnya
"Veo · 720p (1080p hanya untuk 8 detik)". `effectiveResolution`, perkiraan harga per baris, dan total biaya di
Storyboard mengikuti resolusi yang benar-benar dipakai per klip. *(Diputuskan pemilik, 2026-11-13.)* Klip yang lebih panjang dari
video memakai perilaku yang sudah ada (sisa klip menahan frame terakhir dan ada peringatan "Buat ulang video").

### 6. Dokumentasi

Perbarui `docs/layanan-ai.md`, `docs/arsitektur.md`, `docs/alur-produksi.md`, AGENTS.md (deskripsi singkat dan peta
kode), README, dan CHANGELOG. Cara memperbarui daftar fal.ai (`node scripts/fal-catalog.mjs`) dicatat di
`docs/pengembangan.md`.

## Pengujian

- Unit test (`npm test`) untuk bagian murni:
  - Pembacaan ID model berawalan dan fallback ke bawaan.
  - Isian fal.ai untuk **setiap** model di daftar (gambar dengan/tanpa referensi, video dengan durasi dan resolusi),
    dicek terhadap `required` di skemanya.
  - `geminiImageBody` dan `veoBody` (format, durasi 4/6/8, aturan 1080p = 8 detik).
  - Pembacaan status fal.ai dan operation Veo, termasuk error.
  - Perhitungan harga dolar dari satuan fal.ai.
- `npm run typecheck` dan `npm run build` bersih.
- Dev harness: pemilih model menampilkan tiga penyedia, baris terkunci tanpa kunci, harga tampil.
- Uji langsung oleh pemilik dengan kuncinya sendiri (memakan saldo kecil): satu gambar dan satu video per penyedia
  baru, satu gambar dengan lembar karakter, dan satu job video yang dilanjutkan setelah aplikasi ditutup.

## Diserahkan ke pembangun

- Nama pasti endpoint dan model (dicek ulang di dokumentasi saat membangun).
- Bentuk persis antarmuka penyedia di `generation.ts`, selama perilaku di atas terpenuhi.
- Ukuran gambar referensi untuk Gemini (perkecil kalau terlalu besar untuk dikirim inline).
- Detail tampilan pengelompokan di `ModelPicker`, mengikuti `docs/konvensi.md`.

## Catatan cabang

PR login akun (#2) belum digabung dan menyentuh Pengaturan yang sama. Pekerjaan ini dibangun di cabang baru dari
`feat/login-akun` supaya tidak bentrok, lalu disesuaikan setelah PR #2 digabung.
