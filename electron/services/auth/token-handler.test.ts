import { describe, it, expect } from 'vitest'
import { extractCharacterId, extractScopes } from './token-handler'

describe('Token Handler', () => {
  describe('extractCharacterId', () => {
    it('extracts character ID from valid sub claim', () => {
      const sub = 'CHARACTER:EVE:12345678'
      expect(extractCharacterId(sub)).toBe(12345678)
    })

    it('throws on invalid sub format', () => {
      expect(() => extractCharacterId('INVALID')).toThrow(
        'Invalid sub claim format'
      )
    })

    it('throws on sub with only two parts', () => {
      expect(() => extractCharacterId('CHARACTER:EVE')).toThrow(
        'Invalid sub claim format'
      )
    })

    it('handles large character IDs', () => {
      const sub = 'CHARACTER:EVE:2119389056'
      expect(extractCharacterId(sub)).toBe(2119389056)
    })
  })

  describe('extractScopes', () => {
    it('returns array as-is', () => {
      const scopes = ['esi-assets.read_assets.v1', 'esi-wallet.read_wallet.v1']
      expect(extractScopes(scopes)).toEqual(scopes)
    })

    it('splits space-separated string into array', () => {
      const scopes = 'esi-assets.read_assets.v1 esi-wallet.read_wallet.v1'
      expect(extractScopes(scopes)).toEqual([
        'esi-assets.read_assets.v1',
        'esi-wallet.read_wallet.v1',
      ])
    })

    it('handles single scope string', () => {
      const scopes = 'esi-assets.read_assets.v1'
      expect(extractScopes(scopes)).toEqual(['esi-assets.read_assets.v1'])
    })

    it('handles empty string', () => {
      expect(extractScopes('')).toEqual([''])
    })

    it('handles empty array', () => {
      expect(extractScopes([])).toEqual([])
    })
  })
})
