import { useAuthStore, ownerKey, type Owner } from '@/store/auth-store'

const ENDPOINT_SCOPES: Record<string, string> = {
  '/characters/\\d+/assets': 'esi-assets.read_assets.v1',
  '/corporations/\\d+/assets': 'esi-assets.read_corporation_assets.v1',
  '/characters/\\d+/orders': 'esi-markets.read_character_orders.v1',
  '/corporations/\\d+/orders': 'esi-markets.read_corporation_orders.v1',
  '/characters/\\d+/contracts': 'esi-contracts.read_character_contracts.v1',
  '/corporations/\\d+/contracts': 'esi-contracts.read_corporation_contracts.v1',
  '/characters/\\d+/industry/jobs': 'esi-industry.read_character_jobs.v1',
  '/corporations/\\d+/industry/jobs': 'esi-industry.read_corporation_jobs.v1',
  '/characters/\\d+/clones': 'esi-clones.read_clones.v1',
  '/characters/\\d+/implants': 'esi-clones.read_implants.v1',
  '/characters/\\d+/wallet/journal': 'esi-wallet.read_character_wallet.v1',
  '/corporations/\\d+/wallets': 'esi-wallet.read_corporation_wallets.v1',
  '/characters/\\d+/blueprints': 'esi-characters.read_blueprints.v1',
  '/corporations/\\d+/blueprints': 'esi-corporations.read_blueprints.v1',
  '/characters/\\d+/location': 'esi-location.read_location.v1',
  '/characters/\\d+/ship': 'esi-location.read_ship_type.v1',
  '/corporations/\\d+/starbases': 'esi-corporations.read_starbases.v1',
  '/corporations/\\d+/structures': 'esi-corporations.read_structures.v1',
  '/universe/structures/\\d+': 'esi-universe.read_structures.v1',
}

const scopePatterns = Object.entries(ENDPOINT_SCOPES).map(
  ([pattern, scope]) => ({
    regex: new RegExp(`^${pattern}/?$`),
    scope,
  })
)

export function getScopeForEndpoint(endpoint: string): string | null {
  for (const { regex, scope } of scopePatterns) {
    if (regex.test(endpoint)) {
      return scope
    }
  }
  return null
}

export function hasRequiredScope(owner: Owner, endpoint: string): boolean {
  const requiredScope = getScopeForEndpoint(endpoint)
  if (!requiredScope) return true

  const key = ownerKey(owner.type, owner.id)
  return useAuthStore.getState().ownerHasScope(key, requiredScope)
}

export function validateOwnerScope(owner: Owner, endpoint: string): void {
  const requiredScope = getScopeForEndpoint(endpoint)
  if (!requiredScope) return

  const key = ownerKey(owner.type, owner.id)
  if (!useAuthStore.getState().ownerHasScope(key, requiredScope)) {
    throw new Error(
      `Owner ${owner.name} lacks required scope: ${requiredScope}`
    )
  }
}
