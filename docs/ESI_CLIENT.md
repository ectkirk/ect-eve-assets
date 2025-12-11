# ESI Client Implementation

## Overview

All ESI requests go through `src/api/esi-client.ts`. Never use raw `fetch()` for ESI endpoints.

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
1. **Sequential queue** - Single requests process one at a time with 100ms delays
2. **Batch parallel** - `fetchBatch()` processes up to 20 requests concurrently per batch
3. **Tracks X-Ratelimit-Remaining** - Logs warning when < 20 tokens remain
4. **Honors Retry-After** - On 420/429, pauses ALL requests for specified duration
5. **ETag caching** - Sends `If-None-Match` for conditional requests (costs 1 token vs 2)
6. **Respects Expires** - Returns cached data without hitting ESI if not expired

### Error Codes
- **420** - Legacy error rate limit (100 errors/minute across all ESI)
- **429** - Per-route rate limit exceeded

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

## DO NOT

- Use raw `fetch()` for ESI endpoints
- Fire parallel requests to the same rate limit group
- Ignore 420/429 responses
- Make requests before `Expires` header time
