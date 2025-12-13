# Asset Store

The orchestrator store that manages character/corporation assets and coordinates updates across all other stores.

## Overview

| Property | Value |
|----------|-------|
| **File** | `src/store/asset-store.ts` |
| **Endpoint File** | `src/api/endpoints/assets.ts`, `src/api/endpoints/corporation.ts` |
| **IndexedDB** | `ecteveassets-assets` |
| **Update Cooldown** | 1 hour |
| **Owner Types** | Character, Corporation |

## ESI Endpoints

### Character Assets

| Endpoint | Method | Paginated | Scope |
|----------|--------|-----------|-------|
| `/characters/{character_id}/assets/` | GET | Yes | `esi-assets.read_assets.v1` |
| `/characters/{character_id}/assets/names/` | POST | Chunked | `esi-assets.read_assets.v1` |

### Corporation Assets

| Endpoint | Method | Paginated | Scope |
|----------|--------|-----------|-------|
| `/corporations/{corporation_id}/assets/` | GET | Yes | `esi-assets.read_corporation_assets.v1` |
| `/corporations/{corporation_id}/assets/names/` | POST | Chunked | `esi-assets.read_corporation_assets.v1` |

## Data Types

### ESIAsset (from ESI)

```typescript
interface ESIAsset {
  item_id: number        // Unique item identifier (int64)
  type_id: number        // Item type ID
  location_id: number    // Container/station/structure ID (int64)
  location_flag: string  // Position within location (e.g., "Hangar", "Cargo")
  location_type: string  // "station" | "solar_system" | "item" | "other"
  quantity: number       // Stack size
  is_singleton: boolean  // true = individual item, false = stacked
  is_blueprint_copy?: boolean // Only present for blueprints
}
```

### ESIAssetName (from ESI)

```typescript
interface ESIAssetName {
  item_id: number  // Asset identifier
  name: string     // Custom name assigned by player
}
```

### OwnerAssets (internal)

```typescript
interface OwnerAssets {
  owner: Owner       // Character or corporation
  assets: ESIAsset[] // All assets for this owner
}
```

### AssetState (store state)

```typescript
interface AssetState {
  assetsByOwner: OwnerAssets[]      // Assets grouped by owner
  assetNames: Map<number, string>   // item_id → custom name
  prices: Map<number, number>       // type_id → ISK price
  lastUpdated: number | null
  isUpdating: boolean
  updateError: string | null
  updateProgress: { current: number; total: number } | null
  initialized: boolean
}
```

## Data Flow

### Primary Update (`update()`)

Called when user clicks "Update" button.

```
1. Check cooldown (1 hour since lastUpdated)
2. Get all owners from auth store
3. For each owner:
   a. Fetch assets via ESI (paginated)
   b. Resolve type names via edencom.net
   c. Fetch custom asset names for nameable items
4. Trigger parallel updates on secondary stores:
   - market-orders-store
   - industry-jobs-store
   - contracts-store
   - clones-store
   - wallet-store
   - blueprints-store
5. Collect all type IDs (from assets + industry job products)
6. Fetch prices from edencom.net
7. Fetch abyssal prices from Mutamarket (uncached only)
8. Save to IndexedDB
```

### New Owner Update (`updateForOwner()`)

Called when a new character/corporation is added via SSO.

```
1. Fetch assets for single owner
2. Resolve types
3. Fetch asset names
4. Merge with existing prices (fetch new type prices)
5. Fetch abyssal prices for new items
6. Save to IndexedDB
7. Trigger parallel updateForOwner on secondary stores
```

### Owner Removal (`removeForOwner()`)

```
1. Filter out owner's assets
2. Save updated data to IndexedDB
3. Trigger parallel removeForOwner on secondary stores
```

## Asset Name Resolution

Only certain items can have custom names. Filtering logic:

```typescript
const NAMEABLE_CATEGORIES = new Set([6, 22, 65])  // Ships, Drones, Structures
const NAMEABLE_GROUPS = new Set([12, 14, 340, 448, 649])  // Various

function isNameable(typeId: number): boolean {
  const type = getType(typeId)
  if (!type) return false
  return (
    NAMEABLE_CATEGORIES.has(type.categoryId) ||
    NAMEABLE_GROUPS.has(type.groupId)
  )
}
```

Asset names POST endpoint requires:
- `is_singleton === true` (individual items only)
- Item type is in nameable category/group
- Chunked in batches of 1000 item IDs (ESI limit)

## Pagination

Character/corporation assets use `fetchWithPagination()`:
- Appends `?page={n}` to URL
- Reads `X-Pages` header for total pages
- Continues until `page > totalPages`
- 100ms delay between page requests

Asset names POST is manually chunked:
- Max 1000 item IDs per request
- Sequential requests for each chunk

## Storage

### IndexedDB Schema

**Database:** `ecteveassets-assets` (version 1)

**Object Stores:**

| Store | Key Path | Contents |
|-------|----------|----------|
| `assets` | `ownerKey` | `{ ownerKey, owner, assets[] }` |
| `meta` | `key` | `lastUpdated`, `assetNames`, `prices` |

### Serialization

Maps are stored as arrays of entries:
```typescript
metaStore.put({ key: 'assetNames', value: Array.from(assetNames.entries()) })
metaStore.put({ key: 'prices', value: Array.from(prices.entries()) })
```

## External API Calls

### edencom.net

| Function | Purpose |
|----------|---------|
| `resolveTypes(typeIds[])` | Fetch type names, groups, categories |
| `fetchPrices(typeIds[])` | Fetch Jita market prices |

### Mutamarket

| Function | Purpose |
|----------|---------|
| `fetchAbyssalPrices(itemIds[])` | Fetch abyssal module prices |
| `isAbyssalTypeId(typeId)` | Check if type is abyssal |
| `hasCachedAbyssalPrice(itemId)` | Check cache before fetching |

## ESI Spec Verification

### GET /characters/{character_id}/assets/

| Field | ESI Spec | Our Schema | Match |
|-------|----------|------------|-------|
| `item_id` | int64 | number | ✓ |
| `type_id` | int32 | number | ✓ |
| `location_id` | int64 | number | ✓ |
| `location_flag` | string | string | ✓ |
| `location_type` | string enum | string | ✓ |
| `quantity` | int32 | number | ✓ |
| `is_singleton` | boolean | boolean | ✓ |
| `is_blueprint_copy` | boolean (optional) | boolean (optional) | ✓ |

**Pagination:** `X-Pages` header ✓
**Cache:** 3600 seconds ✓ (matches our 1 hour cooldown)

### POST /characters/{character_id}/assets/names/

| Field | ESI Spec | Our Implementation | Match |
|-------|----------|-------------------|-------|
| Request body | int64[] (1-1000) | Chunked 1000 | ✓ |
| Response `item_id` | int64 | number | ✓ |
| Response `name` | string | string | ✓ |

## Code References

| Location | Purpose |
|----------|---------|
| `src/store/asset-store.ts:171-176` | `fetchOwnerAssets()` - routes to char/corp endpoint |
| `src/store/asset-store.ts:184-201` | `fetchOwnerAssetNames()` - filters nameable items |
| `src/store/asset-store.ts:245-376` | `update()` - main update flow |
| `src/store/asset-store.ts:300-307` | Secondary store orchestration |
| `src/api/endpoints/assets.ts:8-16` | `getCharacterAssets()` |
| `src/api/endpoints/assets.ts:18-43` | `getCharacterAssetNames()` - chunking |
| `src/api/endpoints/corporation.ts:15-22` | `getCorporationAssets()` |

## Potential Issues

None identified. Implementation matches ESI spec.
