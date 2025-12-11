# EVE Online SSO Reference

EVE Single Sign-On (SSO) uses OAuth 2.0 for third-party application access.

## Official Documentation

- **SSO Guide**: https://developers.eveonline.com/docs/services/sso/
- **API Explorer**: https://developers.eveonline.com/api-explorer
- **Developer Portal**: https://developers.eveonline.com/

## Related Project Documentation

- [ESI API Documentation](./ESI_API_DOCUMENTATION.md) - Full ESI API reference
- [ESI Caching & Rate Limiting](./ESI_CACHING.md) - Cache times and rate limits
- [ESI Client Implementation](./ESI_CLIENT.md) - Our client implementation

## Endpoints

| Endpoint      | URL                                                                  |
| ------------- | -------------------------------------------------------------------- |
| Metadata      | `https://login.eveonline.com/.well-known/oauth-authorization-server` |
| Authorization | `https://login.eveonline.com/v2/oauth/authorize`                     |
| Token         | `https://login.eveonline.com/v2/oauth/token`                         |
| Revoke        | `https://login.eveonline.com/v2/oauth/revoke`                        |

## Authorization Code Flow

### Step 1: Redirect to SSO

Redirect user to authorization endpoint with query parameters:

| Parameter       | Value                                               |
| --------------- | --------------------------------------------------- |
| `response_type` | `code`                                              |
| `client_id`     | Your application's client ID                        |
| `redirect_uri`  | Registered callback URL                             |
| `scope`         | Space-separated list of scopes (e.g., `publicData`) |
| `state`         | Random string for CSRF protection                   |

**Example URL:**

```
https://login.eveonline.com/v2/oauth/authorize?response_type=code&client_id=xxx&redirect_uri=https://example.com/callback&scope=publicData&state=abc123
```

### Step 2: Handle Callback

User returns to your `redirect_uri` with:

- `code` - One-time authorization code
- `state` - Must match the state you sent (CSRF check)

### Step 3: Exchange Code for Tokens

POST to token endpoint with Basic authentication:

```
POST https://login.eveonline.com/v2/oauth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=<authorization_code>
```

**Response:**

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 1199,
  "refresh_token": "..."
}
```

### Step 4: Refresh Tokens

```
POST https://login.eveonline.com/v2/oauth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=<refresh_token>
```

## JWT Token Validation

The access token is a JWT that must be validated:

### Required Checks

1. **Signature**: Verify using public key from JWKS endpoint
2. **Issuer (`iss`)**: Must be `login.eveonline.com` or `https://login.eveonline.com`
3. **Audience (`aud`)**: Array containing your `client_id` and `"EVE Online"`
4. **Expiration (`exp`)**: Unix timestamp, reject if expired

### JWT Claims

| Claim  | Description                                          |
| ------ | ---------------------------------------------------- |
| `sub`  | Character identifier: `CHARACTER:EVE:<character_id>` |
| `name` | Character name                                       |
| `scp`  | Array of granted scopes                              |
| `iss`  | Issuer URL                                           |
| `aud`  | Audience (array with client_id and "EVE Online")     |
| `exp`  | Expiration timestamp                                 |

### Extracting Character ID

Parse the `sub` claim to get character ID:

```typescript
// sub format: "CHARACTER:EVE:123456789"
const characterId = parseInt(sub.split(':')[2])
```

## Token Revocation

```
POST https://login.eveonline.com/v2/oauth/revoke
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

token_type_hint=refresh_token&token=<refresh_token>
```

## Security Requirements

- **State Parameter**: Always use and verify to prevent CSRF attacks
- **Client Secret**: Keep private, never expose in client-side code
- **Refresh Token**: Store securely, can obtain new access tokens indefinitely
- **HTTPS**: All requests must use HTTPS

## Common Scopes

| Scope                                       | Description                             |
| ------------------------------------------- | --------------------------------------- |
| `publicData`                                | Basic character info (always available) |
| `esi-assets.read_assets.v1`                 | Read character assets                   |
| `esi-contracts.read_character_contracts.v1` | Read character contracts                |
| `esi-wallet.read_character_wallet.v1`       | Read character wallet                   |
| `esi-location.read_location.v1`             | Read character location                 |

## Implementation Checklist

- [x] Generate random state for each auth request
- [x] Store state in httpOnly cookie before redirect
- [x] Verify state matches on callback
- [x] Exchange code for tokens with Basic auth
- [x] Validate JWT signature using JWKS
- [x] Check JWT issuer, audience, and expiration
- [x] Extract character info from JWT claims
- [x] Store tokens securely (httpOnly cookies)
- [x] Implement token refresh before expiration
- [x] Support token revocation on logout
