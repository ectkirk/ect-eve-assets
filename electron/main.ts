import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, shell, safeStorage, screen } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import fs from 'node:fs'
import { startAuth, refreshAccessToken, revokeToken, cancelAuth } from './services/auth.js'
import { logger, initLogger, type LogLevel, type LogContext } from './services/logger.js'
import { initUpdater, installUpdate } from './services/updater.js'
import { getESIService } from './services/esi/index.js'
import type { ESIRequestOptions } from './services/esi/types.js'

// User data storage path
const userDataPath = app.getPath('userData')
const storageFile = path.join(userDataPath, 'auth-storage.json')
const windowStateFile = path.join(userDataPath, 'window-state.json')

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1800,
  height: 900,
}

function loadWindowState(): WindowState {
  try {
    if (fs.existsSync(windowStateFile)) {
      const data = JSON.parse(fs.readFileSync(windowStateFile, 'utf-8'))
      if (data.width && data.height) {
        return data
      }
    }
  } catch (err) {
    console.error('[WindowState] Failed to load:', err)
  }
  return DEFAULT_WINDOW_STATE
}

function saveWindowState(state: WindowState): void {
  try {
    fs.mkdirSync(userDataPath, { recursive: true })
    fs.writeFileSync(windowStateFile, JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    console.error('[WindowState] Failed to save:', err)
  }
}

function canEncrypt(): boolean {
  return safeStorage.isEncryptionAvailable()
}

function readStorage(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(storageFile)) return null

    const fileData = fs.readFileSync(storageFile)

    if (canEncrypt()) {
      try {
        const decrypted = safeStorage.decryptString(fileData)
        return JSON.parse(decrypted)
      } catch {
        // File might be plaintext from before encryption was available
        const text = fileData.toString('utf-8')
        if (text.startsWith('{')) {
          return JSON.parse(text)
        }
        throw new Error('Cannot decrypt storage')
      }
    } else {
      console.warn('[Storage] Encryption not available, using plaintext')
      return JSON.parse(fileData.toString('utf-8'))
    }
  } catch (err) {
    console.error('[Storage] Failed to read:', err)
  }
  return null
}

function writeStorage(data: Record<string, unknown>): void {
  try {
    fs.mkdirSync(userDataPath, { recursive: true })

    if (canEncrypt()) {
      const encrypted = safeStorage.encryptString(JSON.stringify(data))
      fs.writeFileSync(storageFile, encrypted, { mode: 0o600 })
    } else {
      console.warn('[Storage] Encryption not available, using plaintext')
      fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), { mode: 0o600, encoding: 'utf-8' })
    }
  } catch (err) {
    console.error('[Storage] Failed to write:', err)
  }
}

const APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(APP_ROOT, 'dist')
export const VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(APP_ROOT, 'public')
  : RENDERER_DIST

let mainWindow: BrowserWindow | null = null
let isManuallyMaximized = false
let restoreBounds: Electron.Rectangle | null = null
const characterTokens = new Map<number, string>()

