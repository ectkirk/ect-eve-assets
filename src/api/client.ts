import { useAuthStore, ownerKey } from '@/store/auth-store'

export const ESI_BASE_URL = 'https://esi.evetech.net/latest'
export const ESI_COMPATIBILITY_DATE = '2025-11-06'

export interface ESIError {
  error: string
  timeout?: number
}

interface CacheEntry {
  data: unknown
  etag: string
  expires: number
}

// Simple in-memory cache for ETag/Expires tracking
const cache = new Map<string, CacheEntry>()

export class ESIClient {
  private baseUrl: string

  constructor(baseUrl = ESI_BASE_URL) {
    this.baseUrl = baseUrl
  }

  // Get access token for a character (used for API calls)
  // characterId is the actual character making the request (for auth)
  private async getAccessToken(characterId?: number): Promise<string> {
    const store = useAuthStore.getState()

    // If no characterId specified, use active owner's characterId
    let targetCharId = characterId
    if (!targetCharId) {
      const activeOwner = store.getActiveOwner()
      if (!activeOwner) {
        throw new Error('No active owner')
      }
      targetCharId = activeOwner.characterId
    }

    // Find the character owner (not corporation) for this characterId
    const charOwnerKey = ownerKey('character', targetCharId)
    let owner = store.getOwner(charOwnerKey)

    // If not found as character, check if any owner uses this characterId
    if (!owner) {
      owner = store.getOwnerByCharacterId(targetCharId)
    }

    if (!owner) {
      throw new Error(`No owner found for character ${targetCharId}`)
    }

    const ownerId = ownerKey(owner.type, owner.id)

    // If no access token or token expired, try to refresh
    const needsRefresh = !owner.accessToken || store.isOwnerTokenExpired(ownerId)

    if (needsRefresh && owner.refreshToken && window.electronAPI) {
      const result = await window.electronAPI.refreshToken(owner.refreshToken, owner.characterId)
      if (result.success && result.accessToken && result.refreshToken) {
        store.updateOwnerTokens(ownerId, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
        })
        return result.accessToken
      }
      throw new Error('Token refresh failed')
    }

    if (!owner.accessToken) {
      throw new Error('Not authenticated - no access token and refresh failed')
    }

    return owner.accessToken
  }

  async fetch<T>(
    endpoint: string,
    options: RequestInit = {},
    characterId?: number
  ): Promise<T> {
    const accessToken = await this.getAccessToken(characterId)
    const url = `${this.baseUrl}${endpoint}`
    const cacheKey = `${characterId ?? 'active'}:${url}`

    // Check if we have cached data that hasn't expired
    const cached = cache.get(cacheKey)
    if (cached && Date.now() < cached.expires) {
      return cached.data as T
    }

    const headers: HeadersInit = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
      ...options.headers,
    }

    // Use ETag for conditional request if we have cached data
    if (cached?.etag) {
      ;(headers as Record<string, string>)['If-None-Match'] = cached.etag
    }

    const response = await fetch(url, { ...options, headers })

    // Handle rate limiting - respect Retry-After
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : 60
      throw new Error(`Rate limited. Retry after ${waitSeconds} seconds`)
    }

    // Handle 304 Not Modified - return cached data
    if (response.status === 304 && cached) {
      // Update cache expiry from new headers
      const expires = response.headers.get('Expires')
      if (expires) {
        cached.expires = new Date(expires).getTime()
      }
      return cached.data as T
    }

    if (!response.ok) {
      const error = (await response.json()) as ESIError
      throw new Error(error.error || `ESI request failed: ${response.status}`)
    }

    const data = (await response.json()) as T

    // Cache the response with ETag and Expires
    const etag = response.headers.get('ETag')
    const expires = response.headers.get('Expires')
    if (etag && expires) {
      cache.set(cacheKey, {
        data,
        etag,
        expires: new Date(expires).getTime(),
      })
    }

    return data
  }

  async fetchWithPagination<T>(
    endpoint: string,
    options: RequestInit = {},
    characterId?: number
  ): Promise<T[]> {
    const results: T[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const accessToken = await this.getAccessToken(characterId)
      const separator = endpoint.includes('?') ? '&' : '?'
      const url = `${this.baseUrl}${endpoint}${separator}page=${page}`

      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
          ...options.headers,
        },
      })

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : 60
        throw new Error(`Rate limited. Retry after ${waitSeconds} seconds`)
      }

      if (!response.ok) {
        const error = (await response.json()) as ESIError
        throw new Error(error.error || `ESI request failed: ${response.status}`)
      }

      const data = (await response.json()) as T[]
      results.push(...data)

      // Check X-Pages header for total pages
      const xPages = response.headers.get('X-Pages')
      const totalPages = xPages ? parseInt(xPages, 10) : 1
      hasMore = page < totalPages
      page++
    }

    return results
  }
}

// Singleton client instance
export const esiClient = new ESIClient()
