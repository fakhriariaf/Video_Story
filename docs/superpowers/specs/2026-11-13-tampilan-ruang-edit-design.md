# Desain: tampilan baru "Ruang Edit" untuk seluruh aplikasi

Tanggal: 2026-11-13 · Status: draf, menunggu persetujuan pemilik (pertanyaan builder check sudah dijawab)

Mockup acuan (dipilih pemilik, arah A): gambar di `docs/superpowers/specs/assets/ruang-edit-beranda.png`.

## Maksud dan alasan

Tampilan Video Story masih desain bawaan Bang Story: kertas krem, garis hitam tebal, bayangan keras. Yang berubah
baru warna aksen dan logo. Pemilik ingin **seluruh tampilan** berubah supaya aplikasi terasa sebagai brand sendiri,
dimulai dari Beranda dan langkah Ide cerita.

Pemilik memilih arah **Ruang Edit**: gelap seperti ruang penyuntingan film, gambar dan video jadi pusat perhatian,
proyek berjajar sebagai bingkai di pita film, dan satu tombol utama berwarna kuning lampu rekam.

## Sasaran

1. Semua halaman memakai gaya Ruang Edit: Beranda, Ide cerita, Naskah, Storyboard, Editor, Pengaturan, dialog, menu,
   dan toast.
2. Beranda dan Ide cerita mendapat **tata letak baru**, bukan hanya warna baru.
3. Di akhir setiap tahap, aplikasi tetap utuh dan bisa dipakai (tidak ada halaman setengah jadi).
4. Semua fungsi tetap sama. Tidak ada alur yang hilang atau berpindah tanpa alasan.

## Bukan sasaran

- Mode terang yang bisa dipilih pemakai. Token dibuat semantik supaya ini bisa ditambahkan nanti.
- Mengubah tata letak Editor (pratinjau, timeline, inspector). Editor hanya ganti gaya.
- Mengubah video hasil: caption, gerak kamera, transisi, overlay, dan ekspor tidak disentuh.
- Ikon aplikasi dan installer (`build/icon.ico`). Bisa menyusul sebagai pekerjaan kecil tersendiri.
- Fitur baru (undo, impor video sendiri, dan lainnya dari daftar masukan).

## Yang tidak boleh terjadi (anti-sasaran)

- Tampilan campuran (sebagian krem, sebagian gelap) di akhir sebuah tahap.
- Teks yang sulit dibaca. Teks isi minimal kontras 4,5:1 terhadap latarnya; ini paling penting di Naskah dan
  Pengaturan yang penuh teks.
- Kuning dipakai untuk banyak hal. Kuning hanya untuk **satu tindakan utama per layar** dan penanda posisi aktif.
- Pratinjau dan ekspor jadi berbeda (aturan 1 di AGENTS.md). File di `src/shared/` yang mengatur video tidak diubah.
- Fungsi rusak karena salah ganti kelas. Setiap tahap dicek lewat dev harness di semua halaman.

## Batasan dari kode sekarang

- Tampilan memakai Tailwind v4 dengan token di `@theme` (`src/renderer/src/styles.css`). Token warna dipakai sekitar
  1.100 kali di 37 file `.tsx`; warna yang ditulis langsung hanya 68 di 8 file (`ModelLogo`, `ProviderLogo`,
  `Inspector`, `Timeline`, `Logo`, `ui`, `Waveform`, `Player`).
- Token `ink` sekarang punya tiga peran: warna teks (`text-ink`), garis tebal (`border-ink`, 53 kali), dan isian
  gelap untuk pilihan aktif (`bg-ink` + `text-paper`, 27 kali). Di tema gelap ketiga peran ini harus dipisah.
- Bayangan keras (`shadow-ink`, 16 kali) adalah ciri desain lama.
- Font UI dimuat lewat `@fontsource-variable` di `main.tsx`. Font caption (Poppins, Anton, dan lainnya) terpisah dan
  tidak boleh berubah.
- Aturan UI di `docs/konvensi.md` (tanpa `<select>` bawaan, teks Indonesia dengan "kamu", pilihan aktif ditandai
  warna latar) tetap berlaku dan diperbarui untuk gaya baru.

## Pendekatan