function createWindow() {
  const savedState = loadWindowState()

  mainWindow = new BrowserWindow({
    x: savedState.x,
    y: savedState.y,
    width: savedState.width,
    height: savedState.height,
    minWidth: 1024,
    minHeight: 768,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    icon: path.join(VITE_PUBLIC, 'icon.png'),
    title: 'ECT EVE Assets',
    backgroundColor: '#0f172a',
  })

  if (savedState.isMaximized) {
    mainWindow.maximize()
  }

  const saveCurrentState = () => {
    if (!mainWindow) return
    const bounds = mainWindow.getBounds()
    saveWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: mainWindow.isMaximized(),
    })
  }

  mainWindow.on('close', saveCurrentState)
  mainWindow.on('resized', saveCurrentState)
  mainWindow.on('moved', saveCurrentState)

  // Open external links in default browser (validate protocol)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {
      // Invalid URL, ignore
    }
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Dev tools (development only)
    if (!app.isPackaged) {
      if (input.key === 'F12') {
        mainWindow?.webContents.toggleDevTools()
        event.preventDefault()
        return
      }
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow?.webContents.toggleDevTools()
        event.preventDefault()
        return
      }
    }

    // Quit: Ctrl+Q
    if (input.control && input.key.toLowerCase() === 'q') {
      app.quit()
      event.preventDefault()
      return
    }

    // Reload: Ctrl+R
    if (input.control && input.key.toLowerCase() === 'r' && !input.shift) {
      mainWindow?.webContents.reload()
      event.preventDefault()
      return
    }

    // Force Reload: Ctrl+Shift+R
    if (input.control && input.shift && input.key.toLowerCase() === 'r') {
      mainWindow?.webContents.reloadIgnoringCache()
      event.preventDefault()
      return
    }

    // Fullscreen: F11
    if (input.key === 'F11') {
      mainWindow?.setFullScreen(!mainWindow.isFullScreen())
      event.preventDefault()
      return
    }

    // Zoom In: Ctrl++ or Ctrl+=
    if (input.control && (input.key === '+' || input.key === '=')) {
      const currentZoom = mainWindow?.webContents.getZoomLevel() ?? 0
      mainWindow?.webContents.setZoomLevel(currentZoom + 0.5)
      event.preventDefault()
      return
    }

    // Zoom Out: Ctrl+-
    if (input.control && input.key === '-') {
      const currentZoom = mainWindow?.webContents.getZoomLevel() ?? 0
      mainWindow?.webContents.setZoomLevel(currentZoom - 0.5)
      event.preventDefault()
      return
    }

    // Reset Zoom: Ctrl+0
    if (input.control && input.key === '0') {
      mainWindow?.webContents.setZoomLevel(0)
      event.preventDefault()
      return
    }
  })

  // Log ALL renderer console messages to terminal
  mainWindow.webContents.on('console-message', (event) => {
    const levelMap: Record<string, string> = { '0': 'LOG', '1': 'INFO', '2': 'WARN', '3': 'ERROR' }
    const levelName = levelMap[String(event.level)] || 'LOG'
    console.log(`[Renderer:${levelName}] ${event.message}`)
  })

  // Catch renderer crashes
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[CRASH] Renderer process gone:', details.reason)
  })

  // Sync state when native maximize/unmaximize occurs (e.g., Windows snap)
  mainWindow.on('maximize', () => {
    isManuallyMaximized = true
    mainWindow?.webContents.send('window:maximizeChange', true)
  })
  mainWindow.on('unmaximize', () => {
    isManuallyMaximized = false
    mainWindow?.webContents.send('window:maximizeChange', false)
  })
}

// IPC handlers for auth
ipcMain.handle('auth:start', async (_event, includeCorporationScopes: unknown) => {
  const includeCorpScopes = typeof includeCorporationScopes === 'boolean' ? includeCorporationScopes : false
  const result = await startAuth(includeCorpScopes)
  if (result.success && result.refreshToken && result.characterId) {
    characterTokens.set(result.characterId, result.refreshToken)
  }
  return result
})

ipcMain.handle('auth:cancel', () => {
  cancelAuth()
})

ipcMain.handle('auth:refresh', async (_event, refreshToken: unknown, characterId: unknown) => {
  if (typeof refreshToken !== 'string' || refreshToken.length === 0 || refreshToken.length > 4000) {
    return { success: false, error: 'Invalid refresh token' }
  }
  if (typeof characterId !== 'number' || !Number.isInteger(characterId) || characterId <= 0) {
    return { success: false, error: 'Invalid character ID' }
  }
  const result = await refreshAccessToken(refreshToken)
  if (result.success && result.refreshToken && characterId) {
    characterTokens.set(characterId, result.refreshToken)
  }
  return result
})

