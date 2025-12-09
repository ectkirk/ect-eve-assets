import { app, BrowserWindow, ipcMain, shell, Menu, safeStorage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { config } from 'dotenv'
import { startAuth, refreshAccessToken, revokeToken } from './services/auth.js'
import { logger, initLogger, type LogLevel, type LogContext } from './services/logger.js'

// User data storage path
const userDataPath = app.getPath('userData')
const storageFile = path.join(userDataPath, 'auth-storage.json')

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

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env file from project root
config({ path: path.join(__dirname, '..', '.env') })

const APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(APP_ROOT, 'dist')
export const VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(APP_ROOT, 'public')
  : RENDERER_DIST

let mainWindow: BrowserWindow | null = null
const characterTokens = new Map<number, string>()

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Data',
      submenu: [
        {
          label: 'Update...',
          accelerator: 'CmdOrCtrl+U',
          click: () => {
            mainWindow?.webContents.send('data:openUpdateDialog')
          }
        },
        { type: 'separator' },
        {
          label: 'Refresh Abyssal Prices',
          click: () => {
            mainWindow?.webContents.send('data:refreshAbyssalPrices')
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Logs Folder',
          click: () => {
            shell.openPath(logger.getLogDir())
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    icon: path.join(VITE_PUBLIC, 'icon.png'),
    title: 'ECTEVEAssets',
    backgroundColor: '#0f172a',
  })

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        mainWindow?.webContents.toggleDevTools()
        event.preventDefault()
      }
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow?.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }

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

app.whenReady().then(() => {
  initLogger()
  logger.info('App starting', { module: 'Main', version: app.getVersion() })
  createMenu()
  createWindow()
  logger.info('Main window created', { module: 'Main' })

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
