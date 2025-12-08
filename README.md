# ECTEVEAssets

A modern React Electron desktop application for EVE Online asset management.

**Repository:** https://github.com/ectkirk/ecteveassets

## Overview

ECTEVEAssets is a clean, focused replacement for the legacy Java asset management application. It displays EVE Online character and corporation assets in an intuitive tree-based interface with zero bloat.

## Features

### 10 Core Tabs

| Tab | Description |
|-----|-------------|
| **Assets** | Flat table view of all assets with filtering, sorting, and value calculations |
| **Item Hangar** | Hierarchical tree of non-ship items in station hangars |
| **Ship Hangar** | Hierarchical tree of ships in station hangars |
| **Deliveries** | Pending deliveries waiting to be picked up |
| **Asset Safety** | Items recovered from destroyed/abandoned structures |
| **Market Orders** | Active buy and sell orders organized by location |
| **Industry Jobs** | Manufacturing and reaction jobs in progress |
| **Clones** | Jump clones with implants by location |
| **Office** | Corporation office contents |
| **Contracts** | Items in active contracts |

### Key Capabilities

- **Tree View**: Assets organized by Region > System > Station > Container
- **Value Tracking**: Real-time ISK value calculations using market data
- **Multi-Character**: Support for multiple EVE accounts
- **Corporation Assets**: View corp assets with proper role permissions
- **Offline Mode**: Cached data available when ESI is unreachable

## Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Desktop Runtime | Electron | 39.x |
| Frontend | React + TypeScript | 19.x |
| Build Tool | Vite | 7.x |
| UI Framework | shadcn/ui + Tailwind CSS | latest |
| State Management | Zustand | 5.x |
| API Data | TanStack React Query | 5.x |
| Tables | shadcn/ui DataTable (TanStack Table) | 8.x |
| Local Storage | IndexedDB (idb) | 8.x |
| Token Storage | Electron safeStorage | - |
| Testing | Vitest + Playwright | 4.x / 1.x |
| Type Checking | TypeScript | 5.x |

## Project Structure

```
ECTEVEAssets/
├── electron/           # Electron main process
│   ├── main.ts         # Entry point
│   ├── preload.ts      # IPC bridge
│   └── services/       # OAuth, secure storage
├── src/                # React renderer
│   ├── api/            # ESI API client
│   ├── components/     # UI components
│   ├── features/       # Tab implementations
│   ├── store/          # Zustand stores
│   ├── data/           # SDE loaders
│   ├── lib/            # Utilities
│   └── types/          # TypeScript types
├── public/             # Static assets
│   ├── icons/          # EVE type icons
│   └── sde/            # Static game data
└── .claude/            # Claude Code documentation
```

## Development

### Prerequisites

- Node.js 22+
- npm 10+

### Quick Start

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Run tests
npm run test

# Lint and format
npm run lint
npm run format

# Type check
npm run typecheck

# Build for production
npm run build

# Package for distribution
npm run package
```

### ESI OAuth Setup

1. Register an application at https://developers.eveonline.com/
2. Set callback URL to `http://localhost:2020/callback`
3. Request required scopes (see `.claude/IMPLEMENTATION_PLAN.md`)
4. Set `ESI_CLIENT_ID` environment variable

## Documentation

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Build commands and project instructions for Claude Code |
| `.claude/IMPLEMENTATION_PLAN.md` | Detailed implementation plan with phases |
| `.claude/ESI_API_DOCUMENTATION.md` | EVE ESI API reference |
| `.claude/EVE_SDE_DOCUMENTATION.md` | Static Data Export reference |
| `.claude/NEXT_SESSION.md` | Current development state |

## License

MIT

## Acknowledgments

- EVE Online and all related assets are property of CCP Games
- Based on learnings from the original Java EC EVE Assets project
