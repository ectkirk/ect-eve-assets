# ECTEVEAssets

Electron desktop app for EVE Online asset management.

## Features

| Tab | Description |
|-----|-------------|
| Assets | Flat table with filtering, sorting, and value calculations |
| Item Hangar | Tree view of non-ship items in hangars |
| Ship Hangar | Tree view of ships in hangars |
| Deliveries | Pending deliveries |
| Asset Safety | Items from destroyed/abandoned structures |
| Market Orders | Active buy/sell orders |
| Industry Jobs | Manufacturing and reaction jobs |
| Clones | Jump clones with implants |
| Office | Corporation office contents |
| Structures | Deployed structures |
| Contracts | Items in contracts |
| Wallet | Character and corp balances |

- Tree navigation: Region → System → Station → Container
- Market prices from ref.edencom.net and Mutamarket
- Multi-character and corporation support

## Tech Stack

Electron, React, TypeScript, Vite, shadcn/ui, Tailwind, Zustand, TanStack Table, IndexedDB

## Development

```bash
npm install
npm run dev
npm run test
npm run build
```

## EVE SSO

1. Register at https://developers.eveonline.com/
2. Callback: `http://localhost/callback`
3. Required scopes:
   - `publicData`
   - `esi-assets.read_assets.v1`
   - `esi-characters.read_blueprints.v1`
   - `esi-markets.read_character_orders.v1`
   - `esi-industry.read_character_jobs.v1`
   - `esi-contracts.read_character_contracts.v1`
   - `esi-clones.read_clones.v1`
   - `esi-clones.read_implants.v1`
   - `esi-universe.read_structures.v1`
   - `esi-wallet.read_character_wallet.v1`
   - For corporation features, also add:
     - `esi-assets.read_corporation_assets.v1`
     - `esi-corporations.read_blueprints.v1`
     - `esi-corporations.read_divisions.v1`
     - `esi-contracts.read_corporation_contracts.v1`
     - `esi-industry.read_corporation_jobs.v1`
     - `esi-markets.read_corporation_orders.v1`
     - `esi-wallet.read_corporation_wallets.v1`
4. Set `EVE_CLIENT_ID` environment variable

## License

MIT

EVE Online is property of CCP Games.
