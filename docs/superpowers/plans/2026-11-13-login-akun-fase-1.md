# Login Akun Fase 1 (OAuth bersama, ChatGPT langganan, Login OpenRouter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Penyusun cerita bisa memakai langganan ChatGPT lewat "Sign in with ChatGPT", dan OpenRouter bisa dihubungkan lewat login browser, di atas satu modul OAuth bersama yang nanti dipakai Higgsfield dan ElevenLabs.

**Architecture:** Modul `src/main/oauth/` di proses utama (loopback `127.0.0.1`, PKCE, verifikasi ID token, single-flight refresh, penyimpanan token terenkripsi di tabel baru `oauth_accounts`). `src/main/services/chatgpt.ts` memanggil Responses API (`store:false`, `stream:true`) dan dipilih oleh `llm.ts` saat `llmProvider === 'chatgpt'`. Renderer hanya lewat IPC baru `auth:*` dan `settings:loginOpenRouter`.

**Tech Stack:** Electron 44, TypeScript 5.9 strict, React 19, better-sqlite3, Node `node:test` + esbuild untuk unit test (tanpa dependensi baru).

**Spec:** `docs/superpowers/specs/2026-11-13-login-akun-layanan-ai-design.md` (bagian A, B, C, F, G). Bagian D dan E (Higgsfield, ElevenLabs) ada di garis besar Fase 2–4 di akhir dokumen ini.

## Global Constraints

- Teks UI berbahasa Indonesia dengan "kamu"; komentar dan nama di kode berbahasa Inggris; komentar menjelaskan *kenapa* (AGENTS.md aturan 6).
- TypeScript strict dengan `noUnusedLocals`/`noUnusedParameters`; `npm run typecheck` dan `npm run build` wajib bersih di setiap task.
- IPC baru di tiga tempat: `handle(...)` di `src/main/ipc.ts`, tipe di `src/shared/api.ts`, `call(...)` di `src/preload/index.ts`.
- Migrasi hanya **ditambah di akhir** array `MIGRATIONS` (`src/main/db/index.ts`).
- Token, kode otorisasi, dan kunci **tidak pernah** dicetak ke log, pesan error, atau file selain tabel terenkripsi.
- Callback loopback: `http://127.0.0.1:<port>/auth/callback` (bukan `localhost`).
- ChatGPT authorize: `https://auth.openai.com/api/accounts/authorize`; token/refresh: `https://auth.openai.com/api/accounts/oauth/token`; discovery: `https://auth.openai.com/.well-known/openid-configuration`; resource: `https://api.openai.com/v1`.
- ChatGPT scope persis: `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`; client pertama kali `dynamic_agent_client` (tidak pernah disimpan); `agent_name_hint=Video Story` hanya pada login pertama; `ext_agent_host_id` = `urn:uuid:<uuid v4>` per instalasi.
- Inferensi ChatGPT: `POST https://api.openai.com/v1/responses` dengan `store:false`, `stream:true`, `instructions` (bukan pesan system), `input` array, tanpa `temperature`/`max_output_tokens`/`metadata`/`user`/`previous_response_id`. Model: `GET https://api.openai.com/v1/models`, ambil `visibility == "list"`, pakai `slug` dan `display_name`.
- OpenRouter: authorize `https://openrouter.ai/auth?callback_url=…&code_challenge=…&code_challenge_method=S256&state=…`; tukar `POST https://openrouter.ai/api/v1/auth/keys` dengan `{ code, code_verifier, code_challenge_method: 'S256' }`, hasil field `key`.
- Label tombol ChatGPT persis **`Continue with ChatGPT`**; tautan kelola pemakaian `https://chatgpt.com/settings/usage`.
- Pengguna lama tidak terganggu: `llmProvider` bawaan tetap `gemini`.

## Review Focus

