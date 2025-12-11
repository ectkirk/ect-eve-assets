# Authentication System

EVE SSO OAuth2 authentication with PKCE for desktop applications.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Renderer Process                            │
│                                                                     │
│  ┌─────────────────────┐      ┌─────────────────┐                  │
│  │ OwnerManagementModal│─────▶│  auth-store.ts  │◀────┐            │
│  │  (Add/Remove chars) │      │    (Zustand)    │     │            │
│  └─────────────────────┘      └────────┬────────┘     │            │
│           │                            │              │            │
│           │                            │     ┌────────┴─────────┐  │
│           │ startAuth()    tokens      │     │   esi-client.ts  │  │
│           │                            │     │ (auto-refresh)   │  │
│           ▼                            │     └──────────────────┘  │
│  ┌─────────────────────────────────────┴────────────────────────┐  │
│  │              window.electronAPI (preload.ts)                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ IPC
┌───────────────────────────────▼─────────────────────────────────────┐
│                          Main Process                               │
│  ┌────────────────┐    ┌─────────────────────────────────────────┐ │
│  │    main.ts     │───▶│           auth.ts service                │ │
│  │  IPC handlers  │    │  - PKCE generation                       │ │
│  │                │    │  - OAuth window management               │ │
│  │ characterTokens│    │  - Token exchange & refresh              │ │
│  │   (Map for     │    │  - JWT verification (jose)               │ │
│  │   revocation)  │    └─────────────────────────────────────────┘ │
│  └────────────────┘                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  EVE SSO Endpoints    │
                    │  login.eveonline.com  │
                    └───────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `electron/services/auth.ts` | Core OAuth service - PKCE, tokens, JWT validation |
| `src/store/auth-store.ts` | Zustand store for auth state and persistence |
| `src/api/esi-client.ts` | Auto-refreshes tokens when making ESI requests |
| `src/components/layout/OwnerManagementModal.tsx` | UI for adding/removing owners |
| `electron/preload.ts` | IPC bridge exposing `window.electronAPI` |
| `electron/main.ts` | IPC handlers, `characterTokens` Map for revocation |

## Documentation

- [Auth Service](./auth-service.md) - OAuth implementation details
- [Auth Store](./auth-store.md) - State management and persistence

## Authentication Flows

### Adding a Character

```
User clicks "Add Character"
  │
  ▼
OwnerManagementModal.handleAddCharacter()
  │
  ├─▶ window.electronAPI.startAuth(false)
  │     └─▶ IPC: auth:start
  │           └─▶ auth.startAuth(includeCorporationScopes=false)
  │                 ├─▶ Generate state, PKCE verifier/challenge
  │                 ├─▶ Open BrowserWindow to EVE SSO
  │                 ├─▶ User logs in, authorizes scopes
  │                 ├─▶ Callback: exchange code for tokens
  │                 ├─▶ Verify JWT, extract characterId
  │                 ├─▶ Fetch corporationId from ESI
  │                 └─▶ Return AuthResult
  │
  ├─▶ authStore.addOwner({ type: 'character', ... })
  │
  └─▶ assetStore.updateForOwner() (fetch initial data)
```

### Adding a Corporation

```
User clicks "Add Corporation"
  │
  ▼
OwnerManagementModal.handleAddCorporation()
  │
  ├─▶ window.electronAPI.startAuth(true)  // corp scopes
  │     └─▶ ... same OAuth flow with CORPORATION_SCOPES ...
  │
  ├─▶ Check if character already exists
  │     ├─▶ If not: authStore.addOwner({ type: 'character', ... })
  │     └─▶ If yes: authStore.updateOwnerTokens() (refresh tokens)
  │
  ├─▶ Fetch corporation name from ESI
  │
  ├─▶ authStore.addOwner({ type: 'corporation', id: corpId, ... })
  │     └─▶ Note: characterId field = Director's character ID
  │
  └─▶ assetStore.updateForOwner() (fetch corp data)
```

### Token Auto-Refresh (ESI Client)

```
esiClient.fetch() or .fetchWithPagination()
  │
  ├─▶ getAccessToken(characterId)
  │     ├─▶ Find owner by characterId
  │     ├─▶ Check isOwnerTokenExpired() (60s buffer)
  │     │
  │     └─▶ If expired and refreshToken exists:
  │           ├─▶ window.electronAPI.refreshToken()
  │           │     └─▶ IPC: auth:refresh
  │           │           └─▶ auth.refreshAccessToken()
  │           │
  │           └─▶ authStore.updateOwnerTokens()
  │
  └─▶ Make ESI request with Bearer token
```

### Logout / Revocation

```
User clicks remove on owner (or "Logout All")
  │
  ▼
OwnerManagementModal.handleRemoveOwner()
  │
  ├─▶ window.electronAPI.logout(characterId)
  │     └─▶ IPC: auth:logout
  │           ├─▶ Get refreshToken from characterTokens Map
  │           ├─▶ auth.revokeToken() → POST to EVE revoke endpoint
  │           └─▶ Delete from characterTokens Map
  │
  ├─▶ authStore.removeOwner(ownerKey)
  │
  └─▶ assetStore.removeForOwner() (clear cached data)
```

## Quick Reference

### Scopes

**Character Scopes** (always included):
- `publicData` - Basic character info
- `esi-assets.read_assets.v1` - Character assets
- `esi-characters.read_blueprints.v1` - Blueprints
- `esi-markets.read_character_orders.v1` - Market orders
- `esi-industry.read_character_jobs.v1` - Industry jobs
- `esi-contracts.read_character_contracts.v1` - Contracts
- `esi-clones.read_clones.v1` - Clone locations
- `esi-clones.read_implants.v1` - Implants
- `esi-universe.read_structures.v1` - Player structures
- `esi-wallet.read_character_wallet.v1` - Wallet

**Corporation Scopes** (optional, requires Director role):
- All character scopes, plus:
- `esi-assets.read_corporation_assets.v1`
- `esi-corporations.read_blueprints.v1`
- `esi-corporations.read_divisions.v1`
- `esi-contracts.read_corporation_contracts.v1`
- `esi-industry.read_corporation_jobs.v1`
- `esi-markets.read_corporation_orders.v1`
- `esi-wallet.read_corporation_wallets.v1`

### Token Lifecycle

| Token | Validity | Storage | Notes |
|-------|----------|---------|-------|
| Access Token | ~20 min | Memory only | JWT, not persisted |
| Refresh Token | Long-lived | File (via IPC) | Persisted in auth-store |

### Token Refresh Triggers

1. **App startup** - Tokens not persisted, so refresh on first ESI request
2. **ESI request** - `esiClient.getAccessToken()` checks expiry (60s buffer)
3. **Manual** - Not currently exposed in UI

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `auth:start` | Renderer → Main | Initiate OAuth flow |
| `auth:cancel` | Renderer → Main | Cancel pending auth |
| `auth:refresh` | Renderer → Main | Refresh access token |
| `auth:logout` | Renderer → Main | Revoke tokens on EVE's server |

### Main Process Token Map

`main.ts` maintains `characterTokens: Map<number, string>` mapping characterId → refreshToken for server-side revocation on logout.
