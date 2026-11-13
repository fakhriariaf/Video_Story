import { createHash, randomBytes } from 'node:crypto'

/** Unguessable value for state, nonce and PKCE verifiers: base64url without padding. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** S256 code challenge (RFC 7636): base64url of the verifier's SHA-256, without padding. */
export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomToken(32)
  return { verifier, challenge: challengeFor(verifier) }
}