| | Cara | Kelebihan | Kekurangan |
|---|---|---|---|
| **1 (dipilih)** | Ganti fondasi (token, huruf, komponen dasar) dulu, lalu rombak halaman satu per satu | Seluruh aplikasi langsung berubah; risiko kecil; tiap tahap bisa dicoba | Nama token lama perlu dirapikan supaya tidak menyesatkan |
| 2 | Tulis ulang halaman demi halaman dengan komponen baru | Kode akhir paling rapi | Lama tampil campuran; hampir semua file disentuh; risiko terbesar |
| 3 | Cara 1 ditambah mode terang | Pemakai bisa memilih | Pengecekan dua kali lipat; belum diminta |

Pemilik memilih **cara 1** (2026-11-13).

## Desain

### 1. Warna

Latar memakai biru-indigo sangat gelap (bukan hitam), supaya tetap senada dengan warna brand indigo.

| Peran | Warna | Dipakai untuk |
|---|---|---|
| Latar aplikasi | `#121026` | latar halaman |
| Panel | `#1B1838` | kartu, kotak isian, panel sisi |
| Panel terangkat | `#24204A` | chip, baris aktif, hover, isian tombol sekunder |
| Dasar pita film | `#0B0A1A` | pita film proyek, area pratinjau video |
| Garis | `#2A2656`, `#322D63`, `#3A3572` | pemisah, tepi kartu, tepi putus-putus |
| Teks utama | `#ECEAFB` | judul dan isi |
| Teks kedua | `#C9C5EE` | keterangan penting |
| Teks redup | `#A29EC9` | keterangan; placeholder `#8A85BC` |
| Aksen indigo | `#7C6CFF` | logo, fokus, tautan (`#A99EFF` untuk teks tautan), tombol tambah |
| Tindakan utama | `#FFB627` dengan teks `#2A1C00` | satu tombol utama per layar, penanda posisi aktif |
| Berhasil | latar `#0F3A2B`, teks `#6FE3B5` | lencana Terhubung, Diekspor |
| Info | latar `#14305A`, teks `#8FC2FF` | lencana Tersimpan |
| Peringatan | latar `#3B2F00`, teks `#FFCF66` | lencana Editor/proses, catatan kuning |
| Gagal | latar `#4A1512`, teks `#FF9A8F` | error, tombol hapus |

Indigo brand `#4338CA` tetap dipakai di logo terang dan materi di luar aplikasi; di atas latar gelap dipakai versi
terangnya `#7C6CFF` supaya terbaca.

### 2. Huruf

- **Barlow Condensed** (600, juga 500 dan 700) untuk judul halaman, judul bagian, nama brand, dan kode waktu.
  Bentuknya rapat seperti tulisan di papan clapper.
- **Barlow** (400, 500, 600) untuk semua teks lain.
- **JetBrains Mono** tetap untuk kunci API dan ID model.
- Dimuat lewat `@fontsource/barlow` dan `@fontsource/barlow-condensed` (lisensi OFL); paket Bricolage Grotesque dan
  Plus Jakarta Sans dilepas. Font caption tidak berubah.
- Ukuran: judul halaman 44–52 px, judul bagian 26–28 px, isi 15–16 px, keterangan 13–14 px.

### 3. Bentuk dan komponen dasar

- Sudut: 14 px untuk panel besar, 8 px untuk tombol, chip, dan kolom isian, 6 px untuk bingkai gambar.
- **Tanpa bayangan keras.** Kedalaman ditunjukkan dengan beda terang panel dan garis 1 px. Menu dan dialog yang
  melayang memakai bayangan gelap lembut.
- Tombol, lima tingkat *(keputusan pembangun, setelah builder check)*:
  - **utama** (kuning): tindakan yang memajukan alur, satu per layar. Kalau satu layar punya dua tombol utama
    (Storyboard: "Jadikan video" dan "Lanjut ke editor"), yang memajukan ke langkah berikutnya tetap kuning dan yang
    lain turun ke tingkat aksen.
  - **aksen** (isian indigo `#7C6CFF`, teks gelap `#121026`): tindakan penting kedua, misalnya "Simpan dan tes",
    "Generate gambar", "Continue with ChatGPT".
  - **sekunder** (panel terangkat + garis), **hantu** (teks saja), **bahaya** (merah gelap, untuk hapus dan
    konfirmasi yang merusak).
  - Varian `ink` lama (tombol hitam) dipetakan ke aksen atau bahaya sesuai maknanya, lalu dihapus.
