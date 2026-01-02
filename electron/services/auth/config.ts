export const CHARACTER_SCOPES = [
  'publicData',
  'esi-assets.read_assets.v1',
  'esi-characters.read_blueprints.v1',
  'esi-characters.read_corporation_roles.v1',
  'esi-characters.read_loyalty.v1',
  'esi-markets.read_character_orders.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-clones.read_clones.v1',
  'esi-clones.read_implants.v1',
  'esi-universe.read_structures.v1',
  'esi-wallet.read_character_wallet.v1',
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
  'esi-search.search_structures.v1',
]

export const CORPORATION_SCOPES = [
  ...CHARACTER_SCOPES,
  'esi-assets.read_corporation_assets.v1',
  'esi-corporations.read_blueprints.v1',
  'esi-corporations.read_divisions.v1',
  'esi-corporations.read_starbases.v1',
  'esi-corporations.read_structures.v1',
  'esi-contracts.read_corporation_contracts.v1',
  'esi-industry.read_corporation_jobs.v1',
  'esi-markets.read_corporation_orders.v1',
  'esi-wallet.read_corporation_wallets.v1',
]

export const EVE_SSO = {
  authUrl: 'https://login.eveonline.com/v2/oauth/authorize',
  tokenUrl: 'https://login.eveonline.com/v2/oauth/token',
  revokeUrl: 'https://login.eveonline.com/v2/oauth/revoke',
  jwksUrl: 'https://login.eveonline.com/oauth/jwks',
  issuer: 'https://login.eveonline.com',
  get clientId() {
    return process.env.EVE_CLIENT_ID || ''
  },
}

export const CALLBACK_PORT = 52742
export const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`
export const AUTH_TIMEOUT_MS = 5 * 60 * 1000