1. **Tab login ditutup atau tidak pernah diselesaikan**: listener loopback berhenti setelah 5 menit, tombol kembali normal dengan pesan "Login dibatalkan atau kedaluwarsa", dan klik login kedua menutup listener sebelumnya. Dites di Task 2 (`loopback times out`) dan Task 5 (login kedua membatalkan yang pertama).
2. **Refresh saat jaringan putus atau server 5xx**: token tetap disimpan dan error bisa dicoba ulang; hanya error permanen yang memaksa login ulang. Dites di Task 3 (`classifyRefreshError`).
3. **Dua penyusunan cerita bersamaan saat token hampir kedaluwarsa**: refresh token berotasi, jadi hanya satu refresh yang boleh berjalan. Dites di Task 3 (`singleFlight runs once for concurrent callers`).
4. **Pengguna menolak izin pemakaian paket** (scope `chatgpt.tokens.use.direct` tidak diberikan): akun tersimpan, ditandai, dan penyusunan cerita ditolak dengan pesan jelas tanpa memanggil API. Dites di Task 3 (`planUsageGranted`) dan Task 6.
5. **Stream putus di tengah atau `response.failed`/`incomplete`**: dilaporkan sebagai error yang bisa dibaca, bukan JSON kosong; pembatalan pengguna (`AbortSignal`) tetap menghentikan proses. Dites di Task 4 (`readResponsesStream`).

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `scripts/test.mjs` (baru) | Bundel `src/**/*.test.ts` dengan esbuild lalu jalankan `node --test` |
| `src/main/oauth/pkce.ts` (baru) | `randomToken`, `challengeFor`, `createPkce` |
| `src/main/oauth/loopback.ts` (baru) | Server callback sementara di `127.0.0.1` |
| `src/main/oauth/tokens.ts` (baru) | Tipe `TokenSet`, `toTokenSet`, `needsRefresh`, `classifyRefreshError`, `planUsageGranted`, `singleFlight` |
| `src/main/oauth/jwt.ts` (baru) | `decodeJwt`, `verifyIdToken` (RS256 via `node:crypto`) |
| `src/main/oauth/store.ts` (baru) | Baris `oauth_accounts` + host ID; enkripsi `safeStorage` |
| `src/main/oauth/chatgpt.ts` (baru) | Alur login, `chatgptAccessToken()` dengan refresh, logout/revoke, status |
| `src/main/oauth/openrouter.ts` (baru) | `loginOpenRouter()` → API key |
| `src/main/services/sse.ts` (baru) | Parser Server-Sent Events |
| `src/main/services/chatgpt-format.ts` (baru) | Body Responses API, pembaca stream, pesan error Indonesia |
| `src/main/services/chatgpt.ts` (baru) | `listModels()`, `generateJson()` |
| `src/main/services/llm.ts` | Cabang `chatgpt` di daftar model dan `generateJson` |
| `src/main/db/index.ts` | Migrasi `oauth_accounts` |
| `src/main/ipc.ts`, `src/shared/api.ts`, `src/preload/index.ts`, `src/main/events.ts` | IPC `auth:*`, `settings:loginOpenRouter`, event `auth` |
| `src/shared/types.ts`, `src/shared/models.ts`, `src/main/settings.ts` | `LlmProvider` + `'chatgpt'`, `AuthProvider`, `AccountStatus`, `chatgptWelcomeSeen` |
| `src/renderer/src/components/ChatGptAccount.tsx` (baru) | Tombol login, status akun, modal sambutan |
| `src/renderer/src/pages/Settings.tsx`, `Home.tsx`, `components/ProviderLogo.tsx` | Integrasi UI dan kesiapan beranda |

---

### Task 0: Branch, runner unit test, dan commit desain

**Files:**
- Create: `scripts/test.mjs`, `src/main/oauth/pkce.test.ts` (sementara, hanya untuk membuktikan runner; diisi penuh di Task 1)
- Modify: `package.json` (script `"test": "node scripts/test.mjs"`)

**Interfaces:**
- Produces: `npm test` yang menjalankan setiap `src/**/*.test.ts` memakai `node:test`/`node:assert/strict`. File tes hanya boleh mengimpor modul tanpa `electron`/`better-sqlite3`.

- [ ] **Step 1:** `git switch -c feat/login-akun` dari `main`.
- [ ] **Step 2:** Tulis `src/main/oauth/pkce.test.ts` berisi satu tes `runner works` yang `assert.equal(1 + 1, 2)`.
- [ ] **Step 3:** Tulis `scripts/test.mjs`: `fs.globSync('src/**/*.test.ts')`; `esbuild.build({ entryPoints, bundle: true, platform: 'node', format: 'esm', outdir: 'node_modules/.cache/vs-tests', outExtension: { '.js': '.mjs' }, tsconfig: 'tsconfig.node.json', external: ['electron', 'better-sqlite3'], logLevel: 'warning' })`; lalu `spawnSync(process.execPath, ['--test', ...outFiles], { stdio: 'inherit' })` dan keluar dengan status yang sama. Tidak ada file tes berarti keluar 0 dengan pesan.
- [ ] **Step 4:** Jalankan `npm test`. Expected: `# pass 1`, `# fail 0`.
- [ ] **Step 5:** Jalankan `npm run typecheck`. Expected: bersih.
- [ ] **Step 6: Commit** spec, plan, runner:

```bash
git add scripts/test.mjs package.json src/main/oauth/pkce.test.ts docs/superpowers
git commit -m "chore: tambah runner unit test dan desain login akun"
```

### Task 1: PKCE dan token acak

**Files:**
- Create: `src/main/oauth/pkce.ts`
- Test: `src/main/oauth/pkce.test.ts` (ganti tes sementara)

**Interfaces:**
- Produces: `randomToken(bytes = 32): string` (base64url tanpa padding); `challengeFor(verifier: string): string`; `createPkce(): { verifier: string; challenge: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
test('challengeFor matches RFC 7636 appendix B', () => {
  assert.equal(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
})
test('createPkce verifier is 43+ base64url chars and challenge derives from it', () => {
  const p = createPkce()
  assert.match(p.verifier, /^[A-Za-z0-9_-]{43,128}$/)
  assert.equal(p.challenge, challengeFor(p.verifier))
})
test('randomToken has no padding and differs per call', () => {
  assert.doesNotMatch(randomToken(), /=/)
  assert.notEqual(randomToken(), randomToken())
})
```

