# Contracts Store

Manages contracts (item exchange, auction) with their items. Complex filtering and caching logic.

## Overview

| Property | Value |
|----------|-------|
| **File** | `src/store/contracts-store.ts` |
| **Endpoint File** | `src/api/endpoints/contracts.ts` |
| **IndexedDB** | `ecteveassets-contracts` |
| **Update Cooldown** | 5 minutes |
| **Owner Types** | Character only (but fetches corp contracts via character) |

## ESI Endpoints

| Endpoint | Method | Paginated | Auth |
|----------|--------|-----------|------|
| `/characters/{character_id}/contracts/` | GET | Yes | Required |
| `/characters/{character_id}/contracts/{contract_id}/items/` | GET | No | Required |
| `/corporations/{corporation_id}/contracts/` | GET | Yes | Required |
| `/corporations/{corporation_id}/contracts/{contract_id}/items/` | GET | No | Required |
| `/contracts/public/items/{contract_id}/` | GET | No | Public |

## Data Types

### ESIContract (from ESI)

```typescript
interface ESIContract {
  contract_id: number
  issuer_id: number
  issuer_corporation_id: number
  assignee_id: number
  acceptor_id: number
  availability: 'public' | 'personal' | 'corporation' | 'alliance'
  type: 'unknown' | 'item_exchange' | 'auction' | 'courier' | 'loan'
  status: 'outstanding' | 'in_progress' | 'finished_issuer' | 'finished_contractor' |
          'finished' | 'cancelled' | 'rejected' | 'failed' | 'deleted' | 'reversed'
  date_issued: string
  date_expired: string
  date_accepted?: string
  date_completed?: string
  for_corporation: boolean
  title?: string
  price?: number
  reward?: number
  collateral?: number
  buyout?: number
  volume?: number
  days_to_complete?: number
  start_location_id?: number
  end_location_id?: number
}
```

### ESIContractItem (from ESI)

```typescript
interface ESIContractItem {
  record_id: number
  type_id: number
  quantity: number
  is_included: boolean        // true = being sold, false = being requested
  is_singleton?: boolean
  raw_quantity?: number
  item_id?: number            // Only for public contracts with specific items
  is_blueprint_copy?: boolean
  material_efficiency?: number
  time_efficiency?: number
  runs?: number
}
```

### ContractWithItems (internal)

```typescript
interface ContractWithItems {
  contract: ESIContract
  items: ESIContractItem[]
}
```

### OwnerContracts (internal)

```typescript
interface OwnerContracts {
  owner: Owner
  contracts: ContractWithItems[]
}
```

## Data Flow

### Update (`update()`)

Complex flow with multiple filtering and caching stages:

```
1. Check cooldown (5 minutes)
2. Get all character owners (filter out corporations)
3. Build global items cache from existing data
4. For each character owner:
   a. Fetch character contracts (paginated)
   b. Fetch corporation contracts if character has corporationId
   c. Deduplicate corp contracts (remove duplicates from character list)
   d. Filter contracts:
      - Type: only 'item_exchange' and 'auction'
      - Status: only 'outstanding' or 'in_progress'
      - Age: issued within last 30 days
   e. Check cache for existing items
   f. Batch fetch items for uncached contracts (20 at a time)
   g. Choose correct endpoint based on availability:
      - Public: /contracts/public/items/{id}/
      - Corporation: /corporations/{corp}/contracts/{id}/items/
      - Personal: /characters/{char}/contracts/{id}/items/
5. Save to IndexedDB
```

### Contract Filtering Logic