ipcMain.handle('auth:logout', async (_event, characterId: unknown) => {
  if (characterId !== undefined) {
    if (typeof characterId !== 'number' || !Number.isInteger(characterId) || characterId <= 0) {
      return { success: false, error: 'Invalid character ID' }
    }
    const token = characterTokens.get(characterId)
    if (token) {
      await revokeToken(token)
      characterTokens.delete(characterId)
    }
  } else {
    for (const [id, token] of characterTokens) {
      await revokeToken(token)
      characterTokens.delete(id)
    }
  }
  return { success: true }
})


// File-based storage IPC handlers (replaces localStorage for persistence)
ipcMain.handle('storage:get', () => {
  return readStorage()
})

const MAX_STORAGE_SIZE = 5 * 1024 * 1024 // 5MB

ipcMain.handle('storage:set', (_event, data: unknown) => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    console.error('[Storage] Invalid data type')
    return false
  }
  try {
    const json = JSON.stringify(data)
    if (json.length > MAX_STORAGE_SIZE) {
      console.error('[Storage] Data exceeds size limit')
      return false
    }
  } catch {
    console.error('[Storage] Data not serializable')
    return false
  }
  writeStorage(data as Record<string, unknown>)
  return true
})

// Logging IPC handler
const VALID_LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const
const MAX_LOG_MESSAGE_LENGTH = 10000
const MAX_LOG_CONTEXT_SIZE = 50000

ipcMain.handle('log:write', (_event, level: unknown, message: unknown, context: unknown) => {
  if (typeof level !== 'string' || !VALID_LOG_LEVELS.includes(level as LogLevel)) {
    return
  }
  if (typeof message !== 'string') {
    return
  }
  const truncatedMessage = message.slice(0, MAX_LOG_MESSAGE_LENGTH)

  let validContext: LogContext | undefined
  if (context !== undefined) {
    if (typeof context !== 'object' || context === null || Array.isArray(context)) {
      return
    }
    try {
      const contextJson = JSON.stringify(context)
      if (contextJson.length > MAX_LOG_CONTEXT_SIZE) {
        return
      }
      validContext = context as LogContext
    } catch {
      return
    }
  }

  const logContext = { ...validContext, source: 'renderer' }
  switch (level as LogLevel) {
    case 'DEBUG':
      logger.debug(truncatedMessage, logContext)
      break
    case 'INFO':
      logger.info(truncatedMessage, logContext)
      break
    case 'WARN':
      logger.warn(truncatedMessage, logContext)
      break
    case 'ERROR':
      logger.error(truncatedMessage, undefined, logContext)
      break
  }
})

ipcMain.handle('log:getDir', () => {
  return logger.getLogDir()
})

ipcMain.handle('log:openFolder', () => {
  const logDir = logger.getLogDir()
  shell.openPath(logDir)
})

const BUG_REPORT_WEBHOOK = 'https://discord.com/api/webhooks/1451197565927424001/diQ7bJRG4X526UM3pOmvx2nJ-ZyjzxgvDdXn5lwOgYsMZtnFr_NVqjaiJhRudnTxoGAP'

ipcMain.handle('bug:report', async (_event, characterName: unknown, description: unknown) => {
  if (typeof description !== 'string' || !description.trim()) {
    return { success: false, error: 'Description is required' }
  }

  try {
    const response = await fetch(BUG_REPORT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: 'Bug Report',
          color: 0xED4245,
          fields: [
            {
              name: 'Contact',
              value: typeof characterName === 'string' && characterName.trim() ? characterName.trim() : 'Not provided',
              inline: true,
            },
            {
              name: 'Description',
              value: description.trim().substring(0, 1024),
            },
          ],
          timestamp: new Date().toISOString(),
        }],
      }),
    })

    if (!response.ok) {
      return { success: false, error: 'Failed to submit report' }
    }

    return { success: true }
  } catch (err) {
    logger.error('Bug report submission failed', err, { module: 'BugReport' })
    return { success: false, error: 'Failed to submit report' }
  }
})

ipcMain.handle('updater:install', () => {
  installUpdate()
})

