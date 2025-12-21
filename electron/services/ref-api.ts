import { app, ipcMain } from 'electron'
import { logger } from './logger.js'

const REF_API_BASE = 'https://edencom.net/api/v1'
const REF_API_KEY = process.env['REF_API_KEY'] || ''
const REF_MAX_RETRIES = 3
const REF_RETRY_BASE_DELAY_MS = 2000
const REF_MIN_REQUEST_INTERVAL_MS = 250

let refGlobalRetryAfter = 0
let refLastRequestTime = 0

function getRefHeaders(contentType?: 'json'): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': `ECTEVEAssets/${app.getVersion()} (ecteveassets@edencom.net; +https://github.com/ectkirk/ect-eve-assets)`,
  }
  if (REF_API_KEY) {
    headers['X-App-Key'] = REF_API_KEY
  }
  if (contentType === 'json') {
    headers['Content-Type'] = 'application/json'
  }
  return headers
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
  const now = Date.now()

  if (refGlobalRetryAfter > now) {
    const waitMs = refGlobalRetryAfter - now
    logger.debug('Waiting for global backoff', { module: 'RefAPI', waitMs })
    await new Promise((r) => setTimeout(r, waitMs))
  }

  const timeSinceLastRequest = Date.now() - refLastRequestTime
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
    try {
      const response = await fetch(url, options)
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
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < REF_MAX_RETRIES) {
        const delay = REF_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        logger.warn('Ref API request failed, retrying', {
          module: 'RefAPI',
          attempt: attempt + 1,
          delay,
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

function validateIds(
  ids: unknown,
  maxLength: number
): ids is number[] {
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= maxLength &&
    ids.every((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)
  )
}

export function registerRefAPIHandlers(): void {
  ipcMain.handle('ref:categories', () =>
    refGet('/reference/categories', 'ref:categories')
  )
  ipcMain.handle('ref:groups', () =>
    refGet('/reference/groups', 'ref:groups')
  )
  ipcMain.handle('ref:blueprints', () =>
    refGet('/reference/blueprints', 'ref:blueprints')
  )
  ipcMain.handle('ref:marketPlex', () =>
    refGet('/market/plex', 'ref:marketPlex')
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

      const response = await fetchRefWithRetry(url, { headers: getRefHeaders() })

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

  ipcMain.handle('ref:universe-structures-page', async (_event, args: unknown) => {
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

      const response = await fetchRefWithRetry(url, { headers: getRefHeaders() })

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
  })

  const idsEndpoints = [
    { channel: 'ref:implants', endpoint: '/reference/implants', max: 1000 },
    { channel: 'ref:moons', endpoint: '/reference/moons', max: 1000 },
    { channel: 'ref:shipslots', endpoint: '/reference/shipslots', max: 500 },
  ]

  for (const { channel, endpoint, max } of idsEndpoints) {
    ipcMain.handle(channel, async (_event, ids: unknown) => {
      if (!validateIds(ids, max)) {
        return { error: `Invalid ids array (max ${max})` }
      }
      return refPost(endpoint, { ids }, channel)
    })
  }

  ipcMain.handle('ref:marketJita', async (_event, typeIds: unknown) => {
    if (!validateIds(typeIds, 1000)) {
      return { error: 'Invalid typeIds array (max 1000)' }
    }
    return refPost('/market/jita', { typeIds }, 'ref:marketJita')
  })

  ipcMain.handle('ref:marketContracts', async (_event, typeIds: unknown) => {
    if (!validateIds(typeIds, 100)) {
      return { error: 'Invalid typeIds array (max 100)' }
    }
    return refPost('/market/contracts', { typeIds }, 'ref:marketContracts')
  })

  ipcMain.handle('ref:market', async (_event, params: unknown) => {
    if (typeof params !== 'object' || params === null) {
      return { error: 'Invalid params' }
    }
    const p = params as Record<string, unknown>
    if (
      typeof p.regionId !== 'number' ||
      !Number.isInteger(p.regionId) ||
      p.regionId <= 0
    ) {
      return { error: 'Invalid regionId' }
    }
    if (!validateIds(p.typeIds, 100)) {
      return { error: 'Invalid typeIds array (max 100)' }
    }

    const body: Record<string, unknown> = {
      regionId: p.regionId,
      typeIds: p.typeIds,
    }
    if (p.avg === true) body.avg = true
    if (p.buy === true) body.buy = true
    if (p.jita === true) body.jita = true

    return refPost('/market/bulk', body, 'ref:market')
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
        logger.error('ref:buybackCalculate fetch failed', err, { module: 'RefAPI' })
        return { error: String(err) }
      }
    }
  )

  ipcMain.handle('ref:buybackCalculator', async (_event, text: unknown) => {
    if (typeof text !== 'string' || !text.trim()) {
      return { error: 'Text is required' }
    }

    await waitForRefRateLimit()
    try {
      const response = await fetchRefWithRetry(
        'https://edencom.net/api/buyback/calculator',
        {
          method: 'POST',
          headers: getRefHeaders('json'),
          body: JSON.stringify({ text }),
        }
      )
      if (!response.ok) {
        const errorText = await response.text()
        return { error: `HTTP ${response.status}: ${errorText}` }
      }
      return await response.json()
    } catch (err) {
      logger.error('ref:buybackCalculator fetch failed', err, { module: 'RefAPI' })
      return { error: String(err) }
    }
  })
}