- [ ] **Step 2:** `npm test`. Expected: FAIL (`challengeFor` tidak terdefinisi).
- [ ] **Step 3:** Implementasi di `src/main/oauth/pkce.ts` dengan `node:crypto` (`randomBytes`, `createHash('sha256')`, `toString('base64url')`).
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(oauth): PKCE dan token acak`.

### Task 2: Server callback loopback

**Files:**
- Create: `src/main/oauth/loopback.ts`
- Test: `src/main/oauth/loopback.test.ts`

**Interfaces:**
- Produces: `startLoopback(opts?: { timeoutMs?: number }): Promise<Loopback>`, dengan
  `interface Loopback { redirectUri: string; result: Promise<URLSearchParams>; close(): void }`.
  `result` resolve dengan query callback pertama ke `/auth/callback` (termasuk yang membawa `error`), reject `new LoginCancelled('timeout')` setelah `timeoutMs` (bawaan 300000), reject `new LoginCancelled('closed')` kalau `close()` dipanggil sebelum callback. Ekspor juga `class LoginCancelled extends Error { constructor(readonly reason: 'timeout' | 'closed') }`.
  Halaman balasan HTML berbahasa Indonesia: dengan `code` → "Login berhasil. Kamu boleh menutup tab ini dan kembali ke Video Story."; dengan `error` → "Login gagal atau dibatalkan. Kembali ke Video Story untuk mencoba lagi." Path lain → 404. Server berhenti setelah callback pertama.

- [ ] **Step 1: Write the failing tests**

```ts
test('redirectUri uses 127.0.0.1 and /auth/callback', async () => {
  const lb = await startLoopback()
  assert.match(lb.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/)
  lb.close(); await assert.rejects(lb.result, LoginCancelled)
})
test('callback resolves params and shows success page', async () => {
  const lb = await startLoopback()
  const res = await fetch(`${lb.redirectUri}?code=abc&state=xyz`)
  assert.match(await res.text(), /Login berhasil/)
  const q = await lb.result
  assert.equal(q.get('code'), 'abc'); assert.equal(q.get('state'), 'xyz')
})
test('error callback shows failure page and still resolves', async () => {
  const lb = await startLoopback()
  const res = await fetch(`${lb.redirectUri}?error=access_denied&state=s`)
  assert.match(await res.text(), /Login gagal/)
  assert.equal((await lb.result).get('error'), 'access_denied')
})
test('loopback times out', async () => {
  const lb = await startLoopback({ timeoutMs: 50 })
  await assert.rejects(lb.result, (e) => e instanceof LoginCancelled && e.reason === 'timeout')
})
test('other paths return 404', async () => {
  const lb = await startLoopback()
  assert.equal((await fetch(lb.redirectUri.replace('/auth/callback', '/x'))).status, 404)
  lb.close(); await lb.result.catch(() => {})
})
```

- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implementasi dengan `node:http` `createServer`, `listen(0, '127.0.0.1')`; HTML dengan `Content-Type: text/html; charset=utf-8`.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(oauth): server callback loopback`.

### Task 3: Token set, refresh, dan verifikasi ID token

**Files:**
- Create: `src/main/oauth/tokens.ts`, `src/main/oauth/jwt.ts`
- Test: `src/main/oauth/tokens.test.ts`, `src/main/oauth/jwt.test.ts`

**Interfaces:**
- Produces (`tokens.ts`):
  - `interface TokenSet { accessToken: string; refreshToken: string | null; idToken: string | null; expiresAt: number; scope: string[] }`
  - `toTokenSet(json: { access_token: string; refresh_token?: string; id_token?: string; expires_in?: number; scope?: string }, now: number, previous?: TokenSet): TokenSet`: `expiresAt = now + expires_in*1000` (bawaan 3600 detik); scope dipisah spasi; refresh/id token lama dipakai kalau balasan tidak membawa yang baru.
  - `needsRefresh(t: TokenSet, now: number): boolean`: true kalau sisa < 5 menit.
  - `classifyRefreshError(status: number, body: string): 'terminal' | 'retry'`: `'terminal'` kalau body memuat `invalid_grant|invalid_refresh_token|token_expired|refresh_token_expired|refresh_token_invalidated|refresh_token_reused`; `'retry'` untuk status 0 (jaringan), 408, 429, ≥500, dan yang lain.
  - `planUsageGranted(scope: string[]): boolean`: memuat `chatgpt.tokens.use.direct`.
  - `singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T>`: pemanggil bersamaan dengan key sama berbagi satu promise; setelah selesai (berhasil/gagal) key dilepas.
- Produces (`jwt.ts`):
  - `decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> }`
  - `verifyIdToken(token: string, opts: { jwks: { keys: JsonWebKey[] }; issuer: string; audience: string; nonce: string; now: number }): Record<string, unknown>`: cek RS256 dengan `kid` yang cocok (`crypto.createPublicKey({ key: jwk, format: 'jwk' })`, `crypto.verify('RSA-SHA256', …)`), `iss`, `aud` (string atau array memuat audience), `nonce`, `exp` (> now/1000 dengan toleransi 60 detik). Gagal → `throw new Error('ID token tidak valid: <alasan>')`.

- [ ] **Step 1: Write the failing tests** (`tokens.test.ts`)

