# EVE Online ESI API Documentation

## Overview

The **ESI (EVE Swagger Interface)** is the official RESTful API for EVE Online third-party development. It replaces the older XML API and CREST systems.

## Official Documentation

- **ESI Overview**: https://developers.eveonline.com/docs/services/esi/overview/
- **Rate Limiting**: https://developers.eveonline.com/docs/services/esi/rate-limiting/
- **SSO Guide**: https://developers.eveonline.com/docs/services/sso/
- **API Explorer**: https://developers.eveonline.com/api-explorer
- **OpenAPI Spec**: https://esi.evetech.net/meta/openapi.json?compatibility_date=2025-11-06
- **Swagger UI**: https://esi.evetech.net/ui/
- **Issues/Support**: https://github.com/esi/esi-issues
- **Developer Portal**: https://developers.eveonline.com/

## Related Project Documentation

- [ESI Client Implementation](./ESI_CLIENT.md) - Our ESI client implementation
- [ESI Caching & Rate Limiting](./ESI_CACHING.md) - Cache times and rate limit groups
- [EVE SSO Reference](./eve-sso.md) - OAuth authentication flow
- [edencom.net API](./REF_API_DOCUMENTATION.md) - Types, prices, universe names
- [everef.net API](./EVEREF_API_DOCUMENTATION.md) - Static data dumps

---

## Authentication (SSO)

The EVE Single Sign-On (SSO) service handles authentication using **OAuth 2.0**. Some ESI endpoints are public, but many require authentication with specific scopes.

### SSO Endpoints

Fetch dynamically from: `https://login.eveonline.com/.well-known/oauth-authorization-server`

Key endpoints:
- **Authorization**: `https://login.eveonline.com/v2/oauth/authorize`
- **Token**: `https://login.eveonline.com/v2/oauth/token`
- **JWKS**: Retrieved from metadata endpoint

### OAuth Flow Overview

1. **Register Application**: Get `client_id` and `client_secret` from EVE Developers Portal
2. **Authorization Request**: Redirect user to SSO with requested scopes
3. **User Consent**: User logs in, selects character, approves scopes
4. **Authorization Code**: SSO redirects back with authorization code
5. **Token Exchange**: Exchange code for access token + refresh token
6. **API Access**: Use access token in `Authorization: Bearer <token>` header

### Authorization Code Flow

**Step 1: Redirect to SSO**

```
GET https://login.eveonline.com/v2/oauth/authorize?
    response_type=code&
    client_id=<your_client_id>&
    redirect_uri=<your_redirect_uri>&
    scope=<space-separated-scopes>&
    state=<random_csrf_token>
```

**Step 2: Exchange Code for Tokens**

```http
POST https://login.eveonline.com/v2/oauth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=<authorization_code>
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 1199,
  "refresh_token": "abc123..."
}
```

### Authorization Code Flow with PKCE

For desktop/mobile apps that can't securely store client secrets.

**Generate Code Challenge:**
```java
// 1. Generate code verifier (32 random bytes, base64url encoded)
byte[] randomBytes = new byte[32];
SecureRandom.getInstanceStrong().nextBytes(randomBytes);
String codeVerifier = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);

// 2. Generate code challenge (SHA-256 hash of verifier, base64url encoded, no padding)
MessageDigest digest = MessageDigest.getInstance("SHA-256");
byte[] hash = digest.digest(codeVerifier.getBytes(StandardCharsets.UTF_8));
String codeChallenge = Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
```

**Authorization Request (additional params):**
```
code_challenge=<code_challenge>&
code_challenge_method=S256
```

**Token Request (no basic auth, include verifier):**
```
grant_type=authorization_code&
code=<code>&
client_id=<client_id>&
code_verifier=<code_verifier>
```

### Refreshing Tokens

```http
POST https://login.eveonline.com/v2/oauth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=<refresh_token>
```

### JWT Token Validation

Access tokens are JWTs signed by EVE SSO. To validate:

1. **Fetch JWKS** from metadata endpoint
2. **Verify signature** using RSA public key
3. **Check issuer** (`iss`): Must be `login.eveonline.com` or `https://login.eveonline.com`
4. **Check audience** (`aud`): Must contain your `client_id` and `"EVE Online"`
5. **Check expiration** (`exp`): Unix timestamp must be in the future

**JWT Claims:**
- `sub`: `CHARACTER:EVE:<character_id>` - Character ID
- `name`: Character name
- `scp`: Array of granted scopes

---

## Versioning

ESI uses **compatibility date versioning** instead of URL-based versioning.

### Setting Compatibility Date

**Header (preferred):**
```
X-Compatibility-Date: 2025-11-06
```

**Query Parameter (fallback):**
```
?compatibility_date=2025-11-06
```

If not specified, the oldest available compatibility date is used.

### Important Notes

- Date format: `YYYY-MM-DD` (ISO format)
- Cannot be in the future
- Cannot be below minimum threshold (announced via dev blogs)
- API changes at **11:00 UTC** daily
- Recommended: Use `now() - 11 hours` for current date

### Breaking vs Non-Breaking Changes

**Breaking (new compatibility date required):**
- Removing request parameters
- Removing response fields/headers/enum values
- Adding/changing required parameters
- Changing types

**Non-Breaking (same compatibility date):**
- Adding optional request parameters
- Adding response fields/headers/enum values

---

## Rate Limiting

ESI implements **floating window rate limiting** with a token bucket system.

### Bucket System

Each rate limit is scoped to:
- **Rate limit group**: Each route belongs to a group
- **User ID**:
  - Authenticated: `<applicationID>:<characterID>`
  - Unauthenticated: `<sourceIP>` (or `<sourceIP>:<applicationID>` if token provided)

### Token Costs

| Status Code | Token Cost | Reasoning |
|-------------|------------|-----------|
| 2XX | 2 tokens | Normal request |
| 3XX | 1 token | Promotes If-Modified-Since usage |
| 4XX | 5 tokens | Discourages user errors |
| 429 | 0 tokens | Rate limited (no additional penalty) |
| 5XX | 0 tokens | Server errors (no penalty) |

### Rate Limit Headers

**On all rate-limited responses:**
```
X-Ratelimit-Group: <group_name>
X-Ratelimit-Limit: 150/15m
X-Ratelimit-Remaining: 148
X-Ratelimit-Used: 2
```

**On 429 responses:**
```
Retry-After: <seconds_until_retry>
```

### Legacy Error Rate Limit

For routes without new rate limiting:
- Max 100 non-2xx/3xx responses per minute
- Exceeding returns 420 on ALL ESI routes

### OpenAPI Extension

```json
"x-rate-limit": {
  "group": "character-assets",
  "window-size": "15m",
  "max-tokens": 150
}
```

### Best Practices

1. Don't constantly operate at the limit
2. Slow down when `X-Ratelimit-Remaining` approaches zero
3. Spread requests over time (avoid constant bursting)
4. Use staggered scheduling (not `*/5` cron jobs)
5. Respect cache times

---

## Pagination

ESI uses three pagination methods depending on the endpoint.

### 1. Cursor-Based Pagination (Preferred for new endpoints)

Uses tokens to navigate through datasets ordered by modification time.

**Request Parameters:**
- `limit`: Max records to retrieve
- `before`: Get older records (token from previous response)
- `after`: Get newer records (token from previous response)

**Response Format:**
```json
{
  "records": [...],
  "cursor": {
    "before": "token_for_older_records",
    "after": "token_for_newer_records"
  }
}
```

**Initial Data Collection:**
1. Request without pagination params (get most recent)
2. Save `after` token for later monitoring
3. Use `before` token to fetch older records
4. Repeat until empty response

**Monitoring for Updates:**
1. Use saved `after` token
2. Process new/modified records
3. Update saved `after` token