- Pilihan aktif (tab, chip, baris): panel terangkat dengan teks terang; penanda posisi (menu sisi, tab) memakai garis
  kuning. Ini menggantikan "pil hitam" desain lama.
- Garis tebal hitam (`border-ink`) menjadi garis 1 px biasa; fokus keyboard tetap terlihat (garis aksen 2 px).
- Lencana status memakai pasangan latar-teks pada tabel warna.
- Scrollbar tipis mengikuti warna garis.

### 4. Kerangka aplikasi

- **Beranda dan Pengaturan** memakai menu sisi kiri selebar 228 px: logo dan nama, menu (Beranda, Pengaturan), dan
  di bawahnya ringkasan **Layanan AI**: Cerita, Suara, Gambar, Caption, masing-masing dengan nama penyedia terpilih
  dan titik status (hijau terhubung, redup belum). Mengklik ringkasan membuka Pengaturan. *(Keputusan pembangun:
  menu "Semua proyek" di mockup tidak dibuat, karena daftar proyek sudah ada di Beranda.)*
- **Pengaturan di dalam kerangka ini** *(keputusan pembangun)*: menu sisi 280 px milik Pengaturan sekarang dilebur ke
  menu sisi kiri yang baru, jadi hanya ada satu menu sisi. Saat Pengaturan terbuka, ketiga tabnya (Layanan AI dan
  kunci, Umum, Tentang aplikasi) tampil sebagai sub-menu di bawah "Pengaturan". Kalau Pengaturan dibuka dari dalam
  proyek, baris paling atas menu sisi adalah "Kembali ke proyek" (menggantikan "Beranda" sebagai jalan pulang yang
  ditonjolkan).
- **Logo** *(keputusan pembangun)*: bentuk logo sekarang (lingkaran, segitiga putar, bintang kecil) dipertahankan
  supaya sama dengan ikon aplikasi dan installer; hanya warnanya disesuaikan untuk latar gelap. Kotak membulat di
  mockup hanyalah gambar pengganti. Bintang kuning adalah bagian logo, bukan pelanggaran aturan kuning.
- **Di dalam proyek** (Ide, Naskah, Storyboard, Editor) tetap bilah atas dengan empat langkah, supaya Editor
  mendapat lebar penuh. Gayanya mengikuti Ruang Edit.

### 5. Beranda

Sesuai mockup:

- Judul "Mau bikin video apa hari ini?" dan satu kalimat penjelasan.
- Kotak ide: teks ide, lalu baris chip (durasi, bahasa, format, gaya, suara) dan tombol utama kuning. Perilaku chip
  dan tombol sama seperti sekarang: tombolnya tetap **"Mulai"** (membuat proyek lalu membuka Ide cerita). Tulisan
  "Susun cerita" di mockup keliru dan tidak dipakai.
- Baris "Coba ide ini".
- **Proyek kamu** sebagai pita film: tab saringan (Semua, Draf, Dalam proses, Diekspor) dengan jumlahnya, kolom
  "Cari proyek" di kanan judul, kartu "Proyek baru" di awal, lalu proyek sebagai bingkai 16:9 dengan kode waktu,
  judul, lencana status, dan waktu terakhir diubah. Pita melipat ke baris berikutnya kalau proyek banyak; menu
  titik-tiga tetap berisi yang ada sekarang (Buka, Duplikat, Hapus). Ganti nama tetap dilakukan di dalam proyek.
- Peringatan setup ("kunci … belum diisi") tetap muncul di atas kotak ide kalau ada yang menghalangi, dengan gaya
  catatan kuning.

### 6. Ide cerita

Pemilik memilih tata letak **B, "Papan clapper"** (2026-11-14) dari dua mockup di
`assets/ruang-edit-ide.html`. Semua isi halaman lama tetap ada; yang berubah susunannya.

- **Kiri (form):** judul "Ceritakan idemu", kotak ide, lalu satu panel pengaturan berisi Durasi, Format, Bahasa, dan
  Suara narator (empat kolom; dua kali dua kalau ruangnya sempit). Di bawahnya **Gaya visual** sebagai pita film:
  tab kategori (Semua, 2D, 3D, Realistis), lima gaya dalam satu baris, dan tautan "Lihat semua N gaya" yang
  membentangkan pita menjadi semua gaya (klik lagi untuk meringkas). Gaya terpilih selalu ikut tampil di baris
  ringkas. Terakhir **Model AI**: dua kartu pemilih model (gambar dan video, dengan resolusi video).