```ts
test('toTokenSet computes expiry and splits scope', () => {
  const t = toTokenSet({ access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'openid chatgpt.tokens.use.direct' }, 1000)
  assert.equal(t.expiresAt, 1000 + 3_600_000); assert.deepEqual(t.scope, ['openid', 'chatgpt.tokens.use.direct'])
})
test('toTokenSet keeps previous refresh token when rotation omits it', () => {
  const prev = toTokenSet({ access_token: 'a', refresh_token: 'r1', id_token: 'i1' }, 0)
  const next = toTokenSet({ access_token: 'b' }, 10, prev)
  assert.equal(next.refreshToken, 'r1'); assert.equal(next.idToken, 'i1')
})
test('needsRefresh within five minutes of expiry', () => {
  const t = toTokenSet({ access_token: 'a', expires_in: 3600 }, 0)
  assert.equal(needsRefresh(t, 3_600_000 - 6 * 60_000), false)
  assert.equal(needsRefresh(t, 3_600_000 - 4 * 60_000), true)
})
test('classifyRefreshError', () => {
  assert.equal(classifyRefreshError(400, '{"error":"invalid_grant"}'), 'terminal')
  assert.equal(classifyRefreshError(401, '{"error":"refresh_token_reused"}'), 'terminal')
  assert.equal(classifyRefreshError(0, ''), 'retry')
  assert.equal(classifyRefreshError(503, 'upstream'), 'retry')
})
test('planUsageGranted', () => {
  assert.equal(planUsageGranted(['openid', 'chatgpt.tokens.use.direct']), true)
  assert.equal(planUsageGranted(['openid', 'email']), false)
})
test('singleFlight runs once for concurrent callers', async () => {
  let calls = 0
  const fn = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return calls }
  const [a, b] = await Promise.all([singleFlight('k', fn), singleFlight('k', fn)])
  assert.equal(calls, 1); assert.equal(a, b)
  await singleFlight('k', fn); assert.equal(calls, 2)
})
```

`jwt.test.ts`: buat pasangan kunci dengan `generateKeyPairSync('rsa', { modulusLength: 2048 })`, ekspor publik sebagai JWK dengan `kid: 'k1'`, tandatangani header `{alg:'RS256',kid:'k1'}` + payload `{ iss: 'https://auth.openai.com', aud: 'oaiapp_x', nonce: 'n', exp: 2_000_000_000, sub: 'u1', email: 'a@b.c' }`.

```ts
test('verifyIdToken accepts a valid token', () => { assert.equal(verifyIdToken(tok, opts).sub, 'u1') })
test('verifyIdToken rejects wrong nonce', () => { assert.throws(() => verifyIdToken(tok, { ...opts, nonce: 'x' }), /nonce/) })
test('verifyIdToken rejects wrong audience', () => { assert.throws(() => verifyIdToken(tok, { ...opts, audience: 'other' }), /aud/) })
test('verifyIdToken rejects tampered payload', () => { assert.throws(() => verifyIdToken(tampered, opts), /signature/) })
test('verifyIdToken rejects expired token', () => { assert.throws(() => verifyIdToken(tok, { ...opts, now: 2_100_000_000_000 }), /exp/) })
```

- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implementasi `tokens.ts` dan `jwt.ts` sesuai Interfaces.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(oauth): token set, single-flight, verifikasi ID token`.

### Task 4: Parser SSE dan format Responses API

**Files:**
- Create: `src/main/services/sse.ts`, `src/main/services/chatgpt-format.ts`
- Test: `src/main/services/sse.test.ts`, `src/main/services/chatgpt-format.test.ts`

**Interfaces:**
- Produces (`sse.ts`): `parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string | null; data: string }>`: mendukung event terpotong di batas chunk, baris `data:` berganda (digabung dengan `\n`), komentar `:` diabaikan, CRLF.
- Produces (`chatgpt-format.ts`):
  - `type ResponsesMode = 'json_schema' | 'plain'`
  - `buildResponsesBody(a: { model: string; system: string; prompt: string; schema: object; name: string; mode: ResponsesMode }): Record<string, unknown>`: selalu `{ model, store: false, stream: true, instructions, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }] }`. Mode `json_schema` menambah `text: { format: { type: 'json_schema', name, schema, strict: true } }`. Mode `plain` menambah ke `instructions` kalimat yang sama dengan `chatJson` di `llm.ts`: `"\n\nReply with ONE JSON object only (no markdown, no commentary) that matches this JSON Schema:\n" + JSON.stringify(schema)`.
  - `readResponsesStream(events: AsyncIterable<{ event: string | null; data: string }>): Promise<string>`: mengumpulkan `response.output_text.delta`; selesai hanya pada `response.completed` (pakai teks `output_text` lengkap dari payload kalau ada); `response.failed`/`error` → `ChatGptError` dari kode error-nya; `response.incomplete` → `ChatGptError` dengan `code = 'incomplete'`; stream habis tanpa `completed` → `ChatGptError` `code = 'interrupted'`.
  - `class ChatGptError extends Error { status: number; code: string; param: string | null }`
  - `chatGptErrorFromHttp(status: number, body: string): ChatGptError`: membaca `error.code`/`error.param` kalau ada.
  - `chatGptMessage(code: string, status: number, param?: string | null): string`: teks Indonesia:
    - `subscription_sharing_usage_limit_exceeded` (429) → `Batas pemakaian paket ChatGPT sudah tercapai. Cek pemakaianmu di chatgpt.com/settings/usage, atau pilih penyusun cerita lain di Pengaturan.`
    - `subscription_sharing_user_not_eligible` → `Pemakaian paket ChatGPT tidak tersedia untuk akun atau workspace ini.`
    - `subscription_sharing_invalid_user` atau status 401 → `Sesi ChatGPT tidak berlaku lagi. Login ulang di Pengaturan › Layanan AI dan kunci.`
    - `subscription_sharing_usage_unavailable`, `subscription_sharing_user_unavailable`, atau status 503 → `Layanan paket ChatGPT sedang tidak tersedia. Coba lagi sebentar lagi.`
    - `subscription_sharing_unsupported_capability` → `Permintaan memakai fitur yang tidak didukung paket ChatGPT${param ? ` (${param})` : ''}.`
    - `incomplete` → `Jawaban ChatGPT terpotong sebelum selesai. Coba durasi video lebih pendek atau model lain.`
    - `interrupted` → `Koneksi ke ChatGPT terputus sebelum jawaban selesai. Coba lagi.`
    - lainnya → `ChatGPT menolak permintaan (${status}${code ? `, ${code}` : ''}).`
  - `isRetryable(e: ChatGptError): boolean`: true untuk status 503 dan kode `*_unavailable`.
  - `isFormatRejected(e: ChatGptError): boolean`: true untuk `subscription_sharing_unsupported_capability` atau status 400 dengan param/kode yang menyebut `text`/`format`/`schema`.

- [ ] **Step 1: Write the failing tests**

```ts
// sse.test.ts — stream dari potongan chunk
test('parseSse handles split chunks, multi-line data and comments', async () => {
  const out = await collect(parseSse(streamOf(['event: a\nda', 'ta: 1\ndata: 2\n\n: ping\n\nevent: b\r\ndata: x\r\n\r\n'])))
  assert.deepEqual(out, [{ event: 'a', data: '1\n2' }, { event: 'b', data: 'x' }])
})
// chatgpt-format.test.ts
test('body always disables storage and streams', () => {
  const b = buildResponsesBody({ model: 'm', system: 'S', prompt: 'P', schema: {}, name: 'n', mode: 'plain' })
  assert.equal(b.store, false); assert.equal(b.stream, true)
  assert.ok(!('temperature' in b) && !('max_output_tokens' in b))
  assert.match(String(b.instructions), /^S\n\nReply with ONE JSON object only/)
})
test('json_schema mode sets strict text.format', () => {
  const b = buildResponsesBody({ model: 'm', system: 'S', prompt: 'P', schema: { type: 'object' }, name: 'story', mode: 'json_schema' })
  assert.deepEqual(b.text, { format: { type: 'json_schema', name: 'story', schema: { type: 'object' }, strict: true } })
  assert.equal(b.instructions, 'S')
})
test('readResponsesStream joins deltas on completed', async () => {
  assert.equal(await readResponsesStream(events([['response.output_text.delta', '{"delta":"{\\"a\\""}'], ['response.output_text.delta', '{"delta":":1}"}'], ['response.completed', '{}']])), '{"a":1}')
})
test('readResponsesStream reports usage limit from response.failed', async () => {
  await assert.rejects(readResponsesStream(events([['response.failed', '{"response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}']])), (e) => e instanceof ChatGptError && /Batas pemakaian paket ChatGPT/.test(e.message))
})
test('readResponsesStream reports interrupted stream', async () => {
  await assert.rejects(readResponsesStream(events([['response.output_text.delta', '{"delta":"{"}']])), (e) => e instanceof ChatGptError && e.code === 'interrupted')
})
test('readResponsesStream reports incomplete', async () => {
  await assert.rejects(readResponsesStream(events([['response.incomplete', '{}']])), (e) => e instanceof ChatGptError && e.code === 'incomplete')
})
test('format rejection detection', () => {
  assert.equal(isFormatRejected(chatGptErrorFromHttp(400, '{"error":{"code":"subscription_sharing_unsupported_capability","param":"text.format"}}')), true)
  assert.equal(isFormatRejected(chatGptErrorFromHttp(429, '{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}')), false)
})
```

- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implementasi sesuai Interfaces (`TextDecoder` dengan `stream: true` untuk SSE).
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chatgpt): parser SSE dan format Responses API`.

### Task 5: Penyimpanan akun dan alur login ChatGPT

**Files:**
- Create: `src/main/oauth/store.ts`, `src/main/oauth/chatgpt.ts`
- Modify: `src/main/db/index.ts` (migrasi baru di akhir), `src/shared/types.ts`, `src/shared/api.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/events.ts`

