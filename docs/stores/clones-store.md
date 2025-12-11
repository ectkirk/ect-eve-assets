# Clones Store

Manages jump clones and active implants for characters. Character-only (no corporation support).

## Overview

| Property | Value |
|----------|-------|
| **File** | `src/store/clones-store.ts` |
| **Endpoint File** | `src/api/endpoints/clones.ts` |
| **IndexedDB** | `ecteveassets-clones` |
| **Update Cooldown** | 5 minutes |
| **Owner Types** | Character only |

## ESI Endpoints

| Endpoint | Method | Paginated | Scope |
|----------|--------|-----------|-------|
| `/characters/{character_id}/clones/` | GET | No | `esi-clones.read_clones.v1` |
| `/characters/{character_id}/implants/` | GET | No | `esi-clones.read_implants.v1` |

## Data Types

### ESIClone (from ESI)

```typescript
interface ESIClone {
  home_location?: {
    location_id: number
    location_type: 'station' | 'structure'
  }
  jump_clones: Array<{
    jump_clone_id: number
    location_id: number
    location_type: 'station' | 'structure'
    implants: number[]      // Type IDs of implants in this clone
    name?: string           // Custom name
  }>
  last_clone_jump_date?: string   // ISO date
  last_station_change_date?: string
}
```

### CharacterCloneData (internal)

```typescript
interface CharacterCloneData {
  owner: Owner
  clones: ESIClone           // Clone data from /clones/
  activeImplants: number[]   // Type IDs from /implants/
}
```

## Data Flow

### Update (`update()`)

```
1. Check cooldown (5 minutes)
2. Get all character owners (filter out corporations)
3. For each character:
   a. Fetch clones and implants in parallel:
      Promise.all([
        getCharacterClones(characterId),
        getCharacterImplants(characterId)
      ])
   b. Store combined data
4. Save to IndexedDB
```

### Parallel Fetching

Both endpoints are fetched in parallel for efficiency:

```typescript
const [clones, activeImplants] = await Promise.all([
  getCharacterClones(owner.characterId),
  getCharacterImplants(owner.characterId),
])
```

## Storage

### IndexedDB Schema

**Database:** `ecteveassets-clones` (version 1)

| Object Store | Key Path | Contents |
|--------------|----------|----------|
| `clones` | `ownerKey` | `{ ownerKey, owner, clones, activeImplants }` |
| `meta` | `key` | `lastUpdated` |

## ESI Spec Verification

### GET /characters/{character_id}/clones/

| Field | Our Schema | ESI Spec |
|-------|------------|----------|
| `home_location` | object (optional) | ✓ |
| `home_location.location_id` | number | ✓ |
| `home_location.location_type` | enum | ✓ |
| `jump_clones` | array | ✓ |
| `jump_clones[].jump_clone_id` | number | ✓ |
| `jump_clones[].location_id` | number | ✓ |
| `jump_clones[].location_type` | enum | ✓ |
| `jump_clones[].implants` | number[] | ✓ |
| `jump_clones[].name` | string (optional) | ✓ |
| `last_clone_jump_date` | string (optional) | ✓ |
| `last_station_change_date` | string (optional) | ✓ |

### GET /characters/{character_id}/implants/

Returns `number[]` - array of implant type IDs currently plugged in.

## Code References

| Location | Purpose |
|----------|---------|
| `src/store/clones-store.ts:185-245` | `update()` - main update flow |
| `src/store/clones-store.ts:195-197` | Character-only filter |
| `src/store/clones-store.ts:211-214` | Parallel fetch of clones + implants |
| `src/api/endpoints/clones.ts:7-14` | `getCharacterClones()` |
| `src/api/endpoints/clones.ts:16-23` | `getCharacterImplants()` |

## Potential Issues

None identified. Implementation correctly:
- Fetches both endpoints in parallel
- Filters to character owners only
- Stores combined clone + implant data
