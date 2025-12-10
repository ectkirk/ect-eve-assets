# Contributing to ECTEVEAssets

Thank you for your interest in contributing!

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Register an EVE SSO application at https://developers.eveonline.com/
   - Callback URL: `http://localhost/callback`
   - See README.md for required scopes
4. Set environment variable: `export EVE_CLIENT_ID="your-client-id"`
5. Start development: `npm run dev`

## Before Submitting

Run all checks:

```bash
npm run typecheck
npm run lint
npm run test
```

## Code Style

- **No verbose comments** - Code should be self-explanatory. Only comment non-obvious business logic.
- **DRY** - Extract repeated logic.
- **KISS** - Simple solutions over complex ones.
- **No eslint-disable** - Fix the underlying issue.

## Pull Requests

1. Create a feature branch from `develop`
2. Make your changes
3. Ensure all checks pass
4. Submit PR to `develop`

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `refactor:` Code changes that neither fix bugs nor add features
- `docs:` Documentation only
- `test:` Adding or updating tests
- `ci:` CI/CD changes

## Questions?

Open an issue for discussion.
