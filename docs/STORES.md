# Data Store Architecture

High-level overview of the store architecture. For detailed per-store documentation (endpoints, schemas, data flows), see [stores/](./stores/).

## Store Hierarchy

```
useAssetStore (orchestrator)
├── useMarketOrdersStore
├── useIndustryJobsStore
├── useContractsStore
├── useClonesStore
├── useWalletStore
└── useBlueprintsStore

reference-cache (standalone)
```

All stores use Zustand + IndexedDB persistence.

## Update Orchestration

### User Clicks "Update"

```
useAssetStore.update()
  ├── Fetch assets for all owners
  ├── Resolve types (ref.edencom.net)
  ├── Fetch asset names
  ├── Trigger secondary stores in parallel:
  │   ├── useMarketOrdersStore.update(true)
  │   ├── useIndustryJobsStore.update(true)
  │   ├── useContractsStore.update(true)
  │   ├── useClonesStore.update(true)
  │   ├── useWalletStore.update(true)
  │   └── useBlueprintsStore.update(true)
  ├── Fetch prices (ref.edencom.net)
  └── Fetch abyssal prices (Mutamarket)
```

### New Owner Added

`useAssetStore.updateForOwner()` → triggers `updateForOwner()` on all secondary stores.

### Owner Removed

`useAssetStore.removeForOwner()` → triggers `removeForOwner()` on all secondary stores.

## Common Store Interface

```typescript
interface DataStoreActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
  canUpdate: () => boolean
  getTimeUntilUpdate: () => number
}
```

## Quick Reference

| Store | Cooldown | Character | Corporation |
|-------|----------|-----------|-------------|
| Assets | 1 hour | ✓ | ✓ |
| Market Orders | 5 min | ✓ | ✗ |
| Industry Jobs | 5 min | ✓ | ✓ |
| Contracts | 5 min | ✓ | ✓ (via char) |
| Clones | 5 min | ✓ | ✗ |
| Wallet | 5 min | ✓ | ✓ |
| Blueprints | 1 hour | ✓ | ✓ |

## App Initialization

```typescript
initCache()                                    // Reference cache
  .then(() => useAssetStore.getState().init()) // Assets first
  .then(() => Promise.all([                    // Others in parallel
    useMarketOrdersStore.getState().init(),
    useIndustryJobsStore.getState().init(),
    useContractsStore.getState().init(),
    useWalletStore.getState().init(),
    useBlueprintsStore.getState().init(),
  ]))
```

## Detailed Documentation

See [stores/](./stores/) for:
- ESI endpoints and schemas
- Data type definitions
- Step-by-step data flows
- ESI spec verification
- Code references
