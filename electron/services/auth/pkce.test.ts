import { describe, it, expect } from 'vitest'
import { generateCodeVerifier, generateCodeChallenge } from './pkce'

describe('PKCE', () => {
  describe('generateCodeVerifier', () => {
    it('generates a 128-character string', () => {
      const verifier = generateCodeVerifier()
      expect(verifier.length).toBe(128)
    })

    it('uses only valid PKCE characters', () => {
      const validChars =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~'
      const verifier = generateCodeVerifier()

      for (const char of verifier) {
        expect(validChars).toContain(char)
      }
    })

    it('generates different values on each call', () => {
      const verifier1 = generateCodeVerifier()
      const verifier2 = generateCodeVerifier()
      expect(verifier1).not.toBe(verifier2)
    })
  })

  describe('generateCodeChallenge', () => {
    it('generates a base64url-encoded SHA256 hash', () => {
      const verifier = 'test-verifier-string'
      const challenge = generateCodeChallenge(verifier)

      expect(challenge).not.toContain('+')
      expect(challenge).not.toContain('/')
      expect(challenge).not.toContain('=')
    })

    it('produces consistent output for same input', () => {
      const verifier = 'consistent-test-verifier'
      const challenge1 = generateCodeChallenge(verifier)
      const challenge2 = generateCodeChallenge(verifier)
      expect(challenge1).toBe(challenge2)
    })

    it('produces different output for different input', () => {
      const challenge1 = generateCodeChallenge('verifier-one')
      const challenge2 = generateCodeChallenge('verifier-two')
      expect(challenge1).not.toBe(challenge2)
    })

    it('produces RFC 7636 compliant challenge', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
      const challenge = generateCodeChallenge(verifier)
      expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    })
  })
})