const REF_API_BASE = 'https://edencom.net/api/v1'
const REF_API_KEY = process.env['REF_API_KEY'] || ''
const MAX_REF_IDS = 1000
const REF_REQUEST_DELAY_MS = 2000
const REF_MAX_RETRIES = 3
const REF_RETRY_BASE_DELAY_MS = 2000

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

interface RefQueue {
  lastRequestTime: number
  queue: Array<() => void>
  processing: boolean
}

type RefQueueName = 'types' | 'universe' | 'other'

const refQueues: Record<RefQueueName, RefQueue> = {
  types: { lastRequestTime: 0, queue: [], processing: false },
  universe: { lastRequestTime: 0, queue: [], processing: false },
  other: { lastRequestTime: 0, queue: [], processing: false },
}

let refGlobalRetryAfter = 0

function setRefGlobalBackoff(delayMs: number): void {
  const retryAt = Date.now() + delayMs
  if (retryAt > refGlobalRetryAfter) {
    refGlobalRetryAfter = retryAt
    logger.warn('Ref API global backoff set', { module: 'Main', delayMs, retryAt })
  }
}

async function waitForGlobalBackoff(): Promise<void> {
  const now = Date.now()
  if (refGlobalRetryAfter > now) {
    const waitMs = refGlobalRetryAfter - now
    logger.debug('Waiting for global backoff', { module: 'Main', waitMs })
    await new Promise((r) => setTimeout(r, waitMs))
  }
}

async function processRefQueue(queueName: RefQueueName): Promise<void> {
  const q = refQueues[queueName]
  if (q.processing) return
  q.processing = true

  while (q.queue.length > 0) {
    await waitForGlobalBackoff()

    const now = Date.now()
    const timeSinceLastRequest = now - q.lastRequestTime
    if (timeSinceLastRequest < REF_REQUEST_DELAY_MS) {
      await new Promise((r) => setTimeout(r, REF_REQUEST_DELAY_MS - timeSinceLastRequest))
    }
    q.lastRequestTime = Date.now()
    const next = q.queue.shift()
    if (next) next()
  }

  q.processing = false
}

function queueRefRequest<T>(fn: () => Promise<T>, queueName: RefQueueName = 'other'): Promise<T> {
  const q = refQueues[queueName]
  return new Promise((resolve, reject) => {
    q.queue.push(() => {
      fn().then(resolve).catch(reject)
    })
    processRefQueue(queueName)
  })
}

async function fetchRefWithRetry(url: string, options: RequestInit): Promise<Response> {
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
          logger.warn('Ref API rate limited, retrying', { module: 'Main', attempt: attempt + 1, delay: retryAfterMs })
          await new Promise((r) => setTimeout(r, retryAfterMs))
          continue
        }
      }
      return response
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < REF_MAX_RETRIES) {
        const delay = REF_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        logger.warn('Ref API request failed, retrying', { module: 'Main', attempt: attempt + 1, delay })
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  throw lastError ?? new Error('Ref API request failed after retries')
}

ipcMain.handle('ref:types', async (_event, ids: unknown, stationId?: unknown) => {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_REF_IDS) {
    return { error: 'Invalid ids array' }
  }
  if (!ids.every((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)) {
    return { error: 'Invalid id values' }
  }
  if (stationId !== undefined && (typeof stationId !== 'number' || !Number.isInteger(stationId) || stationId <= 0)) {
    return { error: 'Invalid station_id' }
  }

  return queueRefRequest(async () => {
    try {
      let url = `${REF_API_BASE}/types`
      if (stationId) {
        url += `?station_id=${stationId}`
      }
      const response = await fetchRefWithRetry(url, {
        method: 'POST',
        headers: getRefHeaders('json'),
        body: JSON.stringify({ ids }),
      })
      if (!response.ok) {
        return { error: `HTTP ${response.status}` }
      }
      return await response.json()
    } catch (err) {
      logger.error('ref:types fetch failed', err, { module: 'Main' })
      return { error: String(err) }
    }
  }, 'types')
})

