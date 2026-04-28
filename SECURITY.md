# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.7.4   | :white_check_mark: |
| 2.7.x   | :white_check_mark: |
| < 2.7.0 | :x:                |

## Security Model

ECT EVE Assets is a desktop application that handles EVE Online SSO authentication. The Electron architecture enforces a strict security boundary between the main process (privileged) and the renderer process (sandboxed).

### Authentication

- **EVE SSO PKCE**: OAuth2 with Proof Key for Code Exchange — no client secret stored in the application
- **Token isolation**: Access and refresh tokens are stored exclusively in the Electron main process and never exposed to the renderer
- **Token refresh**: Automatic refresh 60 seconds before expiry via the main process
- **Token revocation**: Tokens are revoked on application shutdown
- **Session cleanup**: Tokens are cleared on system lock, system suspend, and after 30 minutes of idle time

### Process Isolation

- **Preload bridge**: The renderer communicates with the main process exclusively through `contextBridge`-exposed IPC channels (`window.electronAPI`, `window.esiAPI`)
- **Input validation**: All IPC handlers validate incoming parameters before processing
- **No Node.js in renderer**: The renderer has no direct access to Node.js APIs or the filesystem

### Content Sanitization

- **DOMPurify**: All HTML content (EVE mail, item descriptions, user-generated text) is sanitized with allowlisted tags and attributes before rendering

### External Services

The application communicates with these external services:

| Service                       | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| ESI (esi.evetech.net)         | EVE Online API for character/corp data         |
| EVE SSO (login.eveonline.com) | OAuth2 authentication                          |
| edencom.net                   | Reference data (item types, prices, locations) |
| mutamarket.com                | Abyssal module pricing                         |

No other external services are contacted. All communication uses HTTPS.

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. **Do NOT** open a public GitHub issue
2. Email security concerns to: contact@edencom.net
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Resolution**: Depends on severity; critical issues prioritized

### What to Expect

- Accepted vulnerabilities will be patched in the next release
- Credit will be given in release notes (unless you prefer anonymity)
- Declined reports will receive an explanation

## Scope

In scope:

- Token handling, storage, and lifecycle
- OAuth flow implementation (PKCE, refresh, revocation)
- IPC security between main and renderer processes
- Content sanitization
- Dependency vulnerabilities

Out of scope:

- EVE Online's ESI API security (report to CCP)
- Social engineering attacks
- Issues requiring physical access to the user's machine
