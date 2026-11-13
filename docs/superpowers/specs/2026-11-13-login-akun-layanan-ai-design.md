# Desain: login akun untuk Layanan AI (ChatGPT, OpenRouter, Higgsfield, ElevenLabs)

Tanggal: 2026-11-13 · Status: disetujui pemilik (2026-11-13)

## Maksud dan alasan

Pemilik aplikasi (dan penggunanya) sudah berlangganan **ChatGPT, Higgsfield, dan ElevenLabs**. Saat ini Video Story
hanya menerima **API key**, yang ditagih terpisah dari langganan (saldo API). Tujuannya: **memakai langganan yang
sudah dibayar** lewat *login akun* (OAuth), tanpa membuang opsi API key.

- Penyusun cerita hanya menyusun naskah dan klip, jadi cukup memakai kuota langganan ChatGPT.
- Suara narator serta gambar dan video bisa memilih **API key** atau **Login akun**.

## Sasaran

1. **Penyusun cerita**
   - Penyedia baru **ChatGPT (langganan)** lewat *Sign in with ChatGPT* resmi (program "ChatGPT plan usage" untuk
     aplikasi open-source lokal).
   - **OpenRouter** mendapat tombol **Login dengan OpenRouter** (OAuth PKCE resmi). Hasilnya API key biasa yang
     disimpan seperti sekarang.
2. **Gambar dan video (Higgsfield)**: pilihan cara terhubung **Login akun** (lewat server MCP Higgsfield, memotong
   kredit langganan) atau **API key** (seperti sekarang, saldo API).
3. **Suara narator (ElevenLabs)**: pilihan **Login akun** atau **API key**, dengan syarat login ElevenLabs bisa dipakai
   ke API biasa (lihat bagian E).
4. Satu modul login bersama di proses utama: buka browser, terima callback di loopback, PKCE, simpan token
   terenkripsi, perbarui token otomatis, keluar (revoke).

## Bukan sasaran

- Login Google untuk Gemini: tidak ada jalur resmi untuk Gemini API. Gemini tetap API key.
- Langganan Claude: Anthropic melarang pemakaian di aplikasi pihak ketiga.
- Groq dan endpoint custom: tetap API key.
- Banyak akun per penyedia dan menu ganti akun: satu akun per penyedia sudah cukup.
- Login di macOS diuji penuh: target utama Windows, seperti aplikasi saat ini.

## Yang tidak boleh terjadi (anti-sasaran)

- **Meniru identitas aplikasi lain** (client ID Codex CLI, Gemini CLI, Claude Code). Hanya jalur resmi atau
  pendaftaran dinamis atas nama "Video Story".
- Token atau kunci tercetak di log, pesan error, atau file (aturan BYOK di AGENTS.md berlaku juga untuk token).
- Pengguna API key yang sudah ada terganggu: perilaku lama tetap bawaan sampai pengguna memilih Login akun.
- Pratinjau dan ekspor jadi berbeda: login hanya mengubah cara memanggil layanan, bukan aturan di `src/shared/`.

## Batasan

- Proses utama Electron yang melakukan semua panggilan jaringan dan OAuth. Renderer hanya lewat IPC (tiga tempat:
  `ipc.ts`, `shared/api.ts`, `preload/index.ts`).
- Penyimpanan rahasia memakai `safeStorage` seperti `secrets.ts`.
- Migrasi database hanya ditambah di akhir `MIGRATIONS`.
- Teks UI berbahasa Indonesia (pakai "kamu"), komentar dan nama kode berbahasa Inggris, TypeScript strict.
- Callback loopback memakai `http://127.0.0.1:<port>/auth/callback` (OpenAI mewajibkan `127.0.0.1`, bukan `localhost`).
- *Sign in with ChatGPT* berstatus **preview**: aturannya bisa berubah, dan pemakaian memotong batas paket ChatGPT.
- Daftar tool MCP Higgsfield dan ElevenLabs **hanya terlihat setelah login**, jadi bagian itu didahului uji coba
  (lihat Fase 2).

## Pendekatan yang dipertimbangkan

