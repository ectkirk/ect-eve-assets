import { app, ipcMain } from 'electron'
import { logger } from './logger.js'
import { isValidIdArray } from './validation.js'

const REF_API_BASE = 'https://edencom.net/api/v1'
const REF_API_KEY = process.env['REF_API_KEY'] || ''
const REF_MAX_RETRIES = 3
const REF_RETRY_BASE_DELAY_MS = 2000
const REF_MIN_REQUEST_INTERVAL_MS = 250
const REF_REQUEST_TIMEOUT_MS = 30000

let refGlobalRetryAfter = 0
let refLastRequestTime = 0
let cachedBaseHeaders: Record<string, string> | null = null
let cachedJsonHeaders: Record<string, string> | null = null

function getRefHeaders(contentType?: 'json'): Record<string, string> {
  if (contentType === 'json') {
    if (!cachedJsonHeaders) {
      cachedJsonHeaders = {
        'User-Agent': `ECTEVEAssets/${app.getVersion()} (ecteveassets@edencom.net; +https://github.com/ectkirk/ect-eve-assets)`,
        'Content-Type': 'application/json',
        ...(REF_API_KEY && { 'X-App-Key': REF_API_KEY }),
      }
    }
    return cachedJsonHeaders
  }
  if (!cachedBaseHeaders) {
    cachedBaseHeaders = {
      'User-Agent': `ECTEVEAssets/${app.getVersion()} (ecteveassets@edencom.net; +https://github.com/ectkirk/ect-eve-assets)`,
      ...(REF_API_KEY && { 'X-App-Key': REF_API_KEY }),
    }
  }
  return cachedBaseHeaders
}

function setRefGlobalBackoff(delayMs: number): void {
  const retryAt = Date.now() + delayMs
  if (retryAt > refGlobalRetryAfter) {
    refGlobalRetryAfter = retryAt
    logger.warn('Ref API global backoff set', {
      module: 'RefAPI',
      delayMs,
      retryAt,
    })
  }
}

async function waitForRefRateLimit(): Promise<void> {
  let now = Date.now()

  if (refGlobalRetryAfter > now) {
    await new Promise((r) => setTimeout(r, refGlobalRetryAfter - now))
    now = Date.now()
  }

  const timeSinceLastRequest = now - refLastRequestTime
  if (timeSinceLastRequest < REF_MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) =>
      setTimeout(r, REF_MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest)
    )
  }

  refLastRequestTime = Date.now()
}

