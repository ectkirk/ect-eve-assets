# Store Documentation

Detailed documentation for each data store in ECTEVEAssets.

## Index

| Store | Purpose | Update Cooldown |
|-------|---------|-----------------|
| [asset-store](./asset-store.md) | Character/corp assets, orchestrates all stores | 1 hour |
| [reference-cache](./reference-cache.md) | Types, locations, structures, abyssal prices | N/A (on-demand) |
| [market-orders-store](./market-orders-store.md) | Character market orders | 5 minutes |
| [industry-jobs-store](./industry-jobs-store.md) | Manufacturing/research jobs | 5 minutes |
| [contracts-store](./contracts-store.md) | Contracts with items | 5 minutes |
| [clones-store](./clones-store.md) | Jump clones and implants | 5 minutes |
| [wallet-store](./wallet-store.md) | ISK balances | 5 minutes |
| [blueprints-store](./blueprints-store.md) | Blueprint ME/TE/runs | 1 hour |

## Architecture Overview

See [STORES.md](../STORES.md) for high-level architecture.

### Store Hierarchy

```
useAssetStore (orchestrator)
├── useMarketOrdersStore
├── useIndustryJobsStore
├── useContractsStore
├── useClonesStore
├── useWalletStore
└── useBlueprintsStore

reference-cache (standalone, used by all)
```

### Common Patterns

**Store Interface**
All stores implement:
- `init()` - Load from IndexedDB on startup
- `update(force?)` - Fetch fresh data from ESI
- `updateForOwner(owner)` - Fetch for single owner
- `removeForOwner(type, id)` - Remove owner's data
- `clear()` - Clear all data
- `canUpdate()` / `getTimeUntilUpdate()` - Cooldown checks

**IndexedDB Schema**
Each store uses two object stores:
- Main store (keyed by `{ownerType}-{ownerId}`)
- `meta` store (for `lastUpdated` timestamp)

**Owner Types**
- `character` - Individual character
- `corporation` - Corporation (accessed via character's corp roles)

**ESI Client**
All ESI requests use `esiClient` singleton:
- `fetch()` - Single request with ETag/Expires caching
- `fetchWithPagination()` - Multi-page requests via X-Pages header
- `fetchBatch()` - Batch operations with progress callbacks

## External APIs

| API | Client | Base URL |
|-----|--------|----------|
| ESI | `esi-client.ts` | `https://esi.evetech.net` |
| ref.edencom.net | `ref-client.ts` | Via Electron IPC |
| Mutamarket | `mutamarket-client.ts` | Via Electron IPC |

## Update Flow

1. User clicks "Update" button
2. `useAssetStore.update()` called
3. Asset store fetches assets for all owners
4. Asset store triggers parallel updates on all secondary stores
5. Type IDs collected from assets + industry jobs
6. Prices fetched from ref.edencom.net
7. Abyssal prices fetched from Mutamarket (for uncached items)
8. Everything persisted to IndexedDB
