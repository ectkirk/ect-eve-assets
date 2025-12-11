# Blueprints Store

Manages blueprint ME/TE/runs for characters and corporations. Used to display blueprint stats in asset views.

## Overview

| Property | Value |
|----------|-------|
| **File** | `src/store/blueprints-store.ts` |
| **Endpoint File** | `src/api/endpoints/blueprints.ts` |
| **IndexedDB** | `ecteveassets-blueprints` |
| **Update Cooldown** | 1 hour |
| **Owner Types** | Character, Corporation |

## ESI Endpoints

| Endpoint | Method | Paginated | Scope |
|----------|--------|-----------|-------|
| `/characters/{character_id}/blueprints/` | GET | Yes | `esi-characters.read_blueprints.v1` |
| `/corporations/{corporation_id}/blueprints/` | GET | Yes | `esi-corporations.read_blueprints.v1` |

## Data Types

### ESIBlueprint (from ESI)

```typescript
interface ESIBlueprint {
  item_id: number           // Unique item ID (matches asset item_id)
  type_id: number           // Blueprint type ID
  location_id: number       // Where blueprint is stored
  location_flag: string     // Container position
  quantity: number          // -1 = original, -2 = copy
  runs: number              // Remaining runs (-1 = infinite for originals)
  material_efficiency: number  // 0-10
  time_efficiency: number      // 0-20 (in steps of 2)
}
```

### BlueprintInfo (derived)

```typescript
interface BlueprintInfo {
  materialEfficiency: number
  timeEfficiency: number
  runs: number
  isCopy: boolean  // quantity === -2
}
```

### OwnerBlueprints (internal)

```typescript
interface OwnerBlueprints {
  owner: Owner
  blueprints: ESIBlueprint[]
}
```

## Data Flow

### Update (`update()`)

```
1. Check cooldown (1 hour)
2. Get all owners (characters + corporations)
3. For each owner:
   a. If corporation: getCorporationBlueprints() (paginated)
   b. If character: getCharacterBlueprints() (paginated)
4. Build blueprintsByItemId map
5. Save to IndexedDB
```

### Blueprint Map Building

The store maintains a derived `blueprintsByItemId` map for quick lookup:

```typescript
function buildBlueprintMap(blueprintsByOwner: OwnerBlueprints[]): Map<number, BlueprintInfo> {
  const map = new Map<number, BlueprintInfo>()
  for (const { blueprints } of blueprintsByOwner) {
    for (const bp of blueprints) {
      map.set(bp.item_id, {
        materialEfficiency: bp.material_efficiency,
        timeEfficiency: bp.time_efficiency,
        runs: bp.runs,
        isCopy: bp.quantity === -2,
      })
    }
  }
  return map
}
```

## Storage

### IndexedDB Schema

**Database:** `ecteveassets-blueprints` (version 1)

| Object Store | Key Path | Contents |
|--------------|----------|----------|
| `blueprints` | `ownerKey` | `{ ownerKey, owner, blueprints[] }` |
| `meta` | `key` | `lastUpdated` |

Note: `blueprintsByItemId` is NOT persisted - it's rebuilt from `blueprintsByOwner` on load.

## Utility Functions

### getBlueprintInfo

```typescript
export function getBlueprintInfo(itemId: number): BlueprintInfo | undefined {
  return useBlueprintsStore.getState().blueprintsByItemId.get(itemId)
}
```

### formatBlueprintName

Formats blueprint display name with ME/TE/runs:

```typescript
export function formatBlueprintName(baseName: string, itemId: number): string {
  const info = getBlueprintInfo(itemId)
  if (!info) return baseName

  if (info.isCopy) {
    return `${baseName} (ME${info.materialEfficiency} TE${info.timeEfficiency} R${info.runs})`
  }
  return `${baseName} (ME${info.materialEfficiency} TE${info.timeEfficiency})`
}
```

Examples:
- Original: `Rifter Blueprint (ME10 TE20)`
- Copy: `Rifter Blueprint (ME10 TE20 R5)`

## Blueprint Quantity Values

| Quantity | Meaning |
|----------|---------|
| -1 | Original blueprint (infinite runs) |
| -2 | Blueprint copy (limited runs) |
| 1+ | Stacked blueprints (rare, not typically used) |

## ESI Spec Verification

### GET /characters/{character_id}/blueprints/

| Field | Our Schema | ESI Spec |
|-------|------------|----------|
| `item_id` | number | ✓ |
| `type_id` | number | ✓ |
| `location_id` | number | ✓ |
| `location_flag` | string | ✓ |
| `quantity` | number | ✓ |
| `runs` | number | ✓ |
| `material_efficiency` | number | ✓ |
| `time_efficiency` | number | ✓ |

**Cache**: 3600 seconds (matches our 1 hour cooldown)

## Code References

| Location | Purpose |
|----------|---------|
| `src/store/blueprints-store.ts:212-271` | `update()` - main update flow |
| `src/store/blueprints-store.ts:82-95` | `buildBlueprintMap()` - derives lookup map |
| `src/store/blueprints-store.ts:162-167` | `fetchOwnerBlueprints()` - char/corp routing |
| `src/store/blueprints-store.ts:332-334` | `getBlueprintInfo()` utility |
| `src/store/blueprints-store.ts:336-344` | `formatBlueprintName()` utility |
| `src/api/endpoints/blueprints.ts:7-15` | `getCharacterBlueprints()` (paginated) |
| `src/api/endpoints/blueprints.ts:17-25` | `getCorporationBlueprints()` (paginated) |

## Potential Issues

None identified. Implementation correctly:
- Uses pagination for both endpoints
- Handles both character and corporation
- Builds derived map for O(1) lookup
- Properly identifies copies via quantity === -2