ipcMain.handle('ref:universe', async (_event, ids: unknown) => {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_REF_IDS) {
    return { error: 'Invalid ids array' }
  }
  if (!ids.every((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)) {
    return { error: 'Invalid id values' }
  }

  return queueRefRequest(async () => {
    try {
      const response = await fetchRefWithRetry(`${REF_API_BASE}/universe`, {
        method: 'POST',
        headers: getRefHeaders('json'),
        body: JSON.stringify({ ids }),
      })
      if (!response.ok) {
        return { error: `HTTP ${response.status}` }
      }
      return await response.json()
    } catch (err) {
      logger.error('ref:universe fetch failed', err, { module: 'Main' })
      return { error: String(err) }
    }
  }, 'universe')
})

ipcMain.handle('ref:ships', async (_event, ids: unknown) => {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_REF_IDS) {
    return { error: 'Invalid ids array' }
  }
  if (!ids.every((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)) {
    return { error: 'Invalid id values' }
  }

  return queueRefRequest(async () => {
    try {
      const response = await fetchRefWithRetry(`${REF_API_BASE}/ships`, {
        method: 'POST',
        headers: getRefHeaders('json'),
        body: JSON.stringify({ ids }),
      })
      if (!response.ok) {
        return { error: `HTTP ${response.status}` }
      }
      return await response.json()
    } catch (err) {
      logger.error('ref:ships fetch failed', err, { module: 'Main' })
      return { error: String(err) }
    }
  })
})

ipcMain.handle('ref:manufacturingCost', async (_event, params: unknown) => {
  if (typeof params !== 'object' || params === null) {
    return { error: 'Invalid params' }
  }
  const p = params as Record<string, unknown>
  if (typeof p.system_id !== 'number') {
    return { error: 'system_id is required' }
  }
  if (p.product_id === undefined && p.blueprint_id === undefined) {
    return { error: 'product_id or blueprint_id is required' }
  }

  return queueRefRequest(async () => {
    try {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(p)) {
        if (value !== undefined && value !== null) {
          searchParams.set(key, String(value))
        }
      }
      const response = await fetchRefWithRetry(`${REF_API_BASE}/manufacturing-cost?${searchParams}`, {
        headers: getRefHeaders(),
      })
      if (!response.ok) {
        const text = await response.text()
        return { error: `HTTP ${response.status}: ${text}` }
      }
      return await response.json()
    } catch (err) {
      logger.error('ref:manufacturingCost fetch failed', err, { module: 'Main' })
      return { error: String(err) }
    }
  })
})

ipcMain.handle('ref:blueprintResearch', async (_event, params: unknown) => {
  if (typeof params !== 'object' || params === null) {
    return { error: 'Invalid params' }
  }
  const p = params as Record<string, unknown>
  if (typeof p.blueprint_id !== 'number') {
    return { error: 'blueprint_id is required' }
  }
  if (typeof p.system_id !== 'number') {
    return { error: 'system_id is required' }
  }

  return queueRefRequest(async () => {
    try {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(p)) {
        if (value !== undefined && value !== null) {
          searchParams.set(key, String(value))
        }
      }
      const response = await fetchRefWithRetry(`${REF_API_BASE}/blueprint-research?${searchParams}`, {
        headers: getRefHeaders(),
      })
      if (!response.ok) {
        const text = await response.text()
        return { error: `HTTP ${response.status}: ${text}` }
      }
      return await response.json()
    } catch (err) {
      logger.error('ref:blueprintResearch fetch failed', err, { module: 'Main' })
      return { error: String(err) }
    }
  })
})

ipcMain.handle('ref:blueprints', async () => {
  return queueRefRequest(async () => {
    try {
      const response = await fetchRefWithRetry(`${REF_API_BASE}/blueprints`, {
        headers: getRefHeaders(),
      })
      if (!response.ok) {
        return { error: `HTTP ${response.status}` }
      }
      return await response.json()
    } catch (err) {
      logger.error('ref:blueprints fetch failed', err, { module: 'Main' })
      return { error: String(err) }
    }
  })
})

