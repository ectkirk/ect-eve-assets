# Wallet Store

Manages ISK balances for characters and corporations.

## Overview

| Property | Value |
|----------|-------|
| **File** | `src/store/wallet-store.ts` |
| **Endpoint File** | `src/api/endpoints/wallet.ts` |
| **IndexedDB** | `ecteveassets-wallet` |
| **Update Cooldown** | 5 minutes |
| **Owner Types** | Character, Corporation |

## ESI Endpoints

| Endpoint | Method | Response | Scope |
|----------|--------|----------|-------|
| `/characters/{character_id}/wallet/` | GET | number | `esi-wallet.read_character_wallet.v1` |
| `/corporations/{corporation_id}/wallets/` | GET | array | `esi-wallet.read_corporation_wallets.v1` |

## Data Types

### Character vs Corporation

| Owner Type | Response Type | Data Structure |
|------------|---------------|----------------|
| Character | Single number | `{ balance: number }` |
| Corporation | Division array | `{ divisions: ESICorporationWalletDivision[] }` |

### ESICorporationWalletDivision (from ESI)

```typescript
interface ESICorporationWalletDivision {
  division: number  // 1-7 for master wallet and divisions
  balance: number   // ISK balance
}
```

### CharacterWallet (internal)

```typescript
interface CharacterWallet {
  owner: Owner
  balance: number
}
```

### CorporationWallet (internal)

```typescript
interface CorporationWallet {
  owner: Owner
  divisions: ESICorporationWalletDivision[]
}
```

### OwnerWallet (union type)

```typescript
type OwnerWallet = CharacterWallet | CorporationWallet

function isCorporationWallet(wallet: OwnerWallet): wallet is CorporationWallet {
  return wallet.owner.type === 'corporation'
}
```

## Data Flow

### Update (`update()`)

```
1. Check cooldown (5 minutes)
2. Get all owners (characters + corporations)
3. For each owner:
   a. If corporation: getCorporationWallets() → divisions array
   b. If character: getCharacterWallet() → single number
4. Save to IndexedDB
```

### Total Balance Calculation

```typescript
getTotalBalance: () => {
  let total = 0
  for (const wallet of walletsByOwner) {
    if (isCorporationWallet(wallet)) {
      for (const div of wallet.divisions) {
        total += div.balance
      }
    } else {
      total += wallet.balance
    }
  }
  return total
}
```

## Storage

### IndexedDB Schema

**Database:** `ecteveassets-wallet` (version 1)

| Object Store | Key Path | Contents |
|--------------|----------|----------|
| `wallet` | `ownerKey` | `{ ownerKey, owner, balance?, divisions? }` |
| `meta` | `key` | `lastUpdated` |

### Polymorphic Storage

Stores either `balance` or `divisions` based on owner type:

```typescript
if (isCorporationWallet(wallet)) {
  walletStore.put({ ownerKey, owner: wallet.owner, divisions: wallet.divisions })
} else {
  walletStore.put({ ownerKey, owner: wallet.owner, balance: wallet.balance })
}
```

## ESI Spec Verification

### GET /characters/{character_id}/wallet/

Response is a single `number` representing ISK balance (double precision).

### GET /corporations/{corporation_id}/wallets/

| Field | Our Schema | ESI Spec |
|-------|------------|----------|
| `division` | number | ✓ |
| `balance` | number | ✓ |

Returns array of 7 wallet divisions.

## Code References

| Location | Purpose |
|----------|---------|
| `src/store/wallet-store.ts:219-280` | `update()` - main update flow |
| `src/store/wallet-store.ts:242-250` | Character vs corp routing |
| `src/store/wallet-store.ts:204-217` | `getTotalBalance()` utility |
| `src/api/endpoints/wallet.ts:7-12` | `getCharacterWallet()` |
| `src/api/endpoints/wallet.ts:14-22` | `getCorporationWallets()` |

## Potential Issues

None identified. Implementation correctly:
- Handles both character and corporation wallets
- Uses appropriate response types (number vs array)
- Provides total balance calculation across all owners
