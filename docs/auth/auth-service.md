# Auth Service

`electron/services/auth.ts` - EVE SSO OAuth2 with PKCE for Electron.

## EVE SSO Configuration

```typescript
const EVE_SSO = {
  authUrl: 'https://login.eveonline.com/v2/oauth/authorize',
  tokenUrl: 'https://login.eveonline.com/v2/oauth/token',
  revokeUrl: 'https://login.eveonline.com/v2/oauth/revoke',
  jwksUrl: 'https://login.eveonline.com/oauth/jwks',
  issuer: 'https://login.eveonline.com',
  clientId: 'ff72276da5e947b3a64763038d22ef53',
}

const CALLBACK_URL = 'http://localhost/callback'
```

## PKCE Implementation

Desktop apps cannot securely store client secrets, so we use PKCE (Proof Key for Code Exchange).

### Code Verifier Generation

128-character random string using unreserved URI characters:

```typescript
function generateCodeVerifier(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~'
  // Generate 128 chars with uniform distribution
}
```

### Code Challenge

SHA-256 hash of verifier, base64url encoded:

```typescript
function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier, 'ascii').digest()
  return hash.toString('base64url')
}
```

## Authentication Flow

### 1. Start Auth (`startAuth`)

```typescript
export async function startAuth(includeCorporationScopes = false): Promise<AuthResult>
```

1. Generate random `state` (CSRF protection)
2. Generate PKCE `codeVerifier` and `codeChallenge`
3. Select scopes (character-only or character+corporation)
4. Build authorization URL with parameters
5. Open `BrowserWindow` to EVE login page
6. Listen for callback URL navigation

### 2. OAuth Window

```typescript
authWindow = new BrowserWindow({
  width: 500,
  height: 700,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
  },
})
```

Navigation events monitored:
- `will-navigate`
- `will-redirect`
- `did-navigate`

2-minute timeout automatically closes window.

### 3. Handle Callback (`handleCallback`)

When URL starts with `http://localhost/callback`:

1. Extract `code`, `state`, and `error` from query params
2. Verify `state` matches expected (CSRF check)
3. Exchange code for tokens
4. Verify JWT and extract character info
5. Fetch corporation ID from ESI

### 4. Token Exchange

```typescript
async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse>
```

POST to token endpoint:
```
grant_type=authorization_code
client_id=<client_id>
code=<authorization_code>
code_verifier=<pkce_verifier>
```

Response:
```typescript
interface TokenResponse {
  access_token: string   // JWT, ~20 min validity
  token_type: string     // "Bearer"
  expires_in: number     // seconds (typically 1199)
  refresh_token: string  // long-lived
}
```

### 5. JWT Verification

```typescript
async function verifyToken(token: string): Promise<JWTPayload>
```

Uses `jose` library with EVE's JWKS endpoint:
- Validates signature against public keys
- Checks issuer is `https://login.eveonline.com`

JWT payload structure:
```typescript
interface JWTPayload {
  sub: string           // "CHARACTER:EVE:123456789"
  name: string          // Character name
  scp: string | string[]// Granted scopes
  iss: string           // Issuer URL
  exp: number           // Expiration timestamp
}
```

Character ID extraction:
```typescript
function extractCharacterId(sub: string): number {
  const parts = sub.split(':')
  return parseInt(parts[2], 10)  // "CHARACTER:EVE:123456789" → 123456789
}
```

## Token Refresh

```typescript
export async function refreshAccessToken(refreshToken: string): Promise<AuthResult>
```

POST to token endpoint:
```
grant_type=refresh_token
client_id=<client_id>
refresh_token=<refresh_token>
```

Returns new access token, refresh token, and verified character info.

## Token Revocation

```typescript
export async function revokeToken(refreshToken: string): Promise<boolean>
```

POST to revoke endpoint:
```
token_type_hint=refresh_token
token=<refresh_token>
```

Called on logout to invalidate tokens server-side.

## Cancel Auth

```typescript
export function cancelAuth(): void
```

Closes auth window and resolves pending promise with error.

## Return Type

All auth operations return:

```typescript
interface AuthResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: number      // Unix timestamp (ms)
  characterId?: number
  characterName?: string
  corporationId?: number
  error?: string
}
```

## Error Handling

| Scenario | Error |
|----------|-------|
| User closes window | "Authentication cancelled" |
| 2-minute timeout | "Authentication timed out" |
| State mismatch | "State mismatch - possible CSRF" |
| No auth code | "No authorization code received" |
| Token exchange failure | Server error message |
| JWT verification failure | Exception message |

## Security Considerations

1. **PKCE**: No client secret required or stored
2. **State Parameter**: Random hex string prevents CSRF
3. **JWT Verification**: Signature validated against EVE's public keys
4. **Context Isolation**: Auth window has no Node.js access
5. **Timeout**: Prevents indefinitely open auth windows
