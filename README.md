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
2. Callback: `http://localhost:2020/callback`
3. Set `EVE_CLIENT_ID` environment variable

## License

MIT

EVE Online is property of CCP Games.
