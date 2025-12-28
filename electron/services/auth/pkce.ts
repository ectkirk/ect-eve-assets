import { randomBytes, createHash } from 'node:crypto'

export function generateCodeVerifier(): string {
  const chars =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~'
  const charsLength = chars.length
  const maxValid = 256 - (256 % charsLength)
  let result = ''
  while (result.length < 128) {
    const bytes = randomBytes(256)
    for (let i = 0; i < bytes.length && result.length < 128; i++) {
      if (bytes[i]! < maxValid) {
        result += chars[bytes[i]! % charsLength]
      }
    }
  }
  return result
}

export function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier, 'ascii').digest()
  return hash.toString('base64url')
}
