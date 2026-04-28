import { vi } from 'vitest'
import type { Owner } from '@/store/auth-store'
import type { EndpointExpiry } from '@/store/expiry-cache-store'
import { getRecordValue } from '@/lib/record-utils'

export function createMockOwner(
  overrides: Partial<Owner> & {
    id: number
    name: string
    type: 'character' | 'corporation'
  },
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
    authFailed: overrides.authFailed,
    scopesOutdated: overrides.scopesOutdated,
    corporationRoles: overrides.corporationRoles,
  }
}

export function createMockAuthState(owners: Record<string, Owner>) {
  return {
    owners,
    ownerHasScope: (ownerId: string, scope: string) => {
      const owner = getRecordValue(owners, ownerId)
      return owner?.scopes?.includes(scope) ?? false
    },
  } as never
}

export function createESIResponse<T>(
  data: T,
  overrides?: {
    expiresAt?: number
    etag?: string | null
    notModified?: boolean
  },
) {
  return {
    data,
    expiresAt: overrides?.expiresAt ?? Date.now() + 300_000,
    etag: overrides?.etag ?? null,
    notModified: overrides?.notModified ?? false,
  }
}

export function createMockExpiryCacheState(
  endpoints?: Map<string, EndpointExpiry>,
) {
  return {
    isExpired: vi.fn(
      (ownerKey: string, endpoint: string) =>
        !(endpoints ?? new Map()).has(`${ownerKey}:${endpoint}`),
    ),
    setExpiry: vi.fn(),
    clearForOwner: vi.fn(),
    clearByEndpoint: vi.fn(),
    registerRefreshCallback: vi.fn(() => vi.fn()),
    queueRefresh: vi.fn(),
    endpoints: endpoints ?? new Map(),
    initialized: true,
    init: vi.fn(),
  }
}