**Interfaces:**
- Consumes: Task 1–3.
- Produces:
  - Migrasi: `CREATE TABLE oauth_accounts (provider TEXT PRIMARY KEY, client_id TEXT, tokens BLOB, label TEXT, needs_reauth INTEGER NOT NULL DEFAULT 0, plan_usage INTEGER, updated_at INTEGER NOT NULL);`
  - `src/shared/types.ts`: `export type AuthProvider = 'chatgpt'` (Fase 3/4 menambah `'higgsfield' | 'elevenlabs'`); `export interface AccountStatus { provider: AuthProvider; signedIn: boolean; label: string | null; needsReauth: boolean; planUsageAllowed: boolean | null }`.
  - `store.ts`: `hostId(): string` (buat `urn:uuid:${randomUUID()}` sekali, simpan di tabel `settings` dengan key `oauthHostId` lewat query langsung, karena `getSettings` mengabaikan key di luar `AppSettings`); `readAccount(p): { clientId: string | null; tokens: TokenSet | null; label: string | null; needsReauth: boolean; planUsage: boolean | null } | null`; `saveTokens(p, a: { clientId: string; tokens: TokenSet; label: string | null; planUsage: boolean | null }): void`; `markNeedsReauth(p): void`; `clearTokens(p): void` (client_id tetap disimpan); `accountStatus(p): AccountStatus`. Token dienkripsi sebagai JSON dengan `safeStorage` seperti `secrets.ts`.
  - `chatgpt.ts`: `loginChatGpt(): Promise<AccountStatus>`; `logoutChatGpt(): Promise<{ revoked: boolean }>`; `chatgptAccessToken(): Promise<string>` (refresh lewat `singleFlight('chatgpt', …)` kalau `needsRefresh`; error `'terminal'` → `markNeedsReauth` lalu throw `Sesi ChatGPT tidak berlaku lagi. Login ulang di Pengaturan › Layanan AI dan kunci.`; `'retry'` → throw tanpa menghapus token); `cancelChatGptLogin(): void`.
  - Alur `loginChatGpt`: ambil discovery (cache di memori), `startLoopback()` (login yang masih menunggu dibatalkan dulu), buka browser lewat `shell.openExternal` ke URL authorize dengan parameter di Global Constraints (`client_id` = client tersimpan atau `dynamic_agent_client`; `agent_name_hint` dan `login_hint` sesuai aturan; `id_token_hint` tidak dipakai). Validasi `state`. `error=access_denied` → throw `Login ChatGPT dibatalkan.`. Ambil `client_id` dari callback kalau ada (registrasi baru). Tukar kode (form-encoded: `grant_type=authorization_code`, `client_id`, `code`, `code_verifier`, `redirect_uri`, `resource`). Verifikasi ID token (`verifyIdToken` dengan JWKS dari discovery, `issuer` dari discovery, `audience` = client ID). Label = `email` atau `sub`. `planUsage = planUsageGranted(scope)`. Simpan, `emit.auth(status)`, lalu kembalikan status.
  - Alur `logoutChatGpt`: `POST` ke `revocation_endpoint` dari discovery (form-encoded: `token=<refresh_token>`, `token_type_hint=refresh_token`, `client_id`). Status 200 → `revoked: true`. Error jaringan atau 5xx dicoba ulang sekali, lalu `revoked: false`. Token lokal **selalu** dihapus (`clearTokens`), client ID dan host ID tetap disimpan, lalu `emit.auth(status)`.
  - IPC: `auth:status` → `AccountStatus[]`; `auth:login` (`provider: AuthProvider`) → `AccountStatus`; `auth:logout` (`provider`) → `{ revoked: boolean }`; `auth:cancel` → `void`. `src/shared/api.ts`: `auth: { status(); login(p); logout(p); cancel() }` dan `on.auth(cb: (s: AccountStatus) => void)`; `EVENTS.auth = 'event:auth'`; `emit.auth` di `events.ts`.

- [ ] **Step 1:** Tambah migrasi, tipe, `store.ts`, `chatgpt.ts`, IPC (tiga tempat), dan event sesuai Interfaces.
- [ ] **Step 2:** `npm run typecheck` dan `npm test`. Expected: bersih / PASS.
- [ ] **Step 3: Verifikasi dev harness** (folder data sementara, lihat `docs/pengembangan.md`): langkah `js` memanggil `await window.api.auth.status()` lalu `console.log('AUTH ' + JSON.stringify(s))`. Expected di log: `AUTH [{"provider":"chatgpt","signedIn":false,"label":null,"needsReauth":false,"planUsageAllowed":null}]`. Langkah kedua memanggil `window.api.auth.login('chatgpt')`, tunggu 500 ms, lalu `window.api.auth.cancel()`. Expected: promise login reject dengan pesan berisi `dibatalkan` dan aplikasi tidak macet (browser sungguhan boleh terbuka; tutup saja).
- [ ] **Step 4: Commit** `feat(oauth): akun ChatGPT, login, refresh, logout`.

### Task 6: ChatGPT sebagai penyusun cerita

**Files:**
- Create: `src/main/services/chatgpt.ts`
- Modify: `src/main/services/llm.ts`, `src/shared/types.ts`, `src/shared/models.ts`, `src/main/settings.ts`

