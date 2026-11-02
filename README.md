# ECT EVE Assets

Desktop asset manager for EVE Online. Track assets, market orders, contracts, industry jobs, wallet balances, clones, skills, mail, and more across multiple characters and corporations.

Built with Electron, React, and TypeScript.

## Download

Get the latest installer from the [Releases page](https://github.com/ectkirk/ect-eve-assets/releases/latest):

| Platform | File                                                                     |
| -------- | ------------------------------------------------------------------------ |
| Windows  | `ECTEVEAssets-Setup-<version>.exe`                                       |
| macOS    | `ECTEVEAssets-<version>-arm64.dmg` (Apple Silicon) or `-x64.dmg` (Intel) |
| Linux    | `ECTEVEAssets-<version>.AppImage`                                        |

Windows and Linux builds update themselves. The macOS build isn't signed with an Apple Developer ID, so macOS can't install updates automatically: the app tells you when a new version is out and links to its download. On first launch, macOS may say the app is from an unidentified developer; open it with right-click → **Open**, or allow it under **System Settings → Privacy & Security**.

## Features

### Asset Mode

| Tab            | Description                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Assets         | Flat table with type, category, group, and region filters, value totals, and jump distance to any system |
| Assets Tree    | Hierarchical view: Region > System > Station > Container                                                 |
| Market Orders  | Active buy and sell orders with regional price data                                                      |
| Industry Jobs  | Manufacturing, research, and reaction jobs, including who installed each job                             |
| Loyalty Points | LP balances across corporations                                                                          |
| Contracts      | Items in outstanding contracts                                                                           |
| Structures     | Deployed upwell structures and starbases                                                                 |
| Wallet         | Character and corporation ISK balances                                                                   |

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

### Buyback Mode

Item valuation by security level.

### Core Capabilities

- Multi-character and corporation support with per-owner data isolation
- Market prices from edencom.net reference API and Mutamarket (abyssal modules)
- In-game actions: set autopilot waypoints, open market details
- Automatic ESI data refresh with expiry-based caching
- Resizable table columns, remembered per table
- 8 languages: English, German, Spanish, French, Japanese, Korean, Russian, Chinese

## Tech Stack

| Layer      | Technology                                        |
| ---------- | ------------------------------------------------- |
| Desktop    | Electron 45, electron-updater                     |
| Frontend   | React 19, TypeScript 7, Vite 8                    |
| State      | Zustand 5, IndexedDB persistence                  |
| UI         | Tailwind 4, shadcn/ui (Radix), Lucide icons       |
| Tables     | Custom React tables with fixed-row virtualization |
| Validation | Zod 4                                             |
| Auth       | EVE SSO OAuth2 PKCE (jose)                        |
| Testing    | Vitest, React Testing Library, fake-indexeddb     |
| Linting    | Oxlint (type-aware), Prettier                     |

## Development

```bash
npm install
npm run dev          # Start dev server
npm test             # Run unit tests
npx vitest run path/to/file.test.ts   # Run one test file
npm run typecheck    # TypeScript check
npm run lint         # Oxlint (type-aware) + Prettier check
npm run format       # Format with Prettier
npm run build        # Production build
```

### Distribution

```bash
npm run dist         # Build for current platform
npm run dist:win     # Windows (NSIS installer)
npm run dist:mac     # macOS (Intel and Apple Silicon DMGs)
npm run dist:linux   # Linux (AppImage)
```

### Environment Variables

Copy `.env.example` to `.env`:

| Variable              | Required | Description                     |
| --------------------- | -------- | ------------------------------- |
| `EVE_CLIENT_ID`       | Yes      | EVE SSO OAuth2 client ID        |
| `REF_API_KEY`         | Release  | edencom.net reference API key   |
| `DISCORD_BUG_WEBHOOK` | Release  | Discord webhook for bug reports |

All variables are embedded at build time, in the main process only. For releases, they are injected from GitHub Actions secrets.

### Releasing

See [Releasing](CONTRIBUTING.md#releasing) in CONTRIBUTING.md. Releases can be started from the Actions tab (**Release → Run workflow**) or by pushing a version tag.

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

- EVE SSO with PKCE; no client secret is shipped in the app
- The UI runs in a sandboxed renderer with no Node.js access, talking to the main process through a single validated IPC bridge
- Refresh tokens are encrypted at rest with the OS credential store and revoked with EVE SSO when you log out or remove a character
- HTML from EVE and the reference API is sanitized with DOMPurify

See [SECURITY.md](SECURITY.md) for the full security model, the external services the app contacts, and how to report a vulnerability.

## License

MIT

EVE Online and all related trademarks are property of CCP Games.
