import type { Owner } from '@/store/auth-store'

export function createMockOwner(overrides: Partial<Owner> & { id: number; name: string; type: 'character' | 'corporation' }): Owner {
  return {
    id: overrides.id,
    characterId: overrides.characterId ?? overrides.id,
    corporationId: overrides.corporationId ?? 98000001,
    name: overrides.name,
    type: overrides.type,
    accessToken: overrides.accessToken ?? 'mock-token',
    refreshToken: overrides.refreshToken ?? 'mock-refresh',
    expiresAt: overrides.expiresAt ?? Date.now() + 3600000,
  }
}

export function createMockAuthState(owners: Record<string, Owner>) {
  return { owners } as never
}
