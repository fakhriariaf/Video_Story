import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

const CALLBACK_PATH = '/auth/callback'
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

/** The user never finished signing in (tab closed, timed out), or the app cancelled the attempt. */
export class LoginCancelled extends Error {
  constructor(readonly reason: 'timeout' | 'closed') {
    super(reason === 'timeout' ? 'Login dibatalkan atau kedaluwarsa.' : 'Login dibatalkan.')
  }
}

export interface Loopback {
  redirectUri: string
  /** Query of the first callback, including one that carries `error`. */
  result: Promise<URLSearchParams>
  close(): void
}

function page(ok: boolean): string {
  const text = ok
    ? 'Login berhasil. Kamu boleh menutup tab ini dan kembali ke Video Story.'
    : 'Login gagal atau dibatalkan. Kembali ke Video Story untuk mencoba lagi.'
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Video Story</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#faf7f2;color:#1f1d1a"><p style="font-size:18px">${text}</p></body></html>`
}

/**
 * One-shot OAuth redirect receiver on 127.0.0.1 (OpenAI rejects "localhost"). The port is picked by the OS so
 * nothing else on the machine is in the way; providers accept any loopback port.
 */
export async function startLoopback(opts: { timeoutMs?: number } = {}): Promise<Loopback> {
  let settle: { resolve: (q: URLSearchParams) => void; reject: (e: Error) => void } | null = null
  const result = new Promise<URLSearchParams>((resolve, reject) => (settle = { resolve, reject }))
  // Callers may close before awaiting; keep an early rejection from becoming an unhandled one.
  result.catch(() => {})

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== CALLBACK_PATH || !settle) {
      res.writeHead(404).end()
      return
    }
    const query = url.searchParams
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' }).end(page(query.has('code') && !query.has('error')))
    finish(() => settle?.resolve(query))
  })

  const timer = setTimeout(() => finish(() => settle?.reject(new LoginCancelled('timeout'))), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  function finish(done: () => void): void {
    if (!settle) return
    clearTimeout(timer)
    done()
    settle = null
    server.close()
    server.closeAllConnections()
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo

  return {
    redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
    result,
    close: () => finish(() => settle?.reject(new LoginCancelled('closed')))
  }
}
