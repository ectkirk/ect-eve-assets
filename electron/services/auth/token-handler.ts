import { URL } from 'node:url'
import * as jose from 'jose'
import { logger } from '../logger.js'
import { EVE_SSO } from './config.js'
import type { CorporationRoles } from '../../../shared/electron-api-types.js'

export type { CorporationRoles }

const JWKS = jose.createRemoteJWKSet(new URL(EVE_SSO.jwksUrl))

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
}

export interface JWTPayload {
  sub: string
  name: string
  scp: string | string[]
  iss: string
  exp: number
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: EVE_SSO.issuer,
  })
  return payload as unknown as JWTPayload
}

export function extractCharacterId(sub: string): number {
  const parts = sub.split(':')
  const idPart = parts[2]
  if (!idPart) {
    throw new Error('Invalid sub claim format')
  }
  return parseInt(idPart, 10)
}

export function extractScopes(scp: string | string[]): string[] {
  if (Array.isArray(scp)) return scp
  return scp.split(' ')
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const response = await fetch(EVE_SSO.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Host: 'login.eveonline.com',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: EVE_SSO.clientId,
      code,
      code_verifier: codeVerifier,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  return (await response.json()) as TokenResponse
}

export interface ESICharacterInfo {
  corporation_id: number
  name: string
}

export async function fetchCharacterInfo(
  characterId: number
): Promise<ESICharacterInfo> {
  const response = await fetch(
    `https://esi.evetech.net/characters/${characterId}`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch character info')
  }
  return response.json() as Promise<ESICharacterInfo>
}

export async function fetchCharacterRoles(
  characterId: number,
  accessToken: string
): Promise<CorporationRoles | null> {
  try {
    const response = await fetch(
      `https://esi.evetech.net/characters/${characterId}/roles`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
    if (!response.ok) {
      logger.debug('Failed to fetch character roles', {
        module: 'Auth',
        characterId,
        status: response.status,
      })
      return null
    }
    return (await response.json()) as CorporationRoles
  } catch (err) {
    logger.debug('Error fetching character roles', {
      module: 'Auth',
      characterId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
