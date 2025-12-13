# Reference Cache

A standalone cache store for reference data (types, locations, structures, abyssal prices) used by all other stores.

## Overview

| Property | Value |
|----------|-------|
| **File** | `src/store/reference-cache.ts` |
| **API Clients** | `src/api/ref-client.ts`, `src/api/mutamarket-client.ts`, `src/api/endpoints/universe.ts` |
| **IndexedDB** | `ecteveassets-cache` (version 4) |
| **Update Cooldown** | N/A (on-demand caching) |

## Architecture

Unlike other stores, reference-cache uses a **write-through pattern**:
- **Runtime**: In-memory Maps for fast synchronous access
- **Persistence**: IndexedDB for data survival across restarts
- On startup: IndexedDB → in-memory Maps
- On write: IndexedDB + in-memory Maps updated together

## External APIs

### edencom.net

Accessed via Electron IPC bridge (`window.electronAPI`).

| Function | Electron IPC | Purpose |
|----------|-------------|---------|
| `resolveTypes()` | `refTypes(ids, market)` | Type names, groups, categories, prices |
| `resolveLocations()` | `refUniverse(ids)` | Location names, systems, regions |
| `fetchPrices()` | `refTypes(ids, market)` | Jita market prices |

### Mutamarket API

Accessed via Electron IPC bridge.

| Function | Electron IPC | Purpose |
|----------|-------------|---------|
| `fetchAbyssalPrices()` | `mutamarketModule(itemId)` | Abyssal module estimated values |

### ESI (for structures)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/universe/structures/{structure_id}/` | GET | Player structure names |
| `/universe/names/` | POST | Character/corp/alliance names |

## Data Types

### CachedType

```typescript
interface CachedType {
  id: number
  name: string
  groupId: number
  groupName: string
  categoryId: number
  categoryName: string
  volume: number
  packagedVolume?: number
}
```

### CachedStructure

```typescript
interface CachedStructure {
  id: number
  name: string
  solarSystemId: number
  typeId: number
  ownerId: number
  resolvedByCharacterId?: number  // Which character resolved this
  inaccessible?: boolean          // true if 403/404 received
}
```

### CachedLocation

```typescript
interface CachedLocation {
  id: number
  name: string
  type: 'region' | 'constellation' | 'system' | 'station' | 'structure'
  solarSystemId?: number
  solarSystemName?: string
  regionId?: number
  regionName?: string
}
```

### CachedAbyssal

```typescript
interface CachedAbyssal {
  id: number        // item_id (not type_id)
  price: number     // estimated_value from Mutamarket
  fetchedAt: number // timestamp for cache invalidation
}
```

## Storage

### IndexedDB Schema

**Database:** `ecteveassets-cache` (version 4)

| Object Store | Key Path | Contents |
|--------------|----------|----------|
| `types` | `id` | `CachedType` |
| `structures` | `id` | `CachedStructure` |
| `locations` | `id` | `CachedLocation` |
| `abyssals` | `id` | `CachedAbyssal` |

### Migrations

- **v4**: Clears `locations` store (added `regionName`/`solarSystemName` fields)

## Data Flows

### Type Resolution (`resolveTypes`)

```
1. Check in-memory cache for each typeId
2. Skip types that already exist (unless name starts with "Unknown Type ")
3. Batch uncached IDs in chunks of 1000
4. Call window.electronAPI.refTypes(chunk, market)
5. Parse response with RefTypeBulkResponseSchema
6. Create CachedType for each returned type
7. Create placeholder "Unknown Type {id}" for unreturned IDs
8. Save all to IndexedDB + in-memory cache
```

**Placeholder handling**: Types not returned by API (BPCs, abyssal modules, etc.) get placeholder entries to prevent re-fetching.

### Location Resolution (`resolveLocations`)

```
1. Filter out structure IDs (> 1,000,000,000,000)
2. Check in-memory cache for each locationId
3. Batch uncached IDs in chunks of 1000
4. Call window.electronAPI.refUniverse(chunk)
5. Parse response with RefUniverseBulkResponseSchema
6. Create CachedLocation with system/region info
7. Save to IndexedDB + in-memory cache
```

### Structure Resolution (`resolveStructures`)

```
1. Check in-memory cache for each structureId
2. For NPC stations (ID < 1 trillion):
   a. Call resolveLocations() via edencom.net
   b. Convert to CachedStructure
3. For player structures (ID > 1 trillion):
   a. Call ESI /universe/structures/{id}/ with character auth
   b. Handle 403 (access denied) → mark inaccessible
   c. Handle 404 (not found) → mark inaccessible
   d. Create CachedStructure or placeholder
4. Save all to IndexedDB + in-memory cache
```

### Price Fetching (`fetchPrices`)

```
1. Call window.electronAPI.refTypes(typeIds, market)
2. Extract marketPrice.lowestSell (preferred) or marketPrice.average
3. Also cache type metadata as side effect
4. Return Map<typeId, price>
```

### Abyssal Price Fetching (`fetchAbyssalPrices`)