**Interfaces:**
- Consumes: `chatgptAccessToken()` (Task 5), `parseSse`, `buildResponsesBody`, `readResponsesStream`, `ChatGptError`, `isRetryable`, `isFormatRejected` (Task 4), `readAccount('chatgpt')` (Task 5).
- Produces:
  - `LlmProvider = 'gemini' | 'openrouter' | 'groq' | 'custom' | 'chatgpt'`; `DEFAULT_SETTINGS.llmModels.chatgpt = ''`; `AppSettings.chatgptWelcomeSeen: boolean` (bawaan `false`).
  - `src/shared/models.ts` `LLM_PROVIDERS` ditambah `{ id: 'chatgpt', name: 'ChatGPT (langganan)', note: 'Login dengan akun ChatGPT, memakai kuota paketmu', link: 'https://chatgpt.com/settings/usage', linkLabel: 'Kelola pemakaian' }`.
  - `services/chatgpt.ts`: `listModels(): Promise<ModelOption[]>` (`GET /v1/models` dengan Bearer, ambil `models` berisi `visibility === 'list'`, `id = slug`, `name = display_name ?? slug`, `tags: []`); `generateJson(model: string, system: string, prompt: string, schema: object, name: string, signal?: AbortSignal): Promise<unknown>`: tolak lebih dulu dengan `Akun ChatGPT belum mengizinkan pemakaian paket. Login ulang dan setujui izin pemakaian paket.` kalau `planUsage === false`. Mode `json_schema` dulu; kalau `isFormatRejected` atau JSON tidak valid, ulangi dengan `plain`. `isRetryable` dicoba ulang maksimal 2 kali dengan jeda 2 dan 4 detik. Timeout 4 menit, digabung dengan `signal` seperti `chatJson`. Hasil diurai dengan `extractJson`.
  - `llm.ts`: `type CompatProvider = Exclude<LlmProvider, 'gemini' | 'chatgpt'>`; `fetchModels` kasus `'chatgpt'` → `chatgpt.listModels()`; `generateJson` cabang `provider === 'chatgpt'`; `testLlm` menerima `Exclude<LlmProvider, 'chatgpt'>`.

- [ ] **Step 1:** Implementasi sesuai Interfaces.
- [ ] **Step 2:** `npm run typecheck`, `npm test`, `npm run build`. Expected: semua bersih.
- [ ] **Step 3: Commit** `feat(chatgpt): penyusun cerita memakai paket ChatGPT`.

### Task 7: Login dengan OpenRouter

**Files:**
- Create: `src/main/oauth/openrouter.ts`
- Test: `src/main/oauth/openrouter.test.ts`
- Modify: `src/main/ipc.ts`, `src/shared/api.ts`, `src/preload/index.ts`

**Interfaces:**
- Produces: `openRouterAuthUrl(a: { callbackUrl: string; challenge: string; state: string }): string` (murni, dites); `loginOpenRouter(): Promise<string>` (mengembalikan key; memakai `startLoopback`, `createPkce`, validasi `state`, `POST /api/v1/auth/keys`). IPC `settings:loginOpenRouter` → menyimpan key lewat `setSecret('openrouter', key)`, menjalankan tes yang sama dengan `settings:setKey`, mengembalikan `KeyTestResult`. `src/shared/api.ts`: `settings.loginOpenRouter(): Promise<KeyTestResult>`.

- [ ] **Step 1: Write the failing test**

```ts
test('openRouterAuthUrl carries callback, S256 challenge and state', () => {
  const u = new URL(openRouterAuthUrl({ callbackUrl: 'http://127.0.0.1:5000/auth/callback', challenge: 'ch', state: 'st' }))
  assert.equal(u.origin + u.pathname, 'https://openrouter.ai/auth')
  assert.equal(u.searchParams.get('callback_url'), 'http://127.0.0.1:5000/auth/callback')
  assert.equal(u.searchParams.get('code_challenge'), 'ch')
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(u.searchParams.get('state'), 'st')
})
```

- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implementasi sesuai Interfaces. Error tukar kode 403 → `Kode login OpenRouter tidak valid atau kedaluwarsa. Coba login lagi.`
- [ ] **Step 4:** `npm test` dan `npm run typecheck`. Expected: PASS / bersih.
- [ ] **Step 5: Commit** `feat(openrouter): login lewat browser`.

### Task 8: UI pengaturan, beranda, dan dokumentasi

