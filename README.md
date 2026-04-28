# ECT EVE Assets

Desktop asset manager for EVE Online. Track assets, market orders, contracts, industry jobs, wallet balances, clones, skills, mail, and more across multiple characters and corporations.

Built with Electron, React, and TypeScript.

## Features

### Asset Mode

| Tab            | Description                                              |
| -------------- | -------------------------------------------------------- |
| Assets         | Flat table with filtering, sorting, and value totals     |
| Assets Tree    | Hierarchical view: Region > System > Station > Container |
| Market Orders  | Active buy and sell orders with regional price data      |
| Industry Jobs  | Manufacturing and reaction jobs                          |
| Loyalty Points | LP balances across corporations                          |
| Contracts      | Items in outstanding contracts                           |
| Structures     | Deployed upwell structures and starbases                 |
| Wallet         | Character and corporation ISK balances                   |

### Character Mode

| Tab    | Description                              |
| ------ | ---------------------------------------- |
| Clones | Jump clones with implant details         |
| Mail   | In-game mail with conversation threading |
| Skills | Skill queue and training progress        |

### Tools Mode

| Tab             | Description                                             |
| --------------- | ------------------------------------------------------- |
| Contracts       | Cross-region contract search and filtering              |
| Regional Market | Regional pricing data and market analysis               |
| Map             | Universe map with routing, incursions, and insurgencies |
| Reference       | Item database browser with descriptions                 |

### Additional Modes

| Mode    | Description                       |
| ------- | --------------------------------- |
| Buyback | Item valuation by security level  |
| Freight | Shipping calculator for logistics |

### Core Capabilities

- Multi-character and corporation support with per-owner data isolation
- Market prices from edencom.net reference API and Mutamarket (abyssal modules)
- In-game actions: set autopilot waypoints, open market details
- Automatic ESI data refresh with expiry-based caching
- 8 languages: English, German, Spanish, French, Japanese, Korean, Russian, Chinese

## Tech Stack

| Layer      | Technology                                                |
| ---------- | --------------------------------------------------------- |
| Desktop    | Electron 40, electron-updater                             |
| Frontend   | React 19, TypeScript 5.9, Vite 7                          |
| State      | Zustand 5, IndexedDB persistence                          |
| UI         | Tailwind 4, shadcn/ui (Radix), Lucide icons               |
| Tables     | TanStack Table + TanStack Virtual                         |
| Validation | Zod 4                                                     |
| Auth       | EVE SSO OAuth2 PKCE (jose)                                |
| Testing    | Vitest, React Testing Library, Playwright, fake-indexeddb |

## Development

```bash
npm install
npm run dev          # Start dev server
npm test             # Run unit tests
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run build        # Production build
```

### Distribution

```bash
npm run dist         # Build for current platform
npm run dist:win     # Windows (NSIS installer)
npm run dist:mac     # macOS (DMG)
npm run dist:linux   # Linux (AppImage)
```

### Environment Variables

Copy `.env.example` to `.env`:

| Variable              | Required | Description                     |
| --------------------- | -------- | ------------------------------- |
| `EVE_CLIENT_ID`       | Yes      | EVE SSO OAuth2 client ID        |
| `REF_API_KEY`         | Release  | edencom.net reference API key   |
| `DISCORD_BUG_WEBHOOK` | Release  | Discord webhook for bug reports |

All variables are embedded at build time. For releases, they are injected from GitHub Actions secrets.

## EVE SSO Setup

1. Register at https://developers.eveonline.com/
2. Set callback URL to `http://localhost:52742/callback`
3. Add your client ID to `.env`
4. Required scopes:

**Character scopes:**

- `publicData`
- `esi-assets.read_assets.v1`
- `esi-characters.read_blueprints.v1`
- `esi-characters.read_corporation_roles.v1`
- `esi-characters.read_loyalty.v1`
- `esi-clones.read_clones.v1`
- `esi-clones.read_implants.v1`
- `esi-contracts.read_character_contracts.v1`
- `esi-industry.read_character_jobs.v1`
- `esi-location.read_location.v1`
- `esi-location.read_ship_type.v1`
- `esi-mail.read_mail.v1`
- `esi-markets.read_character_orders.v1`
- `esi-search.search_structures.v1`
- `esi-skills.read_skills.v1`
- `esi-ui.open_window.v1`
- `esi-ui.write_waypoint.v1`
- `esi-universe.read_structures.v1`
- `esi-wallet.read_character_wallet.v1`

**Additional corporation scopes:**

- `esi-assets.read_corporation_assets.v1`
- `esi-contracts.read_corporation_contracts.v1`
- `esi-corporations.read_blueprints.v1`
- `esi-corporations.read_divisions.v1`
- `esi-corporations.read_starbases.v1`
- `esi-corporations.read_structures.v1`
- `esi-industry.read_corporation_jobs.v1`
- `esi-markets.read_corporation_orders.v1`
- `esi-planets.read_customs_offices.v1`
- `esi-wallet.read_corporation_wallets.v1`

## Security

- EVE SSO PKCE authentication (no client secret in renderer)
- Tokens stored in main process only, never exposed to renderer
- Automatic token refresh and revocation on shutdown, system lock, and idle timeout
- HTML sanitization via DOMPurify
- Strict IPC boundary between Electron main and renderer processes

## License

MIT

EVE Online and all related trademarks are property of CCP Games.
