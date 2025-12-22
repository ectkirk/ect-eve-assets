import type { Owner } from '@/store/auth-store'

export function createMockOwner(
  overrides: Partial<Owner> & {
    id: number
    name: string
    type: 'character' | 'corporation'
  }
): Owner {
  return {
    id: overrides.id,
    characterId: overrides.characterId ?? overrides.id,
    corporationId: overrides.corporationId ?? 98000001,
    name: overrides.name,
    type: overrides.type,
    accessToken: overrides.accessToken ?? 'mock-token',
    refreshToken: overrides.refreshToken ?? 'mock-refresh',
    expiresAt: overrides.expiresAt ?? Date.now() + 3600000,
    scopes: overrides.scopes ?? ['esi-contracts.read_character_contracts.v1'],
  }
}

export function createMockAuthState(owners: Record<string, Owner>) {
  return {
    owners,
    ownerHasScope: (ownerId: string, scope: string) => {
      const owner = owners[ownerId]
      return owner?.scopes?.includes(scope) ?? false
    },
  } as never
}
