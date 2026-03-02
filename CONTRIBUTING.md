# Contributing to ECT EVE Assets

Thank you for your interest in contributing!

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Register an EVE SSO application at https://developers.eveonline.com/
   - Callback URL: `http://localhost:52742/callback`
   - See README.md for required scopes
4. Copy `.env.example` to `.env` and add your client ID
5. Request a Ref API key (see below)
6. Start development: `npm run dev`

## Ref API (edencom.net)

The app uses the edencom.net Ref API to resolve item types, prices, and location names. This API requires:

- **API Key**: Set `REF_API_KEY` in your `.env` file
- **User-Agent**: Must identify your application (handled automatically)

**To request an API key**, email key@edencom.net with:

- Your application name
- Brief description of your use case

Without a valid API key, item names, prices, and location names will not resolve.

## Project Structure

```
electron/               # Main process
  main.ts               # App lifecycle, window management
  preload.ts            # IPC bridge (electronAPI, esiAPI)
  services/
    auth/               # EVE SSO PKCE authentication
    esi/                # ESI client, caching, rate limiting
    ipc-handlers.ts     # All ipcMain.handle() registrations
src/                    # Renderer process
  api/                  # ESI client, ref API, Mutamarket
    endpoints/          # Per-domain ESI wrappers with Zod validation
  components/           # Layout, UI, dialogs, tree views
  features/             # Feature-sliced modules (assets, mail, map, etc.)
  hooks/                # Custom React hooks
  i18n/                 # Translations (8 languages, 12 namespaces)
  lib/                  # Utilities (tree builder, resolver, errors, etc.)
  store/                # Zustand stores (~70 files)
  test/                 # Test setup and helpers
```

## Architecture Patterns

### Store Factories

The codebase uses three Zustand store factory patterns:

- **`createOwnerStore`** — Per-owner (character/corporation) data with ESI fetching, IndexedDB persistence, and expiry caching. Used by most data stores.
- **`createVisibilityStore`** — Extends owner-store with per-owner visibility toggling.
- **`createActionStore` / `createInfoStore`** — Lightweight stores for UI actions and cached lookups.

All stores self-register with `store-registry.ts` for unified lifecycle management.

### Key Conventions

- **Owner keys**: Always use `ownerKey(type, id)` from `auth-store` — never construct `${type}-${id}` manually.
- **Zustand selectors**: Use fine-grained selectors (`useStore((s) => s.field)`) — never subscribe to the full store.
- **Stale state**: Call `get()` after any `await` in store actions to avoid stale closures.
- **Import alias**: Use `@/` for `src/` imports.

### IPC Boundary

The Electron main and renderer processes communicate exclusively through IPC. The preload script exposes `window.electronAPI` and `window.esiAPI`. Never access Node.js APIs directly from the renderer.

## Code Style

- **No verbose comments** — Code should be self-explanatory. Only comment non-obvious business logic.
- **DRY** — Extract repeated logic into shared utilities.
- **KISS** — Simple solutions over complex ones. Avoid premature abstraction.
- **No `eslint-disable`** — Fix the underlying issue.
- **No `any`** — Use strict TypeScript. Prefix unused variables with `_`.
- **Early returns** — Avoid deeply nested conditionals.

## Internationalization

Translations live in `src/i18n/locales/{lang}/{namespace}.json` across 12 namespaces: common, layout, assets, contracts, industry, market, wallet, clones, loyalty, structures, tools, dialogs.

When adding user-facing strings, add the key to the English locale file and use `useTranslation()` with the appropriate namespace. The 8 supported languages are: en, de, es, fr, ja, ko, ru, zh.

## Testing

Tests are colocated next to source files as `*.test.ts` / `*.test.tsx`.

```bash
npm test                              # Run all tests
npm run test:watch                    # Watch mode
npx vitest run path/to/file.test.ts   # Single file
npm run test:coverage                 # Coverage report
npm run test:e2e                      # Playwright E2E tests
```

- **Unit tests**: Vitest + jsdom + React Testing Library + fake-indexeddb
- **E2E tests**: Playwright
- **Test setup**: `src/test/setup.ts` provides localStorage polyfill, i18n init, and logger mock
- When mocking `auth-store`, use `importOriginal` to preserve exports like `ownerKey` and `findOwnerByKey`

## Before Submitting

Run all checks:

```bash
npm run typecheck && npm run lint && npm test
```

## Pull Requests

1. Create a feature branch from `develop`
2. Make your changes
3. Ensure all checks pass
4. Submit PR targeting `develop`

CI runs typecheck, lint, and tests automatically on every PR.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix      | Use for                                      |
| ----------- | -------------------------------------------- |
| `feat:`     | New features                                 |
| `fix:`      | Bug fixes                                    |
| `refactor:` | Code changes with no behavior change         |
| `test:`     | Adding or updating tests                     |
| `docs:`     | Documentation only                           |
| `ci:`       | CI/CD changes                                |
| `deps:`     | Dependency updates                           |
| `revert:`   | Reverting a previous change                  |

Optional scope: `feat(map): add route highlighting`, `fix(store): prevent stale state`

## Questions?

Open an issue for discussion.
