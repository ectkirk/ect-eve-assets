# Security Policy

## Supported Versions

Security fixes ship in the latest release. Windows and Linux builds update themselves; macOS builds show an in-app prompt to download the new version.

| Version | Supported          |
| ------- | ------------------ |
| 3.0.x   | :white_check_mark: |
| < 3.0   | :x:                |

## Security Model

ECT EVE Assets is an Electron desktop app that signs in to EVE Online with EVE SSO and reads character and corporation data from ESI.

### Process isolation

- The renderer (the app's UI) runs with `contextIsolation`, `sandbox`, and no Node.js integration. It cannot access Node.js APIs or the filesystem.
- The renderer talks to the main process only through the `window.electronAPI` bridge exposed by the preload script. IPC handlers validate their inputs before acting on them.
- Links that try to open a new window are only opened, in the system browser, if they use `http` or `https`.

### Authentication and tokens

- **EVE SSO with PKCE**: the OAuth2 login runs in the main process with a local callback on `http://localhost:52742/callback`. No client secret is shipped in the app.
- **Tokens in memory**: the main process performs the login and token refreshes. The resulting access and refresh tokens are held in memory by the renderer, which uses them for ESI requests. Access tokens are refreshed 60 seconds before they expire.
- **Tokens at rest**: refresh tokens are saved to the app's data folder, encrypted with Electron `safeStorage`, which uses the OS credential store (macOS Keychain, Windows DPAPI, or a Linux secret service). Access tokens are not saved. On Linux systems without a secret service, the file is written in plaintext with owner-only (`0600`) permissions, and the app logs a warning.
- **Revocation**: logging out or removing a character revokes its refresh token with EVE SSO.
- **Lock and idle**: on system lock, suspend, or 30 minutes of inactivity, the main process clears the refresh tokens it keeps in memory for revocation.

### Content sanitization

- HTML from EVE (mail bodies, item descriptions) and from the reference API is sanitized with DOMPurify against an allowlist of tags and attributes before it is rendered.

### External services

All connections use HTTPS.

| Service                           | Purpose                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| ESI (`esi.evetech.net`)           | EVE Online API for character and corporation data                                         |
| EVE SSO (`login.eveonline.com`)   | Sign-in, token refresh, and revocation                                                    |
| EVE images (`images.evetech.net`) | Item icons, character portraits, and corporation logos                                    |
| `www.eveonline.com`               | Insurgency data for the map                                                               |
| `edencom.net`                     | Reference data (items, prices, locations), buyback, and contract search                   |
| `mutamarket.com`                  | Abyssal module prices (sends the module's item and type IDs)                              |
| GitHub (`github.com`)             | Update checks and downloads                                                               |
| Discord (`discord.com`)           | Bug reports, only when you submit one (sends your description and the selected character) |

## Reporting a Vulnerability

If you find a security vulnerability:

1. **Do not** open a public GitHub issue.
2. Email contact@edencom.net with:
   - a description of the vulnerability
   - steps to reproduce
   - the potential impact
   - a suggested fix, if you have one

### Response Timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 7 days
- **Resolution**: depends on severity; critical issues are prioritized

### What to Expect

- Accepted vulnerabilities are fixed in the next release.
- You are credited in the release notes unless you prefer to stay anonymous.
- Declined reports receive an explanation.

## Scope

In scope:

- Token handling, storage, and lifecycle
- The OAuth flow (PKCE, refresh, revocation)
- IPC security between the main and renderer processes
- Content sanitization
- The update and release pipeline (installers, update feeds, release workflows)
- Vulnerabilities in dependencies that ship in the app

Out of scope:

- The security of EVE Online's ESI and SSO services (report those to CCP)
- Vulnerabilities in build-time tooling that only process the project's own files
- Social engineering
- Issues that require physical access to the user's machine