async function fetchRefWithRetry(
  url: string,
  options: RequestInit
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= REF_MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      REF_REQUEST_TIMEOUT_MS
    )

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After')
        const retryAfterMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : REF_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)

        setRefGlobalBackoff(retryAfterMs)

        if (attempt < REF_MAX_RETRIES) {
          logger.warn('Ref API rate limited, retrying', {
            module: 'RefAPI',
            attempt: attempt + 1,
            delay: retryAfterMs,
          })
          await new Promise((r) => setTimeout(r, retryAfterMs))
          continue
        }
      }
      return response
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error('Request timeout')
      } else {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
      if (attempt < REF_MAX_RETRIES) {
        const delay = REF_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        logger.warn('Ref API request failed, retrying', {
          module: 'RefAPI',
          attempt: attempt + 1,
          delay,
          reason: lastError.message,
        })
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  throw lastError ?? new Error('Ref API request failed after retries')
}

type RefResult<T> = T | { error: string }

async function refGet<T>(
  endpoint: string,
  channel: string
): Promise<RefResult<T>> {
  await waitForRefRateLimit()
  try {
    const response = await fetchRefWithRetry(`${REF_API_BASE}${endpoint}`, {
      headers: getRefHeaders(),
    })
    if (!response.ok) {
      return { error: `HTTP ${response.status}` }
    }
    return await response.json()
  } catch (err) {
    logger.error(`${channel} fetch failed`, err, { module: 'RefAPI' })
    return { error: String(err) }
  }
}

async function refPost<T>(
  endpoint: string,
  body: unknown,
  channel: string
): Promise<RefResult<T>> {
  await waitForRefRateLimit()
  try {
    const response = await fetchRefWithRetry(`${REF_API_BASE}${endpoint}`, {
      method: 'POST',
      headers: getRefHeaders('json'),
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      return { error: `HTTP ${response.status}` }
    }
    return await response.json()
  } catch (err) {
    logger.error(`${channel} fetch failed`, err, { module: 'RefAPI' })
    return { error: String(err) }
  }
}

export function registerRefAPIHandlers(): void {
  ipcMain.handle('ref:categories', () =>
    refGet('/reference/categories', 'ref:categories')
  )
  ipcMain.handle('ref:groups', () => refGet('/reference/groups', 'ref:groups'))
  ipcMain.handle('ref:marketGroups', () =>
    refGet('/reference/market-groups', 'ref:marketGroups')
  )
  ipcMain.handle('ref:buybackInfo', () =>
    refGet('/buyback/info', 'ref:buybackInfo')
  )

  const universeEndpoints = [
    { channel: 'ref:universe-regions', endpoint: '/reference/regions' },
    { channel: 'ref:universe-systems', endpoint: '/reference/systems' },
    { channel: 'ref:universe-stations', endpoint: '/reference/stations' },
  ]

  for (const { channel, endpoint } of universeEndpoints) {
    ipcMain.handle(channel, async () => {
      const result = await refGet<{ items: unknown[] }>(endpoint, channel)
      if ('error' in result) return result
      return { items: result.items }
    })
  }

  ipcMain.handle('ref:types-page', async (_event, args: unknown) => {
    const { after } = (args ?? {}) as { after?: number }

    if (
      after !== undefined &&
      (typeof after !== 'number' || !Number.isInteger(after) || after <= 0)
    ) {
      return { error: 'Invalid after cursor' }
    }

    await waitForRefRateLimit()
    try {
      const url = after
        ? `${REF_API_BASE}/reference/types?after=${after}`
        : `${REF_API_BASE}/reference/types`

      const response = await fetchRefWithRetry(url, {
        headers: getRefHeaders(),
      })

      if (!response.ok) {
        return { error: `HTTP ${response.status}` }
      }

      const data = await response.json()
      return { items: data.items, pagination: data.pagination }
    } catch (err) {
      logger.error('ref:types-page fetch failed', err, { module: 'RefAPI' })
      return { error: String(err) }
    }
  })

  ipcMain.handle(
    'ref:universe-structures-page',
    async (_event, args: unknown) => {
      const { after } = (args ?? {}) as { after?: string }

      if (
        after !== undefined &&
        (typeof after !== 'string' || after.length === 0)
      ) {
        return { error: 'Invalid after cursor' }
      }

      await waitForRefRateLimit()
      try {
        const url = after
          ? `${REF_API_BASE}/reference/structures?after=${after}`
          : `${REF_API_BASE}/reference/structures`

        const response = await fetchRefWithRetry(url, {
          headers: getRefHeaders(),
        })

        if (!response.ok) {
          return { error: `HTTP ${response.status}` }
        }

        const data = await response.json()
        return { items: data.items, pagination: data.pagination }
      } catch (err) {
        logger.error('ref:universe-structures-page fetch failed', err, {
          module: 'RefAPI',
        })
        return { error: String(err) }
      }
    }
  )

  const idsEndpoints = [
    { channel: 'ref:moons', endpoint: '/reference/moons', max: 1000 },
  ]

  for (const { channel, endpoint, max } of idsEndpoints) {
    ipcMain.handle(channel, async (_event, ids: unknown) => {
      if (!isValidIdArray(ids, max)) {
        return { error: `Invalid ids array (max ${max})` }
      }
      return refPost(endpoint, { ids }, channel)
    })
  }

  ipcMain.handle('ref:marketJita', async (_event, params: unknown) => {
    if (typeof params !== 'object' || params === null) {
      return { error: 'Invalid params' }
    }
    const p = params as Record<string, unknown>

    const body: {
      typeIds?: number[]
      itemIds?: number[]
      contractTypeIds?: number[]
      includePlex?: boolean
    } = {}

    if (Array.isArray(p.typeIds) && p.typeIds.length > 0) {
      if (!isValidIdArray(p.typeIds, 1000)) {
        return { error: 'Invalid typeIds array (max 1000)' }
      }
      body.typeIds = p.typeIds
    }

    if (Array.isArray(p.itemIds) && p.itemIds.length > 0) {
      if (!isValidIdArray(p.itemIds, 1000)) {
        return { error: 'Invalid itemIds array (max 1000)' }
      }
      body.itemIds = p.itemIds
    }

    if (Array.isArray(p.contractTypeIds) && p.contractTypeIds.length > 0) {
      if (!isValidIdArray(p.contractTypeIds, 100)) {
        return { error: 'Invalid contractTypeIds array (max 100)' }
      }
      body.contractTypeIds = p.contractTypeIds
    }

    if (p.includePlex === true) {
      body.includePlex = true
    }

    if (
      !body.typeIds &&
      !body.itemIds &&
      !body.contractTypeIds &&
      !body.includePlex
    ) {
      return {
        error:
          'At least one of typeIds, itemIds, contractTypeIds, or includePlex required',
      }
    }

    return refPost('/market/jita', body, 'ref:marketJita')
  })

  ipcMain.handle(
    'ref:buybackCalculate',
    async (_event, text: unknown, config: unknown) => {
      if (typeof text !== 'string' || !text.trim()) {
        return { error: 'Text is required' }
      }
      if (typeof config !== 'object' || config === null) {
        return { error: 'Config is required' }
      }

      await waitForRefRateLimit()
      try {
        const response = await fetchRefWithRetry(
          `${REF_API_BASE}/buyback/calculate`,
          {
            method: 'POST',
            headers: getRefHeaders('json'),
            body: JSON.stringify({ text, config }),
          }
        )
        if (!response.ok) {
          const errorText = await response.text()
          return { error: `HTTP ${response.status}: ${errorText}` }
        }
        return await response.json()
      } catch (err) {
        logger.error('ref:buybackCalculate fetch failed', err, {
          module: 'RefAPI',
        })
        return { error: String(err) }
      }
    }
  )

  ipcMain.handle('ref:shippingInfo', () =>
    refGet('/shipping/info', 'ref:shippingInfo')
  )

  ipcMain.handle(
    'ref:shippingCalculate',
    async (_event, text: unknown, nullSec?: unknown) => {
      if (typeof text !== 'string' || !text.trim()) {
        return { error: 'Text is required' }
      }
      const body: { text: string; nullSec?: boolean } = { text }
      if (nullSec === true) {
        body.nullSec = true
      }
      return refPost('/shipping/calculate', body, 'ref:shippingCalculate')
    }
  )

  ipcMain.handle('ref:contractsSearch', async (_event, params: unknown) => {
    if (typeof params !== 'object' || params === null) {
      return { error: 'Invalid params' }
    }

    await waitForRefRateLimit()
    try {
      const response = await fetchRefWithRetry(
        `${REF_API_BASE}/contracts/search`,
        {
          method: 'POST',
          headers: getRefHeaders('json'),
          body: JSON.stringify(params),
        }
      )
      if (!response.ok) {
        const errorText = await response.text()
        return { error: `HTTP ${response.status}: ${errorText}` }
      }
      return await response.json()
    } catch (err) {
      logger.error('ref:contractsSearch fetch failed', err, {
        module: 'RefAPI',
      })
      return { error: String(err) }
    }
  })
}
