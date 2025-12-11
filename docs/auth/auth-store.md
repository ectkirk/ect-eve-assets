# Auth Store

`src/store/auth-store.ts` - Zustand store for authentication state.

## Overview

Manages authenticated owners (characters and corporations) with persistent storage via Electron IPC.

## Data Model

### Owner

```typescript
type OwnerType = 'character' | 'corporation'

interface Owner {
  id: number           // Character ID or Corporation ID
  type: OwnerType
  name: string
  characterId: number  // For corps: Director character; for chars: same as id
  corporationId: number
  accessToken: string | null
  refreshToken: string
  expiresAt: number | null
}
```

### Owner Key Format

```typescript
function ownerKey(type: OwnerType, id: number): string {
  return `${type}-${id}`  // e.g., "character-123456789" or "corporation-98000001"
}
```

## State Shape

```typescript
interface AuthState {
  owners: Record<string, Owner>  // Keyed by ownerKey()
  activeOwnerId: string | null   // Currently selected owner
  isAuthenticated: boolean       // true if any owners exist
}
```

## Actions

### Owner Management

| Action | Description |
|--------|-------------|
| `addOwner(auth)` | Add new character or corporation |
| `removeOwner(ownerId)` | Remove owner, switch active if needed |
| `switchOwner(ownerId)` | Change active owner (`null` = "All Characters") |
| `updateOwnerTokens(ownerId, tokens)` | Update tokens after refresh |
| `clearAuth()` | Remove all owners |

### Active Owner Behavior

- **First owner added**: Automatically becomes active
- **Second+ owner added**: `activeOwnerId` set to `null` ("All Characters" mode)
- **Active owner removed**: Switches to first remaining owner
- **`null` active**: UI shows aggregated data from all owners

### Getters

| Getter | Returns |
|--------|---------|
| `getActiveOwner()` | Current active `Owner` or null |
| `getOwner(ownerId)` | Specific owner by key |
| `getOwnerByCharacterId(id)` | Find owner by character ID |
| `getAllOwners()` | Array of all owners |
| `getCharacterOwners()` | Character-type owners only |
| `getCorporationOwners()` | Corporation-type owners only |
| `isOwnerTokenExpired(ownerId)` | Token expired (with 60s buffer) |

## Persistence

### Storage Adapter

Uses Electron IPC for file-based storage (falls back to localStorage in dev):

```typescript
const electronStorage: StateStorage = {
  getItem: (name) => window.electronAPI.storageGet(),
  setItem: (name, value) => window.electronAPI.storageSet(existing),
  removeItem: (name) => window.electronAPI.storageSet(remaining),
}
```

### Partialize

Only essential data persisted—access tokens are NOT stored:

```typescript
partialize: (state) => ({
  owners: Object.fromEntries(
    Object.entries(state.owners).map(([key, owner]) => [
      key,
      {
        id: owner.id,
        type: owner.type,
        name: owner.name,
        characterId: owner.characterId,
        corporationId: owner.corporationId,
        refreshToken: owner.refreshToken,
        accessToken: null,   // Not persisted
        expiresAt: null,     // Not persisted
      },
    ])
  ),
  activeOwnerId: state.activeOwnerId,
})
```

### Rehydration

On app start, `isAuthenticated` is set based on owner count:

```typescript
onRehydrateStorage: () => (state) => {
  if (state) {
    state.isAuthenticated = Object.keys(state.owners).length > 0
  }
}
```

## Token Expiration Check

60-second buffer before actual expiration:

```typescript
isOwnerTokenExpired: (ownerId) => {
  const owner = get().owners[ownerId]
  if (!owner?.expiresAt) return true
  return Date.now() >= owner.expiresAt - 60000
}
```

## Usage

### React Components

```typescript
import { useAuthStore } from '@/store/auth-store'

function MyComponent() {
  const activeOwner = useAuthStore((s) => s.getActiveOwner())
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const switchOwner = useAuthStore((s) => s.switchOwner)
}
```

### Active Character Hook

```typescript
import { useActiveCharacter } from '@/store/auth-store'

function CharacterInfo() {
  const character = useActiveCharacter()  // Only character-type owners
}
```

## Legacy Compatibility

The store maintains legacy character-only API for existing code:

| Legacy | Maps To |
|--------|---------|
| `characters` | Computed from character-type owners |
| `activeCharacterId` | ID of active character (null if corp) |
| `addCharacter(auth)` | `addOwner()` with type='character' |
| `removeCharacter(id)` | `removeOwner()` |
| `getCharacter(id)` | `getOwner()` |
| `getAllCharacters()` | `getCharacterOwners()` |
| `isTokenExpired(id)` | `isOwnerTokenExpired()` |
| `updateCharacterTokens()` | `updateOwnerTokens()` |

## Flow Examples

### Adding a Character

```typescript
// After successful auth
authStore.addOwner({
  accessToken: result.accessToken,
  refreshToken: result.refreshToken,
  expiresAt: result.expiresAt,
  owner: {
    id: result.characterId,
    type: 'character',
    name: result.characterName,
    characterId: result.characterId,
    corporationId: result.corporationId,
  },
})
```

### Adding a Corporation

```typescript
// Director authenticates with corp scopes
authStore.addOwner({
  accessToken: result.accessToken,
  refreshToken: result.refreshToken,
  expiresAt: result.expiresAt,
  owner: {
    id: result.corporationId,  // Corp ID is the owner ID
    type: 'corporation',
    name: corporationName,
    characterId: result.characterId,  // Director's character
    corporationId: result.corporationId,
  },
})
```

### Token Refresh

```typescript
if (authStore.isOwnerTokenExpired(ownerId)) {
  const owner = authStore.getOwner(ownerId)
  const result = await window.electronAPI.refreshToken(
    owner.refreshToken,
    owner.characterId
  )
  if (result.success) {
    authStore.updateOwnerTokens(ownerId, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    })
  }
}
```

## ESI Client Integration

`src/api/esi-client.ts` uses the auth store for transparent token management:

```typescript
// esiClient.getAccessToken() - called before every authenticated request
private async getAccessToken(characterId?: number): Promise<string | null> {
  const store = useAuthStore.getState()

  // Find target character (explicit or from active owner)
  let targetCharId = characterId
  if (!targetCharId) {
    const activeOwner = store.getActiveOwner()
    if (!activeOwner) return null
    targetCharId = activeOwner.characterId
  }

  // Look up owner (try character key first, then search by characterId)
  const charOwnerKey = ownerKey('character', targetCharId)
  let owner = store.getOwner(charOwnerKey)
  if (!owner) {
    owner = store.getOwnerByCharacterId(targetCharId)
  }
  if (!owner) return null

  // Auto-refresh if expired
  const ownerId = ownerKey(owner.type, owner.id)
  const needsRefresh = !owner.accessToken || store.isOwnerTokenExpired(ownerId)

  if (needsRefresh && owner.refreshToken && window.electronAPI) {
    const result = await window.electronAPI.refreshToken(
      owner.refreshToken,
      owner.characterId
    )
    if (result.success && result.accessToken && result.refreshToken) {
      store.updateOwnerTokens(ownerId, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt ?? Date.now() + 1200000,
      })
      return result.accessToken
    }
    return null
  }

  return owner.accessToken ?? null
}
```

Key behaviors:
- **Automatic refresh**: Tokens refreshed transparently before ESI requests
- **60-second buffer**: Refresh triggers before actual expiration
- **Owner lookup**: Supports both character and corporation owners via `characterId`
- **Fallback search**: `getOwnerByCharacterId()` finds corp owners by their director
