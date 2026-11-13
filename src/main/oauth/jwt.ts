import { createPublicKey, verify, type JsonWebKey } from 'node:crypto'

type Claims = Record<string, unknown>

const CLOCK_SKEW_S = 60

function part(segment: string | undefined): Claims {
  if (!segment) throw new Error('ID token tidak valid: format')
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Claims
}

export function decodeJwt(token: string): { header: Claims; payload: Claims } {
  const [h, p] = token.split('.')
  return { header: part(h), payload: part(p) }
}

const invalid = (why: string): Error => new Error(`ID token tidak valid: ${why}`)

/** Checks an RS256 ID token against the provider's JWKS and the values this sign-in attempt expects. */
export function verifyIdToken(
  token: string,
  opts: { jwks: { keys: JsonWebKey[] }; issuer: string; audience: string; nonce: string; now: number }
): Claims {
  const segments = token.split('.')
  if (segments.length !== 3) throw invalid('format')
  const { header, payload } = decodeJwt(token)
  if (header.alg !== 'RS256') throw invalid(`alg ${String(header.alg)}`)
  const jwk = opts.jwks.keys.find((k) => k.kid === header.kid)
  if (!jwk) throw invalid('key tidak dikenal')
  const ok = verify(
    'RSA-SHA256',
    Buffer.from(`${segments[0]}.${segments[1]}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(segments[2], 'base64url')
  )
  if (!ok) throw invalid('signature')
  if (payload.iss !== opts.issuer) throw invalid('iss')
  const aud = payload.aud
  if (!(aud === opts.audience || (Array.isArray(aud) && aud.includes(opts.audience)))) throw invalid('aud')
  if (payload.nonce !== opts.nonce) throw invalid('nonce')
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S <= opts.now / 1000) throw invalid('exp')
  return payload
}
