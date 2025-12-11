# Market Orders Store

Manages market buy/sell orders for characters and corporations.

## Overview

| Property | Value |
|----------|-------|
| **File** | `src/store/market-orders-store.ts` |
| **Endpoint File** | `src/api/endpoints/market.ts` |
| **IndexedDB** | `ecteveassets-market-orders` (version 2) |
| **Update Cooldown** | 5 minutes |
| **Owner Types** | Character + Corporation |

## ESI Endpoints

| Endpoint | Method | Paginated | Scope |
|----------|--------|-----------|-------|
| `/characters/{character_id}/orders/` | GET | Yes | `esi-markets.read_character_orders.v1` |
| `/corporations/{corporation_id}/orders/` | GET | Yes | `esi-markets.read_corporation_orders.v1` |

Corporation endpoint requires character to have `Accountant` or `Trader` role.

## Data Types

### ESIMarketOrder (character orders)

```typescript
interface ESIMarketOrder {
  order_id: number       // Unique order identifier
  type_id: number        // Item type ID
  region_id: number      // Region ID
  location_id: number    // Station/structure ID
  price: number          // ISK per unit
  volume_total: number   // Original order volume
  volume_remain: number  // Remaining volume
  issued: string         // ISO date when placed
  duration: number       // Days until expiration
  range: string          // Order range (station, region, etc.)
  is_buy_order: boolean  // true = buy, false = sell
  is_corporation: boolean // Placed on behalf of corp
  min_volume?: number    // Minimum fill quantity
  escrow?: number        // ISK in escrow (buy orders)
}
```

### ESICorporationMarketOrder (corporation orders)

```typescript
interface ESICorporationMarketOrder {
  order_id: number
  type_id: number
  region_id: number
  location_id: number
  price: number
  volume_total: number
  volume_remain: number
  issued: string
  duration: number
  range: string
  is_buy_order: boolean
  min_volume?: number
  escrow?: number
  issued_by: number        // Character ID who placed the order
  wallet_division: number  // Corp wallet division (1-7)
}
```

### MarketOrder (union type)

```typescript
type MarketOrder = ESIMarketOrder | ESICorporationMarketOrder
```

### OwnerOrders (internal)

```typescript
interface OwnerOrders {
  owner: Owner
  orders: MarketOrder[]
}
```

## Data Flow

### Update (`update()`)

```
1. Check cooldown (5 minutes)
2. Get all owners (characters and corporations)
3. For each owner:
   a. If corporation: call getCorporationOrders(characterId, corporationId)
   b. If character: call getCharacterOrders(characterId)
   c. Add to results array
4. Save to IndexedDB
```

### New Owner (`updateForOwner()`)

```
1. Fetch orders based on owner type:
   - Corporation: getCorporationOrders(characterId, corporationId)
   - Character: getCharacterOrders(characterId)
2. Merge with existing data
3. Save to IndexedDB
```

## Storage

### IndexedDB Schema

**Database:** `ecteveassets-market-orders` (version 2)

| Object Store | Key Path | Contents |
|--------------|----------|----------|
| `orders` | `ownerKey` | `{ ownerKey, owner, orders[] }` |
| `meta` | `key` | `lastUpdated` |

## ESI Spec Verification

### GET /characters/{character_id}/orders/

| Field | ESI Spec | Our Schema | Match |
|-------|----------|------------|-------|
| `order_id` | int64 | number | ✓ |
| `type_id` | int32 | number | ✓ |
| `region_id` | int32 | number | ✓ |
| `location_id` | int64 | number | ✓ |
| `price` | double | number | ✓ |
| `volume_total` | int32 | number | ✓ |
| `volume_remain` | int32 | number | ✓ |
| `issued` | date-time | string | ✓ |
| `duration` | int32 | number | ✓ |
| `range` | string | string | ✓ |
| `is_buy_order` | boolean | boolean (default false) | ✓ |
| `is_corporation` | boolean | boolean | ✓ |
| `min_volume` | int32 (optional) | number (optional) | ✓ |
| `escrow` | double (optional) | number (optional) | ✓ |

### GET /corporations/{corporation_id}/orders/

| Field | ESI Spec | Our Schema | Match |
|-------|----------|------------|-------|
| `order_id` | int64 | number | ✓ |
| `type_id` | int32 | number | ✓ |
| `region_id` | int32 | number | ✓ |
| `location_id` | int64 | number | ✓ |
| `price` | double | number | ✓ |
| `volume_total` | int32 | number | ✓ |
| `volume_remain` | int32 | number | ✓ |
| `issued` | date-time | string | ✓ |
| `duration` | int32 | number | ✓ |
| `range` | string | string | ✓ |
| `is_buy_order` | boolean | boolean (default false) | ✓ |
| `min_volume` | int32 (optional) | number (optional) | ✓ |
| `escrow` | double (optional) | number (optional) | ✓ |
| `issued_by` | int64 | number | ✓ |
| `wallet_division` | int32 | number | ✓ |

**Cache**: 3600 seconds (character), 1200 seconds (corporation) vs 5 minutes (our cooldown).

## Additional Endpoint Functions

The market endpoint file also contains:

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `getMarketPrices()` | `/markets/prices/` | Global adjusted/average prices |
| `getRegionalMarketPrices()` | `/markets/{region}/orders/` | All orders in a region (paginated) |

These are not used by the market-orders-store but available for other features.

## Code References

| Location | Purpose |
|----------|---------|
| `src/store/market-orders-store.ts:187-247` | `update()` - main update flow |
| `src/store/market-orders-store.ts:211-216` | Character vs corporation branching |
| `src/api/endpoints/market.ts:50-55` | `getCharacterOrders()` |
| `src/api/endpoints/market.ts:57-68` | `getCorporationOrders()` |
| `src/api/schemas.ts:72-87` | `ESIMarketOrderSchema` |
| `src/api/schemas.ts:89-105` | `ESICorporationMarketOrderSchema` |