ipcMain.handle('ref:systems', async () => {
  return queueRefRequest(async () => {
    try {
      const response = await fetchRefWithRetry(`${REF_API_BASE}/systems`, {
        headers: getRefHeaders(),
      })
      if (!response.ok) {
        return { error: `HTTP ${response.status}` }
      }
      return await response.json()
    } catch (err) {
      logger.error('ref:systems fetch failed', err, { module: 'Main' })
      return { error: String(err) }
    }
  })
})

ipcMain.handle(
  'ref:buybackCalculate',
  async (
    _event,
    text: unknown,
    config: unknown
  ): Promise<object | { error: string }> => {
    if (typeof text !== 'string' || !text.trim()) {
      return { error: 'Text is required' }
    }
    if (typeof config !== 'object' || config === null) {
      return { error: 'Config is required' }
    }

    return queueRefRequest(async () => {
      try {
        const response = await fetchRefWithRetry(`${REF_API_BASE}/buyback/calculate`, {
          method: 'POST',
          headers: getRefHeaders('json'),
          body: JSON.stringify({ text, config }),
        })
        if (!response.ok) {
          const errorText = await response.text()
          return { error: `HTTP ${response.status}: ${errorText}` }
        }
        return await response.json()
      } catch (err) {
        logger.error('ref:buybackCalculate fetch failed', err, { module: 'Main' })
        return { error: String(err) }
      }
    })
  }
)

ipcMain.handle(
  'ref:buybackCalculator',
  async (_event, text: unknown): Promise<object | { error: string }> => {
    if (typeof text !== 'string' || !text.trim()) {
      return { error: 'Text is required' }
    }

    return queueRefRequest(async () => {
      try {
        const response = await fetchRefWithRetry('https://edencom.net/api/buyback/calculator', {
          method: 'POST',
          headers: getRefHeaders('json'),
          body: JSON.stringify({ text }),
        })
        if (!response.ok) {
          const errorText = await response.text()
          return { error: `HTTP ${response.status}: ${errorText}` }
        }
        return await response.json()
      } catch (err) {
        logger.error('ref:buybackCalculator fetch failed', err, { module: 'Main' })
        return { error: String(err) }
      }
    })
  }
)

const MUTAMARKET_API_BASE = 'https://mutamarket.com/api'
const MUTAMARKET_TIMEOUT_MS = 5000

ipcMain.handle('mutamarket:module', async (_event, itemId: unknown) => {
  if (typeof itemId !== 'number' || !Number.isInteger(itemId) || itemId <= 0) {
    return { error: 'Invalid item ID' }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), MUTAMARKET_TIMEOUT_MS)

    const response = await fetch(`${MUTAMARKET_API_BASE}/modules/${itemId}`, {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      return { error: `HTTP ${response.status}`, status: response.status }
    }
    return await response.json()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { error: 'Timeout' }
    }
    logger.error('mutamarket:module fetch failed', err, { module: 'Main', itemId })
    return { error: String(err) }
  }
})

interface PendingTokenRequest {
  resolve: (token: string | null) => void
  timeout: NodeJS.Timeout
}
const pendingTokenRequests = new Map<number, PendingTokenRequest[]>()

function setupESIService() {
  const esiService = getESIService()

  esiService.setTokenProvider(async (characterId: number) => {
    const win = mainWindow
    if (!win) return null

    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        const pending = pendingTokenRequests.get(characterId)
        if (pending) {
          const idx = pending.findIndex((p) => p.resolve === wrappedResolve)
          if (idx !== -1) pending.splice(idx, 1)
          if (pending.length === 0) pendingTokenRequests.delete(characterId)
        }
        resolve(null)
      }, 10000)

      const wrappedResolve = (token: string | null) => {
        clearTimeout(timeout)
        resolve(token)
      }

      const existing = pendingTokenRequests.get(characterId)
      if (existing) {
        existing.push({ resolve: wrappedResolve, timeout })
      } else {
        pendingTokenRequests.set(characterId, [{ resolve: wrappedResolve, timeout }])
        win.webContents.send('esi:requestToken', characterId)
      }
    })
  })

  return esiService
}