| Pendekatan | Isi | Untung-rugi | Keputusan |
|---|---|---|---|
| **1. Semua login langsung di aplikasi** | Modul OAuth bersama; ChatGPT lewat Responses API; OpenRouter PKCE; Higgsfield dan ElevenLabs lewat OAuth server MCP mereka | Paling lengkap dan sesuai tujuan; bagian MCP belum pasti sampai diuji | **Dipilih pengguna** |
| 2. ChatGPT lewat Codex app-server | Aplikasi membawa program Codex dan berbicara lewat stdio | Didukung resmi, tapi menambah program besar dan token tetap diurus sendiri; tidak ada keuntungan | Ditolak |
| 3. Login hanya untuk penyusun cerita | ChatGPT dan OpenRouter saja | Paling cepat, tapi langganan Higgsfield dan ElevenLabs tidak terpakai | Ditolak |

## Rancangan

### A. Modul OAuth bersama (`src/main/oauth/`)

- **Loopback**: server HTTP sementara di `127.0.0.1` dengan port acak, path `/auth/callback`. Dimulai sebelum browser
  dibuka (`shell.openExternal`), berhenti setelah satu callback atau 5 menit. Halaman balasan singkat berbahasa
  Indonesia: "Login berhasil. Kamu boleh menutup tab ini dan kembali ke Video Story." (atau pesan gagal).
- **PKCE S256, `state`, `nonce`** baru untuk setiap percobaan. `state` divalidasi sebelum apa pun.
- **Penyimpanan**: tabel baru `oauth_accounts` (migrasi baru) berisi satu baris per penyedia: `provider`, `client_id`,
  blob token terenkripsi (`access_token`, `refresh_token`, `id_token`, `expires_at`, `scope`), `label` akun untuk
  ditampilkan (misalnya email), dan `updated_at`. **Client ID hasil registrasi disimpan terpisah dari token** dan
  tidak dihapus saat keluar, supaya login berikutnya memakai client yang sama.
- **ID host** (`ext_agent_host_id` untuk ChatGPT): `urn:uuid:<uuid v4>` dibuat sekali per instalasi dan disimpan di
  tabel `settings`.
- **Refresh**: dilakukan otomatis sekitar 5 menit sebelum kedaluwarsa, dan **satu refresh berjalan per penyedia**
  (permintaan lain menunggu hasil yang sama), karena refresh token berotasi. Error permanen (`invalid_grant`,
  `refresh_token_*`) menghapus token dan menandai akun "perlu login ulang". Error jaringan atau 5xx tidak menghapus
  token.
- **Keluar**: revoke refresh token di endpoint penyedia kalau ada, lalu hapus token lokal. Kalau revoke gagal, token
  tetap dihapus dan pengguna diberi tahu untuk memutus akses dari pengaturan akun penyedia.

### B. ChatGPT (langganan) sebagai penyusun cerita