```
1. Check cache for each itemId
2. For uncached items, fetch sequentially (not parallel)
3. Call window.electronAPI.mutamarketModule(itemId)
4. Handle 404 → cache price=0 to prevent re-fetching
5. Retry on error (max 2 retries, 500ms/1500ms delays)
6. Extract estimated_value from response
7. Save to IndexedDB with fetchedAt timestamp
```

## API Response Schemas

### edencom.net /types

```typescript
interface RefType {
  id: number
  name: string
  groupId?: number | null
  groupName?: string | null
  categoryId?: number | null
  categoryName?: string | null
  volume?: number | null
  packagedVolume?: number | null
  basePrice?: number | null
  marketPrice: {
    adjusted?: string | number | null
    average?: string | number | null
    highestBuy?: number | null
    lowestSell?: number | null
    salesCount?: number
    timeWindow?: string | null
    hasSufficientData?: boolean
  }
}
```

### edencom.net /universe

```typescript
interface RefUniverseItem {
  type: 'region' | 'constellation' | 'system' | 'station' | 'structure'
  name: string
  solarSystemId?: number
  solarSystemName?: string
  regionId?: number
  regionName?: string
}
```

### Mutamarket /modules/{id}

```typescript
interface MutamarketModule {
  id: number
  type: { id: number; name: string }
  source_type: {
    id: number
    name: string
    meta_group?: string | null
    meta_group_id?: number | null
    published?: boolean
  }
  mutaplasmid?: { id: number; name: string } | null
  estimated_value?: number | null
  estimated_value_updated_at?: string | null
  slug?: string | null
  contract?: { id: number; type: string; price: number } | null
}
```

### ESI /universe/structures/{id}/

```typescript
interface ESIStructure {
  name: string
  owner_id: number
  position?: { x: number; y: number; z: number }
  solar_system_id: number
  type_id?: number
}
```

## Synchronous Getters

The cache provides synchronous getters for UI components:

| Function | Returns |
|----------|---------|
| `getType(id)` | `CachedType \| undefined` |
| `getTypeName(id)` | `string` (fallback: "Unknown Type {id}") |
| `hasType(id)` | `boolean` |
| `getStructure(id)` | `CachedStructure \| undefined` |
| `hasStructure(id)` | `boolean` |
| `getLocation(id)` | `CachedLocation \| undefined` |
| `hasLocation(id)` | `boolean` |
| `getLocationName(id)` | `string` (handles structures vs locations) |
| `getAbyssal(itemId)` | `CachedAbyssal \| undefined` |
| `hasAbyssal(itemId)` | `boolean` |
| `getAbyssalPrice(itemId)` | `number \| undefined` |

## Subscription System

```typescript
const listeners = new Set<() => void>()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
```

Used by UI components to re-render when cache updates.

## Abyssal Type IDs

Hard-coded set of 87 abyssal module type IDs:

```typescript
const ABYSSAL_TYPE_IDS = new Set([
  56305, 47757, 47753, 47749, 56306, 47745, 47408, 47740, 52230, 49738, 52227,
  90483, 90498, 49734, 90593, 90529, 49730, 49726, 90524, 90502, 49722, 90460,
  // ... (87 total IDs)
])

export function isAbyssalTypeId(typeId: number): boolean {
  return ABYSSAL_TYPE_IDS.has(typeId)
}
```

## Constants

### Category IDs

```typescript
export const CategoryIds = {
  SHIP: 6,
  MODULE: 7,
  CHARGE: 8,
  BLUEPRINT: 9,
  SKILL: 16,
  DRONE: 18,
  IMPLANT: 20,
  STRUCTURE: 65,
  SKIN: 91,
} as const
```

### Location Flags

```typescript
export const LocationFlags = {
  HANGAR: 4,
  CARGO: 5,
  SHIP_HANGAR: 90,
  DELIVERIES: 173,
  CORP_DELIVERIES: 62,
  ASSET_SAFETY: 36,
  CLONE_BAY: 89,
} as const
```

## Code References

| Location | Purpose |
|----------|---------|
| `src/store/reference-cache.ts:122-145` | `initCache()` - loads all stores from IDB |
| `src/store/reference-cache.ts:196-217` | `saveTypes()` - write-through save |
| `src/api/ref-client.ts:97-158` | `resolveTypes()` - type resolution flow |
| `src/api/ref-client.ts:160-199` | `resolveLocations()` - location resolution |
| `src/api/ref-client.ts:201-234` | `fetchPrices()` - price fetching |
| `src/api/mutamarket-client.ts:40-95` | `fetchSingleAbyssalPrice()` - retry logic |
| `src/api/mutamarket-client.ts:97-149` | `fetchAbyssalPrices()` - batch fetching |
| `src/api/endpoints/universe.ts:40-130` | `resolveStructures()` - structure resolution |

## Potential Issues

None identified. The cache properly handles:
- Unknown types (placeholders)
- Inaccessible structures (marked)
- API failures (retries, graceful degradation)
- Rate limiting (checks before structure resolution)