**Handling Duplicates:**
- `before` results: Keep existing stored record (it's newer)
- `after` results: Replace stored record (new one is newer)

### 2. X-Pages Pagination (Traditional)

Page-number based pagination starting at page 1.

**Request:**
```
GET /endpoint?page=1
```

**Response Headers:**
```
X-Pages: 5
```

**Caching Caveat:** If cache expires between pages, you may get duplicates. Solution: Check if page 1 is close to expiring, wait for refresh, then fetch all pages.

### 3. From-ID Pagination (Historical data)

Navigate backwards through chronologically ordered data.

**Request:**
```
GET /endpoint?from_id=<last_transaction_id>
```

**Flow:**
1. Initial request without `from_id` (get most recent)
2. Use last record's ID as `from_id` for next request
3. Stop when response only contains the `from_id` record

---

## Caching

ESI acts as both HTTP handler and cache manager.

### Response Headers

| Header | Description |
|--------|-------------|
| `Expires` | When cached data expires (don't request before this) |
| `Last-Modified` | When data was last updated |
| `ETag` | Hash of content for conditional requests |

### Conditional Requests

Use `If-None-Match` header with previous `ETag`:
```
If-None-Match: "abc123"
```

Returns `304 Not Modified` if unchanged (saves bandwidth, costs only 1 token).

### Important Notes

- **Do not request before Expires** - best case: wasted resources; worst case: ban for cache circumvention
- Paginated resources should have same `Last-Modified` across all pages
- POST methods typically have no cache headers (but may have internal cache)

---

## API Endpoints Summary

### Character Endpoints (Authenticated)

| Endpoint | Scope Required |
|----------|----------------|
| `GET /characters/{character_id}/` | (public info only) |
| `GET /characters/{character_id}/assets/` | `esi-assets.read_assets.v1` |
| `POST /characters/{character_id}/assets/locations/` | `esi-assets.read_assets.v1` |
| `POST /characters/{character_id}/assets/names/` | `esi-assets.read_assets.v1` |
| `GET /characters/{character_id}/attributes/` | `esi-skills.read_skills.v1` |
| `GET /characters/{character_id}/blueprints/` | `esi-characters.read_blueprints.v1` |
| `GET /characters/{character_id}/clones/` | `esi-clones.read_clones.v1` |
| `GET /characters/{character_id}/contacts/` | `esi-characters.read_contacts.v1` |
| `GET /characters/{character_id}/contracts/` | `esi-contracts.read_character_contracts.v1` |
| `GET /characters/{character_id}/fatigue/` | `esi-characters.read_fatigue.v1` |
| `GET /characters/{character_id}/fittings/` | `esi-fittings.read_fittings.v1` |
| `GET /characters/{character_id}/fleet/` | `esi-fleets.read_fleet.v1` |
| `GET /characters/{character_id}/fw/stats/` | `esi-characters.read_fw_stats.v1` |
| `GET /characters/{character_id}/implants/` | `esi-clones.read_implants.v1` |
| `GET /characters/{character_id}/industry/jobs/` | `esi-industry.read_character_jobs.v1` |
| `GET /characters/{character_id}/killmails/recent/` | `esi-killmails.read_killmails.v1` |
| `GET /characters/{character_id}/location/` | `esi-location.read_location.v1` |
| `GET /characters/{character_id}/loyalty/points/` | `esi-characters.read_loyalty.v1` |
| `GET /characters/{character_id}/mail/` | `esi-mail.read_mail.v1` |
| `GET /characters/{character_id}/notifications/` | `esi-characters.read_notifications.v1` |
| `GET /characters/{character_id}/online/` | `esi-location.read_online.v1` |
| `GET /characters/{character_id}/orders/` | `esi-markets.read_character_orders.v1` |
| `GET /characters/{character_id}/orders/history/` | `esi-markets.read_character_orders.v1` |
| `GET /characters/{character_id}/ship/` | `esi-location.read_ship_type.v1` |
| `GET /characters/{character_id}/skillqueue/` | `esi-skills.read_skillqueue.v1` |
| `GET /characters/{character_id}/skills/` | `esi-skills.read_skills.v1` |
| `GET /characters/{character_id}/standings/` | `esi-characters.read_standings.v1` |
| `GET /characters/{character_id}/wallet/` | `esi-wallet.read_character_wallet.v1` |
| `GET /characters/{character_id}/wallet/journal/` | `esi-wallet.read_character_wallet.v1` |
| `GET /characters/{character_id}/wallet/transactions/` | `esi-wallet.read_character_wallet.v1` |

### Corporation Endpoints (Authenticated)

| Endpoint | Scope Required |
|----------|----------------|
| `GET /corporations/{corporation_id}/assets/` | `esi-assets.read_corporation_assets.v1` |
| `GET /corporations/{corporation_id}/blueprints/` | `esi-corporations.read_blueprints.v1` |
| `GET /corporations/{corporation_id}/contacts/` | `esi-corporations.read_contacts.v1` |
| `GET /corporations/{corporation_id}/containers/logs/` | `esi-corporations.read_container_logs.v1` |
| `GET /corporations/{corporation_id}/contracts/` | `esi-contracts.read_corporation_contracts.v1` |
| `GET /corporations/{corporation_id}/customs_offices/` | `esi-planets.read_customs_offices.v1` |
| `GET /corporations/{corporation_id}/divisions/` | `esi-corporations.read_divisions.v1` |
| `GET /corporations/{corporation_id}/facilities/` | `esi-corporations.read_facilities.v1` |
| `GET /corporations/{corporation_id}/industry/jobs/` | `esi-industry.read_corporation_jobs.v1` |
| `GET /corporations/{corporation_id}/killmails/recent/` | `esi-killmails.read_corporation_killmails.v1` |
| `GET /corporations/{corporation_id}/members/` | `esi-corporations.read_corporation_membership.v1` |
| `GET /corporations/{corporation_id}/membertracking/` | `esi-corporations.track_members.v1` |
| `GET /corporations/{corporation_id}/orders/` | `esi-markets.read_corporation_orders.v1` |
| `GET /corporations/{corporation_id}/orders/history/` | `esi-markets.read_corporation_orders.v1` |
| `GET /corporations/{corporation_id}/roles/` | `esi-corporations.read_corporation_membership.v1` |
| `GET /corporations/{corporation_id}/wallets/` | `esi-wallet.read_corporation_wallets.v1` |
| `GET /corporations/{corporation_id}/wallets/{division}/journal/` | `esi-wallet.read_corporation_wallets.v1` |
| `GET /corporations/{corporation_id}/wallets/{division}/transactions/` | `esi-wallet.read_corporation_wallets.v1` |

### Public Endpoints (No Auth Required)

| Endpoint | Description |
|----------|-------------|
| `GET /alliances/` | List all alliance IDs |
| `GET /alliances/{alliance_id}/` | Alliance info |
| `GET /alliances/{alliance_id}/corporations/` | Alliance member corps |
| `GET /characters/{character_id}/` | Public character info |
| `POST /characters/affiliation/` | Batch character affiliation lookup |
| `GET /corporations/{corporation_id}/` | Public corporation info |
| `GET /markets/{region_id}/orders/` | Market orders in region |
| `GET /markets/{region_id}/history/` | Market history in region |
| `GET /markets/prices/` | Average market prices |
| `GET /markets/groups/` | Market groups |
| `GET /contracts/public/{region_id}/` | Public contracts |
| `GET /universe/types/` | All type IDs |
| `GET /universe/types/{type_id}/` | Type info |
| `GET /universe/systems/` | All system IDs |
| `GET /universe/systems/{system_id}/` | System info |
| `GET /universe/regions/` | All region IDs |
| `GET /universe/regions/{region_id}/` | Region info |
| `GET /universe/stations/{station_id}/` | Station info |
| `GET /universe/structures/{structure_id}/` | Structure info (may need auth) |
| `GET /route/{origin}/{destination}/` | Route between systems |
| `GET /status/` | Server status |

---

## Best Practices

### User-Agent Header

**Required format** (one or more of):
- Email address (strongly preferred): `foo@example.com`
- App name with version: `AppName/1.2.3`
- Source code URL: `+https://github.com/your/repository`
- Discord username: `discord:username`
- EVE character: `eve:charactername`

**Example:**
```
User-Agent: jEveAssets/7.0.0 (contact@example.com; +https://github.com/GoldenGnu/jeveassets)
```

**For browser apps:** Use `X-User-Agent` header (Chrome drops `User-Agent` on fetch requests)

**Fallback:** Use `user_agent` query parameter (URL-encoded)

### Error Handling

1. Respect `Retry-After` header on 429 responses
2. Implement exponential backoff for 5XX errors
3. Don't retry 4XX errors without fixing the request
4. Monitor `X-ESI-Error-Limit-Remain` header

### Caching Strategy

1. Store and respect `Expires` header
2. Use `ETag` / `If-None-Match` for conditional requests
3. Cache JWKS metadata (5 minute TTL recommended)
4. Don't request more frequently than cache allows

---

## Migration Notes for jEveAssets

### Key Changes from Old API

1. **Authentication**: OAuth 2.0 with JWT tokens (replaces API keys)
2. **Versioning**: Compatibility date headers instead of URL versioning
3. **Rate Limiting**: Token bucket system with floating windows
4. **Pagination**: Multiple methods (cursor, X-Pages, from-id)

### Required Scopes for jEveAssets Features

Based on typical asset management functionality:

```
esi-assets.read_assets.v1
esi-markets.read_character_orders.v1
esi-wallet.read_character_wallet.v1
esi-characters.read_blueprints.v1
esi-industry.read_character_jobs.v1
esi-contracts.read_character_contracts.v1
esi-skills.read_skills.v1
esi-skills.read_skillqueue.v1
esi-location.read_location.v1
esi-location.read_ship_type.v1
esi-clones.read_clones.v1
esi-clones.read_implants.v1
esi-universe.read_structures.v1
```

### Implementation Checklist

- [ ] Implement OAuth 2.0 flow (with PKCE for desktop app)
- [ ] Store and manage refresh tokens securely
- [ ] Add `X-Compatibility-Date` header to all requests
- [ ] Add proper `User-Agent` header
- [ ] Implement rate limit tracking and backoff
- [ ] Handle all pagination types
- [ ] Implement conditional requests (ETag/If-None-Match)
- [ ] Respect cache expiry times
- [ ] Handle JWT token validation

---

## Meta Endpoints

ESI provides meta endpoints for API introspection, health monitoring, and changelog tracking.

### Get Changelog

```
GET https://esi.evetech.net/meta/changelog
```

Returns the changelog of API changes organized by date.

**Rate Limit Group:** `meta` (150 tokens / 15 minutes)

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `X-Compatibility-Date` | Yes | e.g., `2025-11-06` |
| `Accept-Language` | No | `en`, `de`, `fr`, `ja`, `ru`, `zh`, `ko`, `es` (default: `en`) |
| `If-None-Match` | No | ETag for conditional request |
| `X-Tenant` | No | Tenant ID (default: `tranquility`) |

**Response:**
```json
{
  "changelog": {
    "2025-08-26": [
      {
        "compatibility_date": "2025-08-26",
        "description": "Updated response schema.",
        "method": "GET",
        "path": "/meta/changelog",
        "type": "breaking"
      }
    ]
  }
}
```

**Change Types:** `breaking` or non-breaking changes

---

### Get Compatibility Dates

```
GET https://esi.evetech.net/meta/compatibility-dates
```

Returns a list of all valid compatibility dates.

**Rate Limit Group:** `meta` (150 tokens / 15 minutes)

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `X-Compatibility-Date` | Yes | e.g., `2025-11-06` |
| `Accept-Language` | No | Language preference |
| `If-None-Match` | No | ETag for conditional request |
| `X-Tenant` | No | Tenant ID (default: `tranquility`) |

**Response:**
```json
{
  "compatibility_dates": [
    "2025-08-26",
    "2025-11-06"
  ]
}
```

Use this to discover valid compatibility dates and ensure your application uses a supported date.

---

### Get Health Status

```
GET https://esi.evetech.net/meta/status
```

Returns the health status of each API route.

**Rate Limit Group:** `meta` (150 tokens / 15 minutes)

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `X-Compatibility-Date` | Yes | e.g., `2025-11-06` |
| `Accept-Language` | No | Language preference |
| `If-None-Match` | No | ETag for conditional request |
| `X-Tenant` | No | Tenant ID (default: `tranquility`) |

**Response:**
```json
{
  "routes": [
    {
      "method": "GET",
      "path": "/characters/{character_id}/assets/",
      "status": "OK"
    },
    {
      "method": "GET",
      "path": "/markets/{region_id}/orders/",
      "status": "Degraded"
    }
  ]
}
```

**Status Values:**
| Status | Description |
|--------|-------------|
| `Unknown` | Status not determined |
| `OK` | Route is working as expected |
| `Degraded` | Route is working, but with degraded performance |
| `Down` | Route is not working |
| `Recovering` | Route is recovering from issues |

**Use Cases:**
- Check API health before making requests
- Display status indicators in your application
- Skip requests to degraded/down endpoints
- Implement automatic retry logic based on status

---

### Get OpenAPI Specification

```
GET https://esi.evetech.net/meta/openapi.json?compatibility_date=2025-11-06
```

Returns the full OpenAPI 3.0 specification for ESI.

**Use Cases:**
- Generate API clients automatically
- Discover all available endpoints and parameters
- Get rate limit information via `x-rate-limit` extension
- Build documentation or tooling

---

## Endpoint Specifications

This section provides detailed response schemas for commonly used endpoints. For the complete OpenAPI spec, see: `https://esi.evetech.net/latest/swagger.json`

### Market Orders

#### GET /characters/{character_id}/orders/

List open market orders placed by a character.

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `order_id` | ✓ | int64 | Unique order ID |
| `type_id` | ✓ | int32 | Item type ID |
| `location_id` | ✓ | int64 | Station/structure ID where order was placed |
| `region_id` | ✓ | int32 | Region ID |
| `price` | ✓ | double | Cost per unit |
| `volume_total` | ✓ | int32 | Original quantity |
| `volume_remain` | ✓ | int32 | Remaining quantity |
| `duration` | ✓ | int32 | Days order is valid |
| `issued` | ✓ | datetime | When order was created |
| `range` | ✓ | string | Order range: `station`, `solarsystem`, `region`, `1`-`40` (jumps) |
| `is_corporation` | ✓ | boolean | **True if placed on behalf of a corporation** |
| `is_buy_order` | | boolean | True if buy order (default false = sell) |
| `escrow` | | double | ISK in escrow (buy orders only) |
| `min_volume` | | int32 | Minimum fill quantity (buy orders only) |

- **Scope**: `esi-markets.read_character_orders.v1`
- **Cache**: 1200 seconds (20 minutes)
- **Paginated**: No (max 305 items)

---

#### GET /characters/{character_id}/orders/history/

List cancelled and expired market orders (up to 90 days).

Same fields as `/orders/` plus:

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `state` | ✓ | string | `cancelled` or `expired` |

- **Scope**: `esi-markets.read_character_orders.v1`
- **Cache**: 3600 seconds (1 hour)
- **Paginated**: Yes (X-Pages)

---

#### GET /corporations/{corporation_id}/orders/

List open market orders placed on behalf of a corporation.

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `order_id` | ✓ | int64 | Unique order ID |
| `type_id` | ✓ | int32 | Item type ID |
| `location_id` | ✓ | int64 | Station/structure ID where order was placed |
| `region_id` | ✓ | int32 | Region ID |
| `price` | ✓ | double | Cost per unit |
| `volume_total` | ✓ | int32 | Original quantity |
| `volume_remain` | ✓ | int32 | Remaining quantity |
| `duration` | ✓ | int32 | Days order is valid |
| `issued` | ✓ | datetime | When order was created |
| `range` | ✓ | string | Order range |
| `issued_by` | ✓ | int32 | **Character ID who placed the order** |
| `wallet_division` | ✓ | int32 | **Corporation wallet division (1-7)** |
| `is_buy_order` | | boolean | True if buy order |
| `escrow` | | double | ISK in escrow (buy orders only) |
| `min_volume` | | int32 | Minimum fill quantity (buy orders only) |

**Note**: Corp orders do NOT have `is_corporation` field (implicitly always true).

- **Scope**: `esi-markets.read_corporation_orders.v1`
- **Roles Required**: `Accountant` or `Trader`
- **Cache**: 1200 seconds (20 minutes)
- **Paginated**: Yes (X-Pages)

---

#### GET /corporations/{corporation_id}/orders/history/

List cancelled and expired corporation market orders (up to 90 days).

Same fields as `/corporations/{corporation_id}/orders/` plus:

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `state` | ✓ | string | `cancelled` or `expired` |

- **Scope**: `esi-markets.read_corporation_orders.v1`
- **Roles Required**: `Accountant` or `Trader`
- **Cache**: 3600 seconds (1 hour)
- **Paginated**: Yes (X-Pages)

---

#### GET /markets/{region_id}/orders/

List all public market orders in a region.

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `order_id` | ✓ | int64 | Unique order ID |
| `type_id` | ✓ | int32 | Item type ID |
| `location_id` | ✓ | int64 | Station/structure ID |
| `system_id` | ✓ | int32 | Solar system ID |
| `price` | ✓ | double | Cost per unit |
| `volume_total` | ✓ | int32 | Original quantity |
| `volume_remain` | ✓ | int32 | Remaining quantity |
| `duration` | ✓ | int32 | Days order is valid |
| `issued` | ✓ | datetime | When order was created |
| `range` | ✓ | string | Order range |
| `is_buy_order` | ✓ | boolean | True if buy order |
| `min_volume` | ✓ | int32 | Minimum fill quantity |

Query parameters:
- `order_type`: `buy`, `sell`, or `all` (default: `all`)
- `type_id`: Filter by item type (optional)

- **Scope**: None (public)
- **Cache**: 300 seconds (5 minutes)
- **Paginated**: Yes (X-Pages)

---

#### Character vs Corporation Orders: Key Differences

| Field | Character Orders | Corporation Orders |
|-------|------------------|-------------------|
| `is_corporation` | ✓ Present (indicates if corp order) | ✗ Not present (always corp) |
| `issued_by` | ✗ Not present | ✓ Present (who placed it) |
| `wallet_division` | ✗ Not present | ✓ Present (1-7) |

**Important**: Character orders include both personal AND corporation orders placed by that character. Use `is_corporation: true` to identify corp orders in the character endpoint response.

---

## Resources

### Official EVE Developer Resources

| Resource | URL |
|----------|-----|
| ESI Overview | https://developers.eveonline.com/docs/services/esi/overview/ |
| Rate Limiting Guide | https://developers.eveonline.com/docs/services/esi/rate-limiting/ |
| SSO Documentation | https://developers.eveonline.com/docs/services/sso/ |
| API Explorer | https://developers.eveonline.com/api-explorer |
| Developer Portal | https://developers.eveonline.com/ |
| ESI Issues (GitHub) | https://github.com/esi/esi-issues |
| SSO Metadata | https://login.eveonline.com/.well-known/oauth-authorization-server |
| OpenAPI Spec (JSON) | https://esi.evetech.net/meta/openapi.json?compatibility_date=2025-11-06 |
| Swagger UI | https://esi.evetech.net/ui/ |

### Login Button Assets

| Style | URL |
|-------|-----|
| White Large | https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-white-large.png |
| White Small | https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-white-small.png |
| Black Large | https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-black-large.png |
| Black Small | https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-black-small.png |
