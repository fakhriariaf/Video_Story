# Layanan AI dan kunci API

Semua panggilan ke layanan luar dilakukan di **proses utama** (`src/main/services/`). Renderer tidak pernah
memegang kunci API.

## Kunci API (BYOK)

Pengguna memasukkan kuncinya sendiri di **Pengaturan › Layanan AI dan kunci**.

- Disimpan di tabel `secrets` setelah dienkripsi dengan Electron `safeStorage`. Di Windows ini memakai DPAPI,
  terikat ke akun Windows pengguna, jadi salinan `studio.db` di komputer lain tidak bisa membuka kuncinya.
- Kunci kriptonya dibuat saat startup (`warmUpEncryption`) supaya tidak hilang kalau aplikasi ditutup paksa tepat
  setelah menyimpan kunci pertama.
- `requireSecret(provider)` melempar error berbahasa Indonesia kalau kunci belum ada.
- `revealSecret` hanya dipanggil tombol "tampilkan kunci" di Pengaturan.
- **Jangan pernah** menulis kunci ke log, pesan error, file, URL, atau mengirimnya ke layanan lain.
- Mengganti kunci Higgsfield, fal.ai, atau Gemini menghapus cache estimasi harga penyedia itu (`forgetEstimates(provider)`).

| Penyedia (`ApiProvider`) | Dipakai untuk |
|---|---|
| `higgsfield` | gambar, lembar karakter, video |
| `fal` | gambar, lembar karakter, video |
| `gemini` | LLM (naskah/visual), Gemini TTS, gambar (Nano Banana), dan video (Omni Flash) |
| `elevenlabs` | TTS |
| `openrouter`, `groq`, `custom` | LLM lewat API kompatibel OpenAI |

## LLM (`services/llm.ts`, `services/gemini.ts`)

- `generateJson({ system, prompt, schema, name })` memanggil penyedia aktif (`settings.llmProvider` +
  `llmModels[provider]`).
  - Gemini: `@google/genai` dengan `responseJsonSchema` (dan cadangan: skema ditulis di system instruction).
  - Lainnya: `/chat/completions`, dicoba berurutan `json_schema` (strict) → `json_object` → teks biasa, lalu JSON
    diambil dari teks (`extractJson`) untuk model yang tidak mendukung structured output.
- `listModels(source)`: daftar model live dari penyedia, dicache di tabel `cache` dan disegarkan saat basi.
- **Menambah penyedia LLM baru** yang kompatibel OpenAI: tambahkan ke `LlmProvider` dan `ApiProvider`
  (`types.ts`), `LLM_PROVIDERS` (`shared/models.ts`), konfigurasi base URL di `llm.ts`, dan `DEFAULT_SETTINGS.llmModels`.
- ChatGPT (langganan) memakai `services/chatgpt.ts`, bukan `/chat/completions`. Lihat bagian Login akun.

## Login akun (`src/main/oauth/`)

Selain API key, sebagian layanan bisa dihubungkan dengan login akun (OAuth). Desainnya ada di
[superpowers/specs/2026-11-13-login-akun-layanan-ai-design.md](superpowers/specs/2026-11-13-login-akun-layanan-ai-design.md).

- **Alur bersama**: `startLoopback()` membuka server sementara di `http://127.0.0.1:<port acak>/auth/callback`
  (OpenAI menolak `localhost`), lalu browser dibuka dengan `shell.openExternal`. PKCE S256, `state`, dan `nonce` baru
  untuk setiap percobaan. Listener berhenti setelah satu callback, setelah 5 menit, atau saat dibatalkan
  (`auth:cancel`). Klik login kedua membatalkan yang pertama.
- **Penyimpanan**: tabel `oauth_accounts` (satu baris per penyedia). Token disimpan sebagai JSON terenkripsi
  `safeStorage`. Client ID hasil registrasi **tidak dihapus** saat keluar, supaya login berikutnya memakai client yang
  sama. ID host (`ext_agent_host_id`) berupa `urn:uuid:…` dan tersimpan di tabel `settings` dengan key `oauthHostId`.
- **Refresh**: dilakukan sekitar 5 menit sebelum access token kedaluwarsa, lewat `singleFlight` (satu refresh per
  penyedia, karena refresh token berotasi). Error permanen (`invalid_grant`, `refresh_token_*`) menghapus token dan
  menandai `needs_reauth`. Error jaringan atau 5xx tidak menghapus apa pun.