- **Kanan (papan clapper), menempel saat digulir:** garis-garis clapper, judul proyek, bingkai pratinjau berbentuk
  format yang dipilih (16:9 atau 9:16) berisi contoh gaya terpilih dan kode waktu durasi, lalu daftar Adegan, Format,
  Bahasa, Narator, Gaya, Gambar, Video. Di bawahnya perkiraan biaya: jumlah gambar kali harga per gambar, dan harga
  satu video AI. Perkiraan biaya **pindah dari kartu Model AI ke papan ini**; harga per model di dalam pemilih model
  tetap ada.
- **Bilah bawah:** siapa yang menyusun naskah (penyedia dan model, tautan Ganti), tombol "Lihat naskah" kalau naskah
  sudah ada, dan tombol utama "Susun naskah" / "Susun ulang naskah". Perilakunya tidak berubah.
- *(Keputusan pembangun:)* tulisan kecil "Langkah 1 dari 4" di atas judul dihapus karena bilah langkah di atas sudah
  menunjukkannya; "Lihat semua gaya" membentangkan pita di tempat, bukan membuka jendela terpisah; kalimat "Sekitar N
  adegan…" pindah ke baris Adegan di papan.

### 7. Halaman lain (tahap 4)

Naskah, Storyboard, Editor, dan Pengaturan mengikuti fondasi secara otomatis di tahap 1. Di tahap 4 masing-masing
dirapikan: jarak, hierarki judul, warna keadaan (terpilih, berjalan, gagal), warna timeline dan gelombang suara, dan
warna yang masih ditulis langsung di 8 file. Tata letak Editor tidak berubah.

## Tahapan

Setiap tahap adalah satu PR yang bisa dicoba sendiri.

| Tahap | Isi | Hasil yang terlihat |
|---|---|---|
| 1. Fondasi | token warna dan huruf, komponen dasar (`ui.tsx`, `Select`, `Popover`, `ModelPicker`, `Toasts`), logo, pemisahan tiga peran `ink`, penghapusan bayangan keras, warna yang ditulis langsung, `docs/konvensi.md` | seluruh aplikasi gelap dengan tata letak lama |
| 2. Kerangka dan Beranda | menu sisi kiri, ringkasan Layanan AI, Beranda baru dengan pita film | Beranda seperti mockup |
| 3. Ide cerita | mockup untuk disetujui, lalu tata letak baru | langkah Ide cerita baru |
| 4. Perapian | Naskah, Storyboard, Editor, Pengaturan; screenshot README | semua halaman rapi dan konsisten |

Cabang kerja dibuat dari `feat/penyedia-gambar-video` (PR #3 belum digabung dan menyentuh Pengaturan), lalu
disesuaikan setelah PR #3 digabung.

## Pengujian

- `npm run typecheck`, `npm test`, dan `npm run build` bersih di setiap tahap.
- Dev harness (proyek demo `seed`, `speech`, `videos`, `overlays`) mengambil screenshot **setiap halaman** di setiap
  tahap: Beranda, Pengaturan (ketiga tab), Ide cerita, Naskah, Storyboard, Editor (tab Klip, Caption, Overlay,
  Transisi), dialog ekspor, satu menu terbuka, dan satu toast. Screenshot diperiksa satu per satu.
- Kontras teks isi terhadap latar dicek dengan hitungan (minimal 4,5:1) untuk pasangan warna di tabel.
- Tidak ada sisa `shadow-ink`, warna krem lama, atau nama font lama di `src/renderer` setelah tahap 1 (dicek dengan
  pencarian).
- Ekspor proyek demo sebelum dan sesudah tahap 1 menghasilkan video yang sama (durasi dan cuplikan frame), sebagai
  bukti hasil video tidak berubah.

## Diserahkan ke pembangun

- Cara memisahkan tiga peran `ink` (ganti nama kelas secara mekanis, atau namespace token per utilitas di Tailwind
  v4), selama hasilnya sesuai bagian 3.
- Nama token baru, selama semantik (peran, bukan warna) dan dicatat di `docs/konvensi.md`.
- Keadaan hover, tekan, dan nonaktif tiap komponen, mengikuti tabel warna.
- Latar logo penyedia dan model (`ProviderLogo`, `ModelLogo`): tetap putih bila logonya butuh latar terang.
- Tampilan pita film saat proyek hanya satu atau belum ada.
