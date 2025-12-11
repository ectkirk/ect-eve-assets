# Auto-Refresh Architecture Design

Design document for Expires-based automatic data refresh.

**Status:** Approved
**Related:** [ESI Caching](./ESI_CACHING.md), [Store Architecture](./STORES.md)

---

## Design Decisions

1. **Independent refresh** - Each store refreshes independently based on its own expiry (asset store no longer orchestrates others)
2. **Per owner+endpoint expiry** - Track expiry as `owner:endpoint` combo (e.g., `character-123:/assets`)
3. **Refresh on app start** - Check expiry on launch and refresh stale data
4. **Persist expiry to IndexedDB** - App restart must respect existing expiry times

---

## Goals

1. **Respect ESI cache** - Only refresh when `Expires` header indicates data is stale
2. **Remove manual cooldowns** - Replace hardcoded cooldowns with actual expiry tracking
3. **Automatic refresh** - Refresh data in background when it expires
4. **Efficient** - Use conditional requests (ETags) to minimize bandwidth/tokens

## Non-Goals

- Real-time updates (ESI doesn't support websockets)
- Per-item refresh (refresh is per-endpoint)

---

## Current Architecture

```
User clicks "Update"
  → Check hardcoded cooldown (e.g., 5 min)
  → If cooldown passed, fetch all endpoints
  → Store lastUpdated timestamp
  → Ignore actual ESI Expires header
```

**Problems:**
1. May refresh too early (wastes resources, risks ban)
2. May refresh too late (user sees stale data)
3. Requires manual user action

---

## Proposed Architecture

### Core Concept: Per-Owner+Endpoint Expiry Tracking

Instead of a single `lastUpdated` per store, track `expiresAt` per owner+endpoint:

```typescript
// Key format: "{ownerType}-{ownerId}:{endpoint}"
// Example: "character-123:/characters/123/assets"

interface EndpointExpiry {
  expiresAt: number     // From ESI Expires header
  etag: string | null   // For conditional requests
}

// Stored in IndexedDB to persist across app restarts
```

### Data Flow

```
1. ESI Response arrives
   → Parse Expires header → store expiresAt
   → Parse ETag header → store for conditional requests

2. Refresh scheduler checks expiresAt
   → When Date.now() >= expiresAt, queue refresh
   → Use stored ETag for conditional request

3. Conditional request returns
   → 304: Update expiresAt only, data unchanged
   → 200: Update data + expiresAt + etag
```

### Components

#### 1. Expiry Cache Store

New Zustand store to track endpoint expiry times, persisted to IndexedDB:

```typescript
interface ExpiryCacheState {
  endpoints: Map<string, EndpointExpiry>  // key: "ownerType-ownerId:endpoint"
  initialized: boolean

  init: () => Promise<void>  // Load from IndexedDB
  setExpiry: (ownerKey: string, endpoint: string, expiresAt: number, etag?: string) => void
  getExpiry: (ownerKey: string, endpoint: string) => EndpointExpiry | undefined
  isExpired: (ownerKey: string, endpoint: string) => boolean
  getNextExpiry: () => { key: string; expiresAt: number } | null
  clearForOwner: (ownerKey: string) => void
}
```

**IndexedDB persistence required** - Without this, app restart would bypass all expiry checks and hammer ESI.

#### 2. Refresh Scheduler

Singleton that manages refresh timers:

```typescript
class RefreshScheduler {
  private timers: Map<string, NodeJS.Timeout>

  scheduleRefresh(key: string, expiresAt: number, callback: () => Promise<void>): void
  cancelRefresh(key: string): void
  cancelAll(): void

  // Called when app becomes active after being idle
  checkAllExpired(): void
}
```

#### 3. ESI Client Enhancement

Modify `esiClient.fetch()` to:
1. Return expiry metadata alongside data
2. Accept ETag for conditional requests
3. Emit expiry info for scheduler to consume

```typescript
interface ESIResponse<T> {
  data: T
  expiresAt: number
  etag: string | null
  notModified: boolean  // true if 304 response
}
```

### Store Integration

Each data store updates to:

1. **Remove hardcoded cooldowns** - No more `UPDATE_COOLDOWN_MS`
2. **Independent refresh** - No longer orchestrated by asset store
3. **Check expiry on init** - Refresh stale data on app launch
4. **Register expiry after fetch** - Store expiresAt and etag
5. **Support conditional fetch** - Pass stored ETag to ESI client

Example flow:

```typescript
// In asset-store.ts
init: async () => {
  // Load cached data from IndexedDB
  const cached = await loadFromDB()
  set({ assets: cached.assets })

  // Check if any owner's data is expired
  for (const { owner } of cached.assetsByOwner) {
    const ownerKey = `${owner.type}-${owner.id}`
    const endpoint = `/characters/${owner.characterId}/assets`
    if (expiryCacheStore.isExpired(ownerKey, endpoint)) {
      // Queue refresh (staggered to avoid rate limit burst)
      queueRefresh(() => get().updateForOwner(owner))
    }
  }
}

update: async () => {
  for (const owner of owners) {
    const ownerKey = `${owner.type}-${owner.id}`
    const endpoint = `/characters/${owner.characterId}/assets`

    // Check if we can refresh
    if (!expiryCacheStore.isExpired(ownerKey, endpoint)) {
      continue  // Still fresh, skip
    }

    const { data, expiresAt, etag } = await esiClient.fetchWithMeta(endpoint)

    // Update data
    set({ assets: data })

    // Record expiry for next check
    expiryCacheStore.setExpiry(ownerKey, endpoint, expiresAt, etag)
  }
}
```

---

## UI Changes

### Update Button Behavior

**Current:** Shows countdown to hardcoded cooldown
**New:** Shows "Up to date" or time until next expiry

```typescript
// In HeaderControls
const nextExpiry = useExpiryCacheStore(s => s.getNextExpiry())
const isUpdating = useAssetStore(s => s.isUpdating)

// Button states:
// 1. "Updating..." - while fetching
// 2. "Up to date" - all data fresh, no action needed
// 3. "Refresh" - some data expired, manual refresh available
```

### Force Refresh

Keep manual "Refresh" button for users who want immediate update:
- Bypasses expiry check
- Uses conditional request (ETag) to minimize data transfer
- Updates expiry timers after response

### Background Refresh Indicator

Optional: Small indicator when data refreshes in background:
- Brief toast/notification
- Subtle icon animation
- Can be disabled in settings

---

## Implementation Phases

### Phase 1: Expiry Tracking (Foundation)

1. Create `expiry-cache-store.ts` with IndexedDB persistence
2. Modify ESI client to return expiry metadata
3. Update stores to record expiry after fetch
4. Replace `canUpdate()` with expiry-based check
5. **Add unit tests for expiry logic**

### Phase 2: Auto-Refresh Scheduler

1. Create `RefreshScheduler` class
2. Integrate with stores to schedule refreshes
3. Handle app idle/active state transitions
4. Add rate limit awareness (don't refresh if near limit)
5. **Add integration tests with mocked ESI**

### Phase 3: UI Updates

1. Update header controls for new update logic
2. Add background refresh indicator (optional)
3. Add settings for auto-refresh behavior

### Phase 4: Optimization

1. Coordinate refresh across stores (batch related endpoints)
2. Prioritize visible data (refresh active tab first)
3. Implement request coalescing for multiple owners

---

## Testing Strategy

**Critical:** Background API calls must be thoroughly tested to prevent runaway requests.

### Unit Tests (expiry-cache-store)

```typescript
describe('ExpiryCacheStore', () => {
  it('returns true for isExpired when expiresAt is in the past')
  it('returns false for isExpired when expiresAt is in the future')
  it('persists expiry to IndexedDB')
  it('loads expiry from IndexedDB on init')
  it('clears expiry for specific owner')
  it('handles missing expiry entries gracefully')
})
```

### Unit Tests (ESI client)

```typescript
describe('ESI Client fetchWithMeta', () => {
  it('parses Expires header into expiresAt timestamp')
  it('returns ETag from response')
  it('sends If-None-Match header when etag provided')
  it('returns notModified=true on 304 response')
  it('handles missing Expires header with default expiry')
})
```

### Integration Tests (Store refresh)

```typescript
describe('Asset Store refresh', () => {
  it('does NOT call ESI when data is not expired')
  it('calls ESI when data IS expired')
  it('updates expiry after successful fetch')
  it('does not update expiry on fetch error')
  it('respects per-owner expiry independently')
})
```

### Runaway Prevention Tests

```typescript
describe('Runaway API call prevention', () => {
  it('does not refresh same endpoint twice within expiry window')
  it('does not trigger infinite refresh loop on error')
  it('respects rate limit before making requests')
  it('staggers multiple owner refreshes')
  it('stops refresh attempts after max retries')

  // Simulation test
  it('handles 100 owners without exceeding rate limit', async () => {
    const mockEsi = createMockESI()
    // Add 100 owners with expired data
    // Verify total requests stay within rate limit window
    expect(mockEsi.requestCount).toBeLessThan(150) // char-wallet limit
  })
})
```

### Mock ESI Server

Create `src/test/mocks/esi-server.ts`:

```typescript
interface MockESIOptions {
  defaultExpiry?: number  // seconds
  rateLimitTokens?: number
  failureRate?: number  // 0-1, for testing error handling
}

class MockESIServer {
  requestLog: { endpoint: string; timestamp: number }[]

  // Verify no runaway calls
  assertMaxRequests(max: number, windowMs: number): void
  assertNoRepeatedRequests(endpoint: string, windowMs: number): void
}
```

### E2E Test Scenarios

1. **Fresh app launch** - No ESI calls if all data within expiry
2. **Stale data launch** - Refreshes only expired endpoints
3. **Manual refresh** - Respects expiry, uses conditional requests
4. **Multiple owners** - Each owner's expiry tracked independently
5. **App sleep/wake** - Checks expiry on visibility change
6. **Network error** - Retries with backoff, doesn't spam

### Logging for Debug

Add structured logging for refresh decisions:

```typescript
logger.debug('Refresh check', {
  module: 'RefreshScheduler',
  ownerKey: 'character-123',
  endpoint: '/assets',
  expiresAt: 1702300000000,
  now: 1702299000000,
  decision: 'skip_not_expired',
})
```

This enables post-hoc analysis of refresh behavior in production.

---

## Edge Cases

### App Idle/Sleep

When app wakes from sleep, many endpoints may be expired:
1. Check all expiries on `visibilitychange` event
2. Queue expired endpoints with staggered timing
3. Prioritize based on which tab is active

### Rate Limit Approaching

If `X-Ratelimit-Remaining` is low:
1. Delay non-critical refreshes
2. Prioritize user-initiated actions
3. Show warning to user

### Multiple Owners

With many characters/corporations:
1. Stagger refresh times (don't refresh all at once)
2. Group by rate limit bucket
3. Consider user-configurable refresh priority

### Network Errors

On fetch failure:
1. Keep existing data
2. Retry with exponential backoff
3. Don't clear expiry (retry at next opportunity)

---

## Configuration Options

Future settings panel options:

```typescript
interface AutoRefreshSettings {
  enabled: boolean           // Master toggle
  refreshInBackground: boolean  // Refresh when tab not visible
  showNotifications: boolean    // Toast on background refresh
  priorityOwners: string[]      // Refresh these first
}
```

---

## Migration Path

1. **Backward compatible** - Stores continue working without expiry cache
2. **Gradual rollout** - Enable per-store as tested
3. **Fallback** - If scheduler fails, manual refresh still works

---

## Open Questions

1. **Refresh on app start?** - Should we check expiry and refresh immediately on launch?
2. **Offline handling?** - Queue refreshes for when connection returns?
3. **Coordinated refresh?** - Should asset store still orchestrate others, or independent?

---

## Related Files

**To Create:**
- `src/store/expiry-cache-store.ts`
- `src/lib/refresh-scheduler.ts`

**To Modify:**
- `src/api/esi-client.ts` - Return expiry metadata
- `src/store/asset-store.ts` - Integrate expiry tracking
- `src/store/market-orders-store.ts` - Integrate expiry tracking
- (all other data stores)
- `src/components/layout/MainLayout.tsx` - Update button logic