Only fetch items for contracts that are:
1. **Type**: `item_exchange` or `auction` (skip courier, loan, unknown)
2. **Status**: `outstanding` or `in_progress` (skip completed/cancelled)
3. **Age**: Issued within last 30 days (older contracts won't have items available)
4. **Not cached**: Items not already in globalItemsCache

### Items Caching Strategy

```typescript
const globalItemsCache = new Map<number, ESIContractItem[]>()

// Build from existing contracts
for (const { contracts } of state.contractsByOwner) {
  for (const { contract, items } of contracts) {
    if (items.length > 0) {
      globalItemsCache.set(contract.contract_id, items)
    }
  }
}
```

Cache validation for public contracts checks for `item_id` presence (public items include it).

## Storage

### IndexedDB Schema

**Database:** `ecteveassets-contracts` (version 1)

| Object Store | Key Path | Contents |
|--------------|----------|----------|
| `contracts` | `ownerKey` | `{ ownerKey, owner, contracts: ContractWithItems[] }` |
| `meta` | `key` | `lastUpdated` |

## Character vs Corporation Access

| Contract Availability | Items Endpoint | Auth Character |
|----------------------|----------------|----------------|
| `public` | `/contracts/public/items/{id}/` | None required |
| `personal` | `/characters/{char}/contracts/{id}/items/` | Contract owner |
| `corporation` | `/corporations/{corp}/contracts/{id}/items/` | Character with roles |
| `alliance` | Same as corporation | Character with roles |

## Deduplication

Character and corporation contracts may overlap:

```typescript
const seenIds = new Set(characterContracts.map(c => c.contract_id))
const uniqueCorpContracts = corpContracts.filter(c => !seenIds.has(c.contract_id))
const contracts = [...characterContracts, ...uniqueCorpContracts]
```

## Batch Fetching

Contract items are fetched in batches:

```typescript
const fetchedItems = await esiClient.fetchBatch(
  contractsToFetch,
  async (contract) => {
    // Route to correct endpoint
  },
  { batchSize: 20 }
)
```

## ESI Spec Verification

### ESIContract Schema

| Field | Our Schema | ESI Spec |
|-------|------------|----------|
| `contract_id` | number | ✓ |
| `issuer_id` | number | ✓ |
| `issuer_corporation_id` | number | ✓ |
| `assignee_id` | number | ✓ |
| `acceptor_id` | number | ✓ |
| `availability` | enum | ✓ |
| `type` | enum | ✓ |
| `status` | enum | ✓ |
| `date_issued` | string | ✓ |
| `date_expired` | string | ✓ |
| `for_corporation` | boolean | ✓ |
| `price` | number (optional) | ✓ |
| `reward` | number (optional) | ✓ |
| `collateral` | number (optional) | ✓ |
| `buyout` | number (optional) | ✓ |
| `volume` | number (optional) | ✓ |
| `title` | string (optional) | ✓ |

### ESIContractItem Schema

| Field | Our Schema | ESI Spec |
|-------|------------|----------|
| `record_id` | number | ✓ |
| `type_id` | number | ✓ |
| `quantity` | number | ✓ |
| `is_included` | boolean | ✓ |
| `is_singleton` | boolean (optional) | ✓ |
| `raw_quantity` | number (optional) | ✓ |
| `item_id` | number (optional) | ✓ |
| `is_blueprint_copy` | boolean (optional) | ✓ |
| `material_efficiency` | number (optional) | ✓ |
| `time_efficiency` | number (optional) | ✓ |
| `runs` | number (optional) | ✓ |

## Code References

| Location | Purpose |
|----------|---------|
| `src/store/contracts-store.ts:194-376` | `update()` - main update flow |
| `src/store/contracts-store.ts:215-222` | Global items cache building |
| `src/store/contracts-store.ts:269-300` | Contract filtering logic |
| `src/store/contracts-store.ts:312-324` | Batch fetching with endpoint routing |
| `src/api/endpoints/contracts.ts:8-15` | `getCharacterContracts()` (paginated) |
| `src/api/endpoints/contracts.ts:17-25` | `getContractItems()` |
| `src/api/endpoints/contracts.ts:27-33` | `getPublicContractItems()` |

## Potential Issues

None identified. The implementation correctly handles:
- Contract type filtering (only item_exchange/auction)
- Status filtering (only active contracts)
- Age filtering (30 days)
- Public vs private item endpoints
- Corporation contract access
- Deduplication
- Items caching