**Files:**
- Create: `src/renderer/src/components/ChatGptAccount.tsx`
- Modify: `src/renderer/src/pages/Settings.tsx` (`LlmSection`, `KeyForm` untuk OpenRouter), `src/renderer/src/pages/Home.tsx` (`setupIssues`), `src/renderer/src/components/ProviderLogo.tsx` (id `'chatgpt'` memakai `assets/models/openai.svg`), `docs/layanan-ai.md`, `docs/arsitektur.md`, `docs/keputusan-teknis.md`, `README.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `window.api.auth.*`, `window.api.on.auth`, `window.api.settings.loginOpenRouter`, `LLM_PROVIDERS` entri `chatgpt`.
- Produces (perilaku UI):
  - Saat penyedia `chatgpt` dipilih, `KeyForm` diganti `ChatGptAccount`. Belum login: tombol berlogo dengan label persis `Continue with ChatGPT`, dan saat menunggu label menjadi `Menunggu login di browser…` dengan tombol `Batal` (memanggil `auth.cancel`). Sudah login: `✓ <label>` · `Memakai paket ChatGPT` · tautan `Kelola pemakaian` (`https://chatgpt.com/settings/usage` lewat `app.openExternal`) · tombol `Keluar`. Lalu `ModelPicker` seperti penyedia lain (sumber model `chatgpt`). `needsReauth` → pesan `Sesi ChatGPT berakhir. Login ulang untuk melanjutkan.` dengan tombol yang sama. `planUsageAllowed === false` → `Izin pemakaian paket belum diberikan. Login ulang dan setujui izinnya.`
  - Modal satu kali setelah login pertama berhasil kalau `chatgptWelcomeSeen` false: judul `Kamu memakai paket ChatGPT`, isi `Permintaan menyusun cerita memakai kuota paket ChatGPT-mu, terpisah dari biaya layanan lain. Atur batasnya di pengaturan ChatGPT.`, tombol `Mengerti` (menyimpan `chatgptWelcomeSeen: true`).
  - Keluar: kalau `revoked` false, toast `Kamu sudah keluar di aplikasi ini, tapi pencabutan akses di ChatGPT belum terkonfirmasi. Putuskan aplikasi dari pengaturan ChatGPT kalau perlu.`
  - OpenRouter `KeyForm`: tombol tambahan `Login dengan OpenRouter` di samping kolom kunci, dengan hasil yang sama seperti menyimpan kunci tempelan.
  - `Home.setupIssues`: untuk `llm === 'chatgpt'` siap kalau `signedIn && !needsReauth && planUsageAllowed !== false`; kalau belum, isu `{ what: 'login ChatGPT', blocks: 'cerita' }`; model kosong → isu model seperti penyedia lain. Status akun dibaca dari `auth.status()` dan diperbarui lewat `on.auth`.
  - Dokumentasi: bagian "Login akun" di `docs/layanan-ai.md` (alur, endpoint, error), tabel `oauth_accounts` dan modul `src/main/oauth/` di `docs/arsitektur.md`, keputusan "tidak meniru client CLI" dan "refresh serial" di `docs/keputusan-teknis.md`, kolom "Login akun" di tabel kunci `README.md`, entri `[Belum dirilis]` di `CHANGELOG.md`, `npm test` di bagian Perintah `AGENTS.md`.

- [ ] **Step 1:** Implementasi UI dan dokumentasi sesuai Interfaces.
- [ ] **Step 2:** `npm run typecheck`, `npm test`, `npm run build`. Expected: semua bersih.
- [ ] **Step 3: Verifikasi dev harness**: pilih penyedia `chatgpt` (`window.api.settings.set({ llmProvider: 'chatgpt' })`, reload), buka Pengaturan, screenshot, dan `console.log` keberadaan teks `Continue with ChatGPT`. Di Beranda, `console.log` banner yang memuat `login ChatGPT`. Expected: keduanya ada. Kembalikan ke `gemini` lalu cek bahwa banner tidak menyebut ChatGPT.
- [ ] **Step 4: Uji manual oleh pemilik**: login ChatGPT sungguhan, pilih model, buat proyek pendek sampai naskah jadi; login OpenRouter sungguhan sampai status `Terhubung`; lalu Keluar dari ChatGPT. Catat hasilnya di PR.
- [ ] **Step 5: Commit** `feat(ui): login ChatGPT dan OpenRouter di pengaturan`.

---

## Fase 2–4 (garis besar, rencana rinci dibuat setelah uji coba)

- **Fase 2: uji coba (kode dibuang).** Pemilik mengaktifkan GitHub Pages dan menerbitkan `oauth/elevenlabs-client.json` (CIMD) di URL permanen `https://fakhriariaf.github.io/Video_Story/oauth/elevenlabs-client.json`. Skrip uji di proses utama memakai modul OAuth Fase 1 untuk: (a) Higgsfield: registrasi dinamis `POST https://mcp.higgsfield.ai/oauth2/register`, login, lalu `initialize` dan `tools/list` di `https://mcp.higgsfield.ai/mcp`, mencatat skema tool pembuat gambar, video, unggah, estimasi, dan workspace; (b) ElevenLabs: login dengan `client_id` = URL CIMD, lalu mencoba token sebagai `Authorization: Bearer` ke `/v1/user/subscription`, `/v1/voices`, dan `/v1/text-to-speech/{voice}/with-timestamps`. Hasilnya ditulis ke `docs/layanan-ai.md`.
- **Fase 3: Higgsfield Login akun**, hanya kalau MCP bisa membuat gambar dan video. Isinya `AuthProvider` + `'higgsfield'`, `AppSettings.authMode.higgsfield`, klien MCP `src/main/services/mcp.ts`, antarmuka `HiggsfieldBackend` dengan implementasi REST dan MCP di `generation.ts`, pemilih mode di `HiggsfieldSection`, dan kesiapan beranda.
- **Fase 4: ElevenLabs Login akun**, hanya kalau token diterima REST API. Isinya `AuthProvider` + `'elevenlabs'`, `AppSettings.authMode.elevenlabs`, header auth sesuai mode di `services/elevenlabs.ts` dengan refresh, pemilih mode di `TtsSection`, dan `ttsReadiness`. Kalau token ditolak: file CIMD dihapus dan temuan dicatat di `docs/keputusan-teknis.md`.
