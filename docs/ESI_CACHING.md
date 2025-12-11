# ESI Caching & Rate Limiting

Reference documentation for ESI cache behavior and rate limiting. This informs our auto-refresh architecture.

**Sources:**
- [ESI Best Practices](https://github.com/esi/esi-docs/blob/main/docs/services/esi/best-practices.md)
- [ESI Rate Limiting](https://github.com/esi/esi-docs/blob/main/docs/services/esi/rate-limiting.md)
- [ESI OpenAPI Spec](https://esi.evetech.net/meta/openapi.json)

---

## Cache Headers

ESI returns these headers on successful responses:

| Header | Description |
|--------|-------------|
| `Expires` | When cached data becomes stale - **do not request before this time** |
| `Last-Modified` | When data was last updated in ESI's cache |
| `ETag` | Content hash for conditional requests |

### Critical Rule

From official ESI docs:

> "You should not update before [Expires]. If you update before, the best case scenario is that you will get a cached result, wasting resources on both side of the request. In the worst case scenario you will get new data, and it may count as circumventing the ESI caching. **Circumventing the ESI caching can get you banned from ESI.**"

### Conditional Requests

Use `If-None-Match` header with previous `ETag`:
- Returns `304 Not Modified` if unchanged
- Costs only 1 token (vs 2 for full response)
- Still updates `Expires` header

---

## Rate Limiting

ESI uses floating window rate limiting with token buckets.

### Token Costs

| Status Code | Tokens | Notes |
|-------------|--------|-------|
| 2XX | 2 | Normal successful request |
| 3XX | 1 | Conditional request (ETag match) |
| 4XX | 5 | Client errors (except 429) |
| 429 | 0 | Rate limited |
| 5XX | 0 | Server errors |

### Rate Limit Groups

Each endpoint belongs to a rate limit group. Limits are per `applicationID:characterID` pair.

| Group | Tokens/Window | Endpoints |
|-------|---------------|-----------|
| `char-asset` | 1800/15m | Character assets |
| `corp-asset` | 1800/15m | Corporation assets |
| `char-industry` | 600/15m | Character industry jobs, blueprints |
| `corp-industry` | 600/15m | Corporation industry jobs, blueprints |
| `char-contract` | 600/15m | Character contracts |
| `corp-contract` | 600/15m | Corporation contracts |
| `char-location` | 1200/15m | Character clones, location |
| `char-detail` | 600/15m | Character implants, attributes |
| `char-wallet` | 150/15m | Character wallet, journal, transactions |
| `corp-wallet` | 300/15m | Corporation wallets |
| `char-market` | N/A | Character orders (no new rate limiting yet) |
| `corp-market` | N/A | Corporation orders (no new rate limiting yet) |

### Response Headers

```
X-Ratelimit-Group: char-asset
X-Ratelimit-Limit: 1800/15m
X-Ratelimit-Remaining: 1798
X-Ratelimit-Used: 2
```

On 429: `Retry-After: <seconds>`

### Legacy Error Rate Limit

For endpoints without new rate limiting:
- Max 100 non-2xx/3xx responses per minute
- Exceeding returns `420` on ALL ESI routes

---

## Endpoint Cache Times

From ESI OpenAPI spec (`x-cached-seconds`). Verified 2025-12-11.

| Endpoint | Cache (seconds) | Cache (human) | Rate Group |
|----------|-----------------|---------------|------------|
| `/characters/{id}/assets/` | 3600 | 1 hour | char-asset |
| `/corporations/{id}/assets/` | 3600 | 1 hour | corp-asset |
| `/characters/{id}/orders/` | 1200 | 20 min | char-market |
| `/corporations/{id}/orders/` | 1200 | 20 min | corp-market |
| `/characters/{id}/industry/jobs/` | 300 | 5 min | char-industry |
| `/corporations/{id}/industry/jobs/` | 300 | 5 min | corp-industry |
| `/characters/{id}/contracts/` | 300 | 5 min | char-contract |
| `/corporations/{id}/contracts/` | 300 | 5 min | corp-contract |
| `/characters/{id}/clones/` | 120 | 2 min | char-location |
| `/characters/{id}/implants/` | 120 | 2 min | char-detail |
| `/characters/{id}/wallet/` | 120 | 2 min | char-wallet |
| `/corporations/{id}/wallets/` | 300 | 5 min | corp-wallet |
| `/characters/{id}/blueprints/` | 3600 | 1 hour | char-industry |
| `/corporations/{id}/blueprints/` | 3600 | 1 hour | corp-industry |

**Source:** `https://esi.evetech.net/latest/swagger.json` → `paths[endpoint].get["x-cached-seconds"]`

**Note:** Implementation uses actual `Expires` header from responses, not these values.

---

## Best Practices Summary

1. **Respect `Expires`** - Never request before cache expires
2. **Use ETags** - Conditional requests cost fewer tokens
3. **Track rate limits** - Monitor `X-Ratelimit-Remaining`
4. **Stagger requests** - Don't burst all requests at once
5. **Handle 429/420** - Respect `Retry-After`, back off globally

---

## Related Documentation

- [ESI Client Implementation](./ESI_CLIENT.md)
- [Store Architecture](./STORES.md)
- [ESI API Reference](./ESI_API_DOCUMENTATION.md)