- **Token tidak pernah** dicetak ke log atau pesan error. Pesan error token hanya memuat kode error OAuth.

### ChatGPT (langganan) — `oauth/chatgpt.ts`, `services/chatgpt.ts`

Program resmi "Sign in with ChatGPT / ChatGPT plan usage" untuk aplikasi open-source lokal
([dokumentasi](https://developers.openai.com/siwc/token-sharing-open-source)).

- Authorize `https://auth.openai.com/api/accounts/authorize`, dengan `client_id=dynamic_agent_client` saat login
  pertama dan client hasil registrasi (`oaiapp_…`, dari parameter callback `client_id`) setelahnya. Scope:
  `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, resource `https://api.openai.com/v1`.
- Tukar kode dan refresh: `https://auth.openai.com/api/accounts/oauth/token` (form-encoded, tanpa secret). ID token
  dicek dengan JWKS dari `/.well-known/openid-configuration` (issuer, audience = client ID, `nonce`, `exp`).
- Tanpa scope `chatgpt.tokens.use.direct`, akun tetap tersimpan tapi penyusunan cerita ditolak sebelum memanggil API.
- Inferensi: `POST https://api.openai.com/v1/responses` dengan `store:false`, `stream:true`, `instructions`, dan
  `input` array. `temperature`, `max_output_tokens`, dan pesan system ditolak oleh rute ini. Format dicoba
  `json_schema` dulu, lalu JSON lewat instruksi biasa. Error `*_unavailable`/503 dicoba ulang 2 kali (2 dan 4 detik).
- Daftar model: `GET https://api.openai.com/v1/models`, ambil yang `visibility == "list"`.
- Keluar: revoke refresh token ke `revocation_endpoint`, lalu token lokal selalu dihapus.
- UI mengikuti pedoman OpenAI: tombol **Continue with ChatGPT**, tautan **Kelola pemakaian**
  (`https://chatgpt.com/settings/usage`), dan modal sekali "Kamu memakai paket ChatGPT" (`chatgptWelcomeSeen`).

### OpenRouter — `oauth/openrouter.ts`

`https://openrouter.ai/auth?callback_url=…&code_challenge=…&code_challenge_method=S256&state=…`, lalu
`POST https://openrouter.ai/api/v1/auth/keys`. Hasilnya API key biasa yang disimpan dan dites lewat
`settings:loginOpenRouter`, sama seperti kunci yang ditempel.

## TTS

| Penyedia | File | Catatan |
|---|---|---|
| Gemini TTS | `services/gemini.ts` | PCM 24 kHz → WAV; daftar suara dari Voice Library (`listVoices`, cache 24 jam) dengan cadangan statis di `shared/models.ts`; contoh suara bawaan di `renderer/src/assets/voices` |
| ElevenLabs | `services/elevenlabs.ts` | memakai endpoint with-timestamps untuk waktu per kata; tag `<...>` diubah ke `[tag]` untuk model v3, atau ke `<break>` untuk model lama (`toElevenLabsText`) |

Narasi selalu dibuat satu rekaman utuh lalu dipotong. Lihat [alur-produksi.md](alur-produksi.md#4-narasi-srcmainnarrationts).

## Gambar dan video: tiga penyedia

Model dipilih per proyek (`Project.imageModel`, `Project.videoModel`). Semua model ada di satu katalog,
`src/shared/media.ts`, yang menggabungkan tiga sumber. ID model menentukan penyedianya:

| Penyedia | ID model | Sumber katalog | Harga |
|---|---|---|---|
| Higgsfield | tanpa awalan, misalnya `kling-video/v3.0/std/image-to-video` | `shared/higgsfield-catalog.json` | kredit, dari endpoint `estimate` |
| fal.ai | `fal:<endpoint>`, misalnya `fal:google/nano-banana-2.1` | `shared/fal-catalog.json` (dibuat `scripts/fal-catalog.mjs`) | dolar, dari API harga fal |
| Google Gemini | `gemini:<model>`, misalnya `gemini:gemini-nano-banana-2.1` | `shared/gemini-media.ts` (ditulis tangan) | dolar, dari tarif resmi yang disimpan di katalog |

- `imageRequest` dan `videoRequest` (di `media.ts`) membuat isian permintaan untuk semua penyedia. Higgsfield dan
  fal dibentuk dari skema tiap model; Gemini punya pembentuk sendiri (`geminiImageBody`, `omniBody`).
- `src/main/media/backends.ts` punya satu adaptor per penyedia: menyiapkan gambar referensi (URL publik, atau data
  base64 untuk Gemini), mengirim, menunggu, membatalkan, dan memperkirakan harga. `generation.ts` hanya memakai
  adaptor ini.
- Job yang sudah terkirim bisa dilanjutkan setelah aplikasi dibuka lagi (`media/payload.ts`, `resumePlan`). Gambar
  Gemini selesai langsung dalam satu permintaan, jadi kalau terputus ditandai gagal.
- **Penyedia bawaan** dipilih lewat satu dropdown di Pengaturan › Gambar dan video (seperti Penyusun cerita dan
  Suara narator). Tidak ada setelan tersendiri: penyedia bawaan adalah penyedia dari `settings.imageModel`
  (`defaultMediaProvider`), dan mengganti penyedia mengisi `imageModel`/`videoModel` dengan model rekomendasinya
  (`providerDefaults`). Di bawah dropdown hanya tampil kunci dan model bawaan penyedia itu.
- Proyek baru memakai model bawaan itu, kecuali penyedianya belum punya kunci. Dalam kasus itu dipakai model
  rekomendasi penyedia pertama yang kuncinya ada (`newProjectModels`, urutan Higgsfield, fal.ai, Gemini).

## fal.ai (`services/fal.ts`, `services/fal-format.ts`)

- Antrean: `POST https://queue.fal.run/<endpoint>` dengan header `Authorization: Key <kunci>` → `request_id`,
  `status_url`, `response_url`, `cancel_url`. Ketiga URL disimpan di payload job supaya bisa dilanjutkan.
- Gambar referensi dan frame pertama diunggah ke CDN fal (`rest.fal.ai/storage/upload/initiate`), URL-nya disimpan
  di `meta.falUrl` aset selama 12 jam.
- Harga: `GET https://api.fal.ai/v1/models/pricing?endpoint_id=…`. Satuan per gambar, per detik, atau per video
  dihitung (`falUsd`); satuan lain (misalnya megapiksel) tidak diperkirakan. Tes kunci memakai panggilan ini juga,
  jadi tidak memakai saldo.
- **Memperbarui daftar model:** ubah daftar kurasi di `scripts/fal-catalog.mjs`, lalu jalankan
  `node scripts/fal-catalog.mjs`. Skrip mengambil skema OpenAPI tiap endpoint, menyimpan varian `/edit` sebagai
  `withRefs` (dipakai kalau ada lembar karakter), dan melewati model yang isian wajibnya tidak bisa diisi aplikasi.
  Setelah itu jalankan `npm test` (`catalog.test.ts` mengecek setiap model fal).
- Banyak model gambar fal memakai `image_size` (`landscape_16_9`/`portrait_16_9`) dan bukan `aspect_ratio`;
  sebagian model video meminta `duration` berupa teks. Keduanya ditangani di `media.ts`.

## Gambar dan video Gemini (`services/gemini-media.ts`, `shared/gemini-media.ts`)

- Memakai kunci Gemini yang sama dengan TTS. **Gambar dan video tidak termasuk free tier**; tanpa billing aktif,
  Google menjawab kuota 0 dan aplikasi menampilkan "Gambar dan video Gemini butuh billing aktif di Google AI Studio."
- Gambar (Nano Banana): `POST v1beta/models/<model>:generateContent` dengan `responseModalities: ["TEXT","IMAGE"]`,
  `imageConfig.aspectRatio` dan `imageSize`. Lembar karakter dikirim sebagai `inline_data` (diperkecil kalau lebih
  dari 3 MB). Jawaban tanpa gambar atau yang diblokir keamanan konten dijelaskan ke pengguna.
- Video (**Gemini Omni Flash 1.2**, `gemini-omni-1.2-flash`): Veo 3.1 di Gemini API dimatikan Google pada
  22 Oktober 2026, jadi video memakai Omni lewat `POST v1beta/interactions` (`video_config.task: image_to_video`,
  `response_format: { type: video, aspect_ratio, resolution, duration: "<n>s", delivery: uri }`, durasi 3–15 detik;
  tanpa `duration` Omni membuat 10 detik). Video ada di `steps[].content[]` (item `type: video`) dengan URI
  `…/files/<id>:download?alt=media`; file itu di-poll sampai `ACTIVE` lalu diunduh. Tarif sekitar $0,07/detik
  (720p), $0,104 (1080p), $0,209 (4K).

## Higgsfield (`services/higgsfield.ts`)

- Base URL `https://api.higgsfield.ai`, header `Authorization: Key <kunci>`.
- Alur: `submit(endpoint, body)` → polling `getStatus` → unduh hasil. `uploadFile` mengunggah gambar referensi
  (lembar karakter, gambar klip untuk video).
- `estimate(endpoint, body)` memanggil `/estimate/<endpoint>` → `{ credits, usd }`, dicache 24 jam di tabel `cache`.
  Endpoint ini gratis (tidak memakai kredit). API Higgsfield tidak punya daftar harga maupun endpoint saldo, jadi
  biaya per model selalu diambil dari sini.
- Pesan error dibuat ramah (`friendly`): kunci salah, kredit habis, terlalu banyak proses, model tidak tersedia.
- Untuk pengembangan, `STUDIO_HF_BASE` bisa diarahkan ke server tiruan (mock) supaya UI bisa diuji tanpa kredit.

### Katalog model (`src/shared/higgsfield-catalog.json`)

48 model: 14 model gambar (teks ke gambar) dan 34 model video yang bisa menganimasikan gambar klip. Model yang butuh
video masukan (edit video, motion control) atau hanya teks-ke-video sengaja tidak dimasukkan. Seedream belum tersedia
di API Higgsfield (hanya di aplikasi webnya). Satu entri:

```json
{
  "id": "kling-video/v3.0/std/image-to-video",
  "name": "Kling 3.0 · Standard · Image to video",
  "family": "Kling",
  "kind": "video",
  "input": { "field": "image_url", "mode": "first-frame", "max": 1 },
  "required": ["image_url"],
  "props": { "prompt": { "type": "string" }, "duration": { "type": "integer", "minimum": 3, "maximum": 15 }, "sound": { "enum": ["on", "off"] } },
  "durations": { "min": 3, "max": 15 },
  "tags": ["Kling"]
}
```

- `input.field`/`mode`/`max`: tempat gambar referensi atau frame pertama dikirim, dan berapa banyak.
- `props`: skema parameter dari dokumentasi Higgsfield. `imageRequest`/`videoRequest` di `shared/media.ts`
  mengisinya secara umum: rasio, resolusi, kualitas, durasi, mematikan `enhance_prompt`, `prompt_extend`, dan audio.
- `durations`: rentang (`min`/`max`) atau daftar (`values`) durasi video.
- **Menambah model**: tambahkan entri baru dengan format yang sama dari dokumentasi API Higgsfield
  (`https://docs.higgsfield.ai/docs/llms.txt`), lalu pastikan `imageRequest`/`videoRequest` tidak melempar error
  "butuh <field>" (`checkRequired`). Ikon keluarga model diatur di `components/ModelLogo.tsx`.
- Model bawaan: `DEFAULT_IMAGE_MODEL` dan `DEFAULT_VIDEO_MODEL` di `shared/media.ts`; rekomendasi per penyedia di
  `RECOMMENDED`.

## Whisper lokal (`src/main/whisper.ts`)

- Biner: `resources/whisper/whisper-cli.exe` + DLL (whisper.cpp, lisensi MIT). Saat ini hanya untuk Windows.
- Model: `ggml-small.bin` (sekitar 488 MB) dari Hugging Face (`ggerganov/whisper.cpp`), diunduh di Pengaturan ke
  `<folder data>\models\whisper`, bisa dijeda dan dilanjutkan (HTTP Range), lalu dicek SHA-256. Untuk pengembangan, `STUDIO_WHISPER_URL` bisa menunjuk salinan lokal.
- Dijalankan di antrean `whisper` (satu per satu). Detail argumennya di [alur-produksi.md](alur-produksi.md#5-caption-akurat-whisper-lokal).

## Membuka tautan

`app:openExternal` hanya menerima URL `https://` dan membukanya di browser bawaan. Pakai ini untuk semua tautan
ke luar (dokumentasi penyedia, channel YouTube, Suno, dan lainnya).
