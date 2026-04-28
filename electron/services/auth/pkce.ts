import { randomBytes, createHash } from 'node:crypto'

export function generateCodeVerifier(): string {
  const chars =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~'
  const charsLength = chars.length
  const maxValid = 256 - (256 % charsLength)
  let result = ''
  while (result.length < 128) {
    const bytes = randomBytes(256)
    for (const byte of bytes.values()) {
      if (result.length >= 128) break
      if (byte < maxValid) {
        const char = chars.at(byte % charsLength)
        if (char) result += char
      }
    }
  }
  return result
}

export function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier, 'ascii').digest()
  return hash.toString('base64url')
}
