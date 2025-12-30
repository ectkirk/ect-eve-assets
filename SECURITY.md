# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.1.x   | :white_check_mark: |
| < 2.1.0 | :x:                |

## Security Considerations

ECTEVEAssets is a desktop application that handles EVE Online SSO authentication. Key security aspects:

- **OAuth Tokens**: Access and refresh tokens are stored locally via Zustand persistence
- **EVE SSO**: Authentication uses EVE Online's OAuth2 flow with PKCE
- **Local Only**: No data is sent to third-party servers; all ESI requests go directly to CCP's APIs
- **No Secrets in Code**: Client credentials must be provided via environment variables

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

- Token handling and storage
- OAuth flow implementation
- IPC security between main and renderer processes
- Dependency vulnerabilities

Out of scope:

- EVE Online's ESI API security (report to CCP)
- Social engineering attacks
- Issues requiring physical access to the user's machine
