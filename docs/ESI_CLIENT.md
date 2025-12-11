# ESI Client Implementation

## Overview

All ESI requests go through `src/api/esi-client.ts`, which delegates to the Electron main process via IPC. Never use raw `fetch()` for ESI endpoints.

## Architecture

```
Renderer (esi-client.ts) → IPC → Main Process (electron/services/esi/) → fetch() → ESI API
                                        ↓
                          Rate limit state (persisted to disk)
```

The main process handles:
- Per-group rate limit tracking from response headers
- ETag/Expires caching
- Request queuing with throttling
- Token acquisition via IPC callback to renderer

## Usage

```typescript
import { esiClient } from '@/api/esi-client'

// Authenticated request
const assets = await esiClient.fetch<ESIAsset[]>('/characters/123/assets/')

// With specific character auth
const corpAssets = await esiClient.fetch<ESIAsset[]>('/corporations/456/assets/', {
  characterId: 123
})

// Public endpoint
const prices = await esiClient.fetchPublic<ESIMarketPrice[]>('/markets/prices/')

// Paginated endpoint
const allAssets = await esiClient.fetchWithPagination<ESIAsset>('/characters/123/assets/')

// With metadata (expiresAt, etag, notModified)
const result = await esiClient.fetchWithMeta<ESIAsset[]>('/characters/123/assets/', {
  characterId: 123,
  etag: '"previous-etag"'  // Optional: for conditional requests
})

// Batch parallel requests (20 concurrent by default)
const results = await esiClient.fetchBatch(
  contractIds,
  (id) => getContractItems(characterId, id),
  { batchSize: 20, onProgress: (done, total) => console.log(`${done}/${total}`) }
)
```

## Rate Limiting Compliance

The client implements ESI rate limiting per https://developers.eveonline.com/docs/services/esi/rate-limiting/

### Token Costs
| Status | Cost |
|--------|------|
| 2XX | 2 tokens |
| 3XX | 1 token (ETag cache hit) |
| 4XX | 5 tokens |
| 429/5XX | 0 tokens |

### What the Client Does
1. **Request queue** - Processes requests sequentially with throttle delays
2. **Per-group tracking** - Tracks X-Ratelimit-Remaining per character and group
3. **Proactive throttling** - Slows down as limits approach (< 20% remaining)
4. **Honors Retry-After** - On 420/429, pauses ALL requests for specified duration
5. **ETag caching** - Sends `If-None-Match` for conditional requests (costs 1 token vs 2)
6. **Respects Expires** - Returns cached data without hitting ESI if not expired
7. **State persistence** - Rate limit state saved across app restarts

### Error Codes
- **420** - Legacy error rate limit (100 errors/minute across all ESI)
- **429** - Per-route rate limit exceeded

## Token Flow

Authentication tokens are managed in the renderer (auth-store) and provided to main on demand:

1. Main process needs to make authenticated request
2. Main sends `esi:request-token` IPC with characterId
3. Renderer's `setupESITokenProvider()` responds with token
4. If token expired, renderer refreshes it first
5. Main receives token and makes request

## Headers Sent

```
Authorization: Bearer <token>         (authenticated only)
Content-Type: application/json
X-Compatibility-Date: 2025-11-06
User-Agent: ECTEVEAssets/0.2.0 (...)
If-None-Match: "<etag>"               (if cached)
```

## Endpoint Files

All endpoint files import from `esi-client`:

| File | Endpoints |
|------|-----------|
| `endpoints/assets.ts` | Character assets, asset names |
| `endpoints/corporation.ts` | Corp assets, character roles |
| `endpoints/market.ts` | Character orders, regional prices |
| `endpoints/industry.ts` | Character industry jobs |
| `endpoints/contracts.ts` | Character contracts |
| `endpoints/clones.ts` | Character clones, implants |
| `endpoints/universe.ts` | Structure resolution |

## Structure Resolution

Player structures require individual ESI calls. The `resolveStructures()` function:
1. Checks cache first (IndexedDB)
2. Processes uncached structures sequentially
3. Stops immediately if rate limited
4. Caches resolved structures permanently

## Adding New Endpoints

```typescript
// In endpoints/foo.ts
import { esiClient } from '../esi-client'

export async function getFoo(characterId: number): Promise<Foo> {
  return esiClient.fetch<Foo>(`/characters/${characterId}/foo/`, { characterId })
}

// For public endpoints
export async function getPublicFoo(): Promise<Foo> {
  return esiClient.fetchPublic<Foo>('/foo/')
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/api/esi-client.ts` | Renderer-side IPC wrapper |
| `electron/services/esi/index.ts` | Main process service |
| `electron/services/esi/cache.ts` | ETag/Expires cache |
| `electron/services/esi/queue.ts` | Request queue with throttling |
| `electron/services/esi/rate-limit.ts` | Per-group rate limit tracking |
| `electron/services/esi/types.ts` | Shared TypeScript types |

## DO NOT

- Use raw `fetch()` for ESI endpoints
- Fire parallel requests to the same rate limit group
- Ignore 420/429 responses
- Make requests before `Expires` header time
- Call ESI directly from renderer (always use esiClient)