- Sumber: [ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source),
  [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
  [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions),
  [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference),
  [Token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference),
  [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery),
  [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations),
  [UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines).
- **Kelayakan**: program ini untuk aplikasi **open-source dan berjalan lokal**. Untuk aplikasi seperti itu, client
  didaftarkan otomatis saat login pertama, tanpa client secret dan tanpa persetujuan terlebih dulu. Video Story memenuhi
  syarat: repo publik `fakhriariaf/Video_Story` berlisensi MIT dan aplikasinya berjalan di komputer pengguna.
  (`"private": true` di `package.json` hanya mencegah terbit ke npm, tidak berkaitan.) Versi berbayar atau yang
  di-host di server harus lewat formulir minat OpenAI, dan itu di luar cakupan desain ini.
- `LlmProvider` bertambah `'chatgpt'`, dengan nama tampilan "ChatGPT (langganan)".
- **Login**: `https://auth.openai.com/api/accounts/authorize`, dengan `client_id=dynamic_agent_client` pada login
  pertama dan client ID hasil registrasi (`oaiapp_...`) pada login berikutnya. Parameter lain: `agent_name_hint=Video
  Story` (pertama kali saja), `ext_agent_host_id`, `response_type=code`, `redirect_uri` loopback,
  `scope=openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`,
  `resource=https://api.openai.com/v1`, `state`, `nonce`, PKCE.
- **Client ID hasil registrasi** dikirim balik di **callback** sebagai parameter `client_id` (bersama `code`, `state`,
  `scope`) pada login pertama. Nilai itu disimpan, dan `dynamic_agent_client` tidak pernah disimpan. Callback dengan
  `error=access_denied` berarti berhenti tanpa menukar kode.
- **Tukar kode**: `POST https://auth.openai.com/api/accounts/oauth/token` (form-encoded, tanpa client secret) dengan
  `grant_type=authorization_code`, `client_id` hasil registrasi, `code`, `code_verifier`, `redirect_uri` yang sama
  persis, dan `resource=https://api.openai.com/v1`.
- **Refresh**: endpoint yang sama dengan `grant_type=refresh_token`, `client_id` hasil registrasi, `refresh_token`, dan
  `resource`, tanpa `scope`. Access token berlaku 1 jam. Refresh token berlaku 30 hari dan **berotasi**, jadi access
  token, refresh token, kedaluwarsa, dan scope diganti bersamaan.
- **Validasi ID token**: issuer, `jwks_uri`, dan `revocation_endpoint` dibaca dari
  `https://auth.openai.com/.well-known/openid-configuration`. Yang dicek: tanda tangan (JWKS), issuer, audience = client
  ID, `nonce`, dan `exp`. `sub` menjadi identitas akun, dan email (kalau ada) dipakai sebagai label.
- **Keluar**: `POST` ke `revocation_endpoint` dengan `token=<refresh_token>`, `token_type_hint=refresh_token`, dan
  `client_id`. Balasan 200 kosong berarti berhasil. Client ID dan ID host tetap disimpan untuk login berikutnya.
  Kalau scope `chatgpt.tokens.use.direct` tidak diberikan, akun tetap tersimpan tapi ditandai "pemakaian paket belum
  diizinkan" dan tidak dipakai untuk menyusun cerita.
- **Daftar model**: `GET https://api.openai.com/v1/models` dengan token, ambil yang `visibility == "list"`
  (`slug`, `display_name`), lewat cache model yang sudah ada (`listModels`).
- **Menyusun cerita** (`services/chatgpt.ts`): `POST https://api.openai.com/v1/responses` dengan `store:false`,
  `stream:true`, `instructions` (bukan pesan system), `input` berupa array, tanpa `temperature`/`max_output_tokens`.
  SSE dibaca sampai `response.completed`; `response.failed`/`incomplete` dan aliran terputus dianggap gagal. Urutan
  format sama dengan `chatJson`: coba `text.format` JSON schema dulu; kalau ditolak
  (`subscription_sharing_unsupported_capability` atau 400 terkait format), turun ke JSON lewat instruksi biasa.
- **Pesan error** (bahasa Indonesia) mengikuti tabel "Errors and recovery" OpenAI. Contoh: batas pemakaian habis
  (429 `subscription_sharing_usage_limit_exceeded`) disertai tautan "Kelola pemakaian"; akun tidak memenuhi syarat
  (403) tanpa mencoba ulang; 503 dicoba ulang dengan jeda terbatas.
- **UI sesuai pedoman OpenAI**: tombol berlogo ChatGPT dengan label persis **"Continue with ChatGPT"** (nama fitur
  resmi, dibiarkan berbahasa Inggris). Setelah masuk tampil "Memakai paket ChatGPT · Kelola pemakaian" (membuka
  `https://chatgpt.com/settings/usage`). Modal satu kali setelah login pertama: "Kamu memakai paket ChatGPT"
  dengan tombol "Mengerti".

### C. OpenRouter: Login dengan OpenRouter

- Tombol di samping kolom kunci. Alurnya: `https://openrouter.ai/auth?callback_url=<loopback>&code_challenge=…&code_challenge_method=S256`,
  lalu `POST https://openrouter.ai/api/v1/auth/keys` (`code`, `code_verifier`, `code_challenge_method`), lalu
  `key` disimpan lewat `setSecret('openrouter', key)` dan langsung dites seperti kunci tempelan.
- Tidak ada token yang perlu diperbarui; sisa alur OpenRouter tidak berubah.

### D. Higgsfield: Login akun (MCP)

- Server: `https://mcp.higgsfield.ai/mcp`. Metadata OAuth publik sudah dicek: authorize
  `https://mcp.higgsfield.ai/oauth2/authorize`, token `/oauth2/token`, **registrasi dinamis** `/oauth2/register`,
  PKCE S256, refresh token, scope `openid email offline_access`.
- Registrasi dinamis sekali atas nama "Video Story" dengan redirect loopback. `client_id` disimpan.
- **Klien MCP** kecil di proses utama (`services/mcp.ts`): JSON-RPC lewat Streamable HTTP (`initialize`,
  `tools/list`, `tools/call`), membaca balasan JSON maupun SSE, dan menyimpan header `Mcp-Session-Id`.
- **Adaptor**: `generation.ts` tidak lagi memanggil `services/higgsfield.ts` langsung, melainkan lewat antarmuka
  `HiggsfieldBackend` (`submit`, `waitForResult`, `uploadFile`, `estimate`, `test`) dengan dua implementasi: REST
  (yang sekarang) dan MCP. Mode dipilih dari pengaturan.
- **Model dan parameter** di mode login diambil dari tool MCP (misalnya `models_list`/`models_get`). Pemetaan ke
  katalog REST (`shared/higgsfield-catalog.json`) **ditentukan setelah uji coba Fase 2**.
- **Alasan layak dikerjakan**: REST API Higgsfield memakai **saldo API prabayar**, sedangkan MCP memakai **kredit
  langganan**. Login benar-benar mengubah sumber pembayaran.
- **Aturan hasil Fase 2** (keputusan desain, bisa dikoreksi pemilik):
  - Konektor Higgsfield yang terpasang di sesi Claude sejauh ini hanya bisa membaca (saldo, daftar model, riwayat),
    sedangkan halaman Higgsfield menyebut lebih dari 35 model dan tool pembuat gambar dan video. Mana yang benar
    dibuktikan dengan `tools/list` setelah login.
  - **Kalau MCP tidak bisa membuat gambar dan video**, Fase 3 dibatalkan dan Higgsfield tetap API key saja.
  - **Kalau bisa membuat, tapi tidak bisa menerima unggahan file lokal**, mode login tetap dibuat untuk alur utama.
    Gambar hasil Higgsfield dipakai sebagai frame awal video dan referensi karakter lewat URL atau ID hasilnya.
    Fitur yang butuh unggahan gambar dari komputer pengguna menampilkan pesan bahwa fitur itu memerlukan mode API key.
  - **Workspace**: dipakai workspace aktif akun. Namanya ditampilkan di status, dan kalau ada lebih dari satu, pemilihan
    lewat tool workspace MCP.

### E. ElevenLabs: Login akun

- Metadata OAuth publik: authorize `https://elevenlabs.io/app/oauth/authorize`, token
  `https://api.us.elevenlabs.io/v1/oauth/token`, revoke `…/v1/oauth/revoke`, PKCE S256, refresh token, scope
  termasuk `text_to_speech` dan `speech_history_read`. **Tidak ada registrasi dinamis**, tapi mendukung *client ID
  metadata document* (CIMD): `client_id` berupa URL HTTPS publik ke file JSON yang mendeskripsikan aplikasi
  (`client_name`, `redirect_uris` loopback, dan lainnya).
- File itu disimpan di repo (misalnya `oauth/elevenlabs-client.json`) dan diterbitkan lewat **GitHub Pages**
  `https://fakhriariaf.github.io/Video_Story/…`. URL ini **permanen**, karena mengubahnya nanti membuat semua login
  ElevenLabs yang ada harus diulang.
- **Catatan biaya**: berbeda dengan Higgsfield, **API key ElevenLabs sudah memotong kuota langganan yang sama** (tes
  kunci membaca `/v1/user/subscription`). Login ElevenLabs tidak menghemat biaya, hanya menghilangkan langkah
  menempel kunci.
- **Keputusan pemilik**: login ElevenLabs **hanya dipertahankan kalau token login diterima REST API biasa**, karena
  hanya dengan begitu waktu per kata untuk caption tetap ada.
  - Di Fase 2, token dicoba langsung ke REST API (`Authorization: Bearer`) untuk
    `/v1/text-to-speech/{voice}/with-timestamps`, `/v1/voices`, `/v1/models`, dan `/v1/user/subscription`.
  - **Kalau diterima**, Fase 4 dikerjakan: `services/elevenlabs.ts` cukup memilih header auth sesuai mode (`xi-api-key`
    atau `Bearer` dengan refresh otomatis). Alur narasi, waktu per kata, dan caption tidak berubah.
  - **Kalau ditolak** (hanya jalur MCP yang jalan), Fase 4 **dibatalkan**: ElevenLabs tetap API key saja, file CIMD
    dihapus, dan temuan dicatat di `docs/keputusan-teknis.md`. Jalur MCP (`creative_generate_speech` dan
    sejenisnya) tidak dibangun.
- Uji coba ini butuh file CIMD sudah terbit, jadi **pemilik mengaktifkan GitHub Pages** untuk repo `Video_Story`
  di awal Fase 2.

### F. Pengaturan, status, dan IPC

- `AppSettings` bertambah `authMode: { higgsfield: 'key' | 'login'; elevenlabs: 'key' | 'login' }`, bawaannya `'key'`
  supaya pengguna lama tidak terganggu.
- Tipe baru `AccountStatus` (`provider`, `signedIn`, `label`, `needsReauth`, `planUsageAllowed?`) dan IPC
  `auth.status()`, `auth.login(provider)`, `auth.logout(provider)`, plus event perubahan status ke renderer.
- **Beranda** (`setupIssues`) menganggap penyedia siap kalau API key valid **atau** akun login aktif sesuai mode yang
  dipilih. `ttsReadiness` juga diperbarui.
- **Pengaturan › Layanan AI dan kunci**:

```
Penyusun cerita   Penyedia: [ ChatGPT (langganan) ▾ ]
                  [⬤ Continue with ChatGPT]
                  — setelah login —
                  ✓ fakhri@…   Memakai paket ChatGPT · Kelola pemakaian   [Keluar]
                  Model: [ gpt-… ▾ ]

Suara narator     ElevenLabs   Cara terhubung: ( Login akun | API key )
                  ✓ Masuk sebagai fakhri@…   Kredit langganan   [Keluar]

Gambar & video    Higgsfield   Cara terhubung: ( Login akun | API key )
                  [ Login dengan Higgsfield ]
```

- Pakai komponen yang sudah ada (bukan `<select>` bawaan), dan logo penyedia dari `assets/providers`.

### G. Dokumentasi

`docs/layanan-ai.md` (bagian baru "Login akun"), `docs/arsitektur.md` (tabel `oauth_accounts`, modul OAuth),
`docs/keputusan-teknis.md` (kenapa tidak meniru client CLI, kenapa refresh dibuat serial), `README.md` (tabel
kunci API ditambah kolom "Login akun"), dan `CHANGELOG.md`.

## Tahapan

1. **Fase 1**: modul OAuth bersama, ChatGPT (langganan), dan Login dengan OpenRouter. Semua endpoint sudah
   terdokumentasi.
2. **Fase 2 (uji coba, kodenya dibuang setelahnya)**: pemilik mengaktifkan GitHub Pages, lalu login Higgsfield dan
   ElevenLabs dengan akun pemilik. Catat `tools/list` dan skema tool Higgsfield, coba token ElevenLabs ke REST API,
   lalu tulis hasilnya ke `docs/layanan-ai.md`. Hasil ini menentukan apakah Fase 3 dan 4 dikerjakan, mengikuti
   aturan di bagian D dan E.
3. **Fase 3**: Higgsfield mode Login akun (kalau MCP bisa membuat gambar dan video).
4. **Fase 4**: ElevenLabs mode Login akun (kalau token login diterima REST API).

Setiap fase selesai dengan `npm run typecheck`, `npm run build`, dan pengecekan UI lewat dev harness. Login
sungguhan diuji manual oleh pemilik dengan akunnya sendiri.

## Diserahkan ke pembangun

- Struktur file dan nama fungsi di `src/main/oauth/`, termasuk bentuk tabel `oauth_accounts`.
- Cara uji otomatis alur OAuth (misalnya server tiruan lokal di dev harness).
- Detail tampilan selama mengikuti komponen dan aturan di `docs/konvensi.md`.
- Pemetaan model Higgsfield MCP dan pilihan jalur ElevenLabs, berdasarkan hasil Fase 2.