ipcMain.handle('esi:provideToken', (_event, characterId: unknown, token: unknown) => {
  if (typeof characterId !== 'number' || !Number.isInteger(characterId) || characterId <= 0) {
    return
  }
  const pending = pendingTokenRequests.get(characterId)
  if (pending) {
    const resolvedToken = typeof token === 'string' ? token : null
    for (const p of pending) {
      clearTimeout(p.timeout)
      p.resolve(resolvedToken)
    }
    pendingTokenRequests.delete(characterId)
  }
})

function parseESIOptions(options: unknown): ESIRequestOptions {
  const esiOptions: ESIRequestOptions = {}
  if (options && typeof options === 'object' && !Array.isArray(options)) {
    const opts = options as Record<string, unknown>
    if (opts.method === 'GET' || opts.method === 'POST') esiOptions.method = opts.method
    if (typeof opts.body === 'string') esiOptions.body = opts.body
    if (typeof opts.characterId === 'number') esiOptions.characterId = opts.characterId
    if (typeof opts.requiresAuth === 'boolean') esiOptions.requiresAuth = opts.requiresAuth
    if (typeof opts.etag === 'string') esiOptions.etag = opts.etag
  }
  return esiOptions
}

ipcMain.handle('esi:fetch', async (_event, endpoint: unknown, options: unknown) => {
  if (typeof endpoint !== 'string') throw new Error('Invalid endpoint')
  return getESIService().fetch(endpoint, parseESIOptions(options))
})

ipcMain.handle('esi:fetchWithMeta', async (_event, endpoint: unknown, options: unknown) => {
  if (typeof endpoint !== 'string') throw new Error('Invalid endpoint')
  return getESIService().fetchWithMeta(endpoint, parseESIOptions(options))
})

ipcMain.handle('esi:fetchPaginated', async (_event, endpoint: unknown, options: unknown) => {
  if (typeof endpoint !== 'string') throw new Error('Invalid endpoint')
  return getESIService().fetchPaginated(endpoint, parseESIOptions(options))
})

ipcMain.handle('esi:fetchPaginatedWithMeta', async (_event, endpoint: unknown, options: unknown) => {
  if (typeof endpoint !== 'string') throw new Error('Invalid endpoint')
  return getESIService().fetchPaginatedWithMeta(endpoint, parseESIOptions(options))
})

ipcMain.handle('esi:clearCache', () => {
  getESIService().clearCache()
})

ipcMain.handle('esi:clearCacheByPattern', (_event, pattern: unknown) => {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 100) {
    return 0
  }
  return getESIService().clearCacheByPattern(pattern)
})

ipcMain.handle('esi:getRateLimitInfo', () => {
  return getESIService().getRateLimitInfo()
})

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return

  if (isManuallyMaximized) {
    if (restoreBounds) {
      mainWindow.setBounds(restoreBounds)
    }
    isManuallyMaximized = false
    mainWindow.webContents.send('window:maximizeChange', false)
  } else {
    restoreBounds = mainWindow.getBounds()
    const display = screen.getDisplayMatching(restoreBounds)
    mainWindow.setBounds(display.workArea)
    isManuallyMaximized = true
    mainWindow.webContents.send('window:maximizeChange', true)
  }
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

ipcMain.handle('window:isMaximized', () => {
  return isManuallyMaximized
})

app.whenReady().then(() => {
  initLogger()
  logger.info('App starting', { module: 'Main', version: app.getVersion() })
  setupESIService()
  createWindow()
  logger.info('Main window created', { module: 'Main' })

  if (app.isPackaged && mainWindow) {
    initUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
