# Data Store Architecture

High-level overview of the store architecture. For detailed per-store documentation (endpoints, schemas, data flows), see [stores/](./stores/).

**Related:**
- [Authentication](./auth/AUTH.md) - OAuth flow and auth store
- [ESI Caching](./ESI_CACHING.md) - Cache headers, rate limits, best practices
- [Auto-Refresh Design](./AUTO_REFRESH_DESIGN.md) - Proposed Expires-based refresh system

## Store Hierarchy

```
useAuthStore (authentication)
  └── Manages owners (characters/corporations), tokens, persistence

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

| Store | Current Cooldown | Character | Corporation | ESI Rate Group |
|-------|------------------|-----------|-------------|----------------|
| Assets | 1 hour | ✓ | ✓ | char/corp-asset |
| Market Orders | 5 min | ✓ | ✓ | char/corp-market |
| Industry Jobs | 5 min | ✓ | ✓ | char/corp-industry |
| Contracts | 5 min | ✓ | ✓ (via char) | char/corp-contract |
| Clones | 5 min | ✓ | ✗ | char-location |
| Wallet | 5 min | ✓ | ✓ | char/corp-wallet |
| Blueprints | 1 hour | ✓ | ✓ | char/corp-industry |

> **Note:** Current cooldowns are hardcoded. See [Auto-Refresh Design](./AUTO_REFRESH_DESIGN.md) for planned Expires-based refresh.

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
