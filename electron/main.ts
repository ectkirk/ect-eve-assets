import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { config } from 'dotenv'
import { startAuth, refreshAccessToken, revokeToken } from './services/auth.js'

// User data storage path
const userDataPath = app.getPath('userData')
const storageFile = path.join(userDataPath, 'auth-storage.json')

function readStorage(): Record<string, unknown> | null {
  try {
    if (fs.existsSync(storageFile)) {
      const data = fs.readFileSync(storageFile, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.error('[Storage] Failed to read:', err)
  }
  return null
}

function writeStorage(data: Record<string, unknown>): void {
  try {
    fs.mkdirSync(userDataPath, { recursive: true })
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), 'utf-8')
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
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

  // Always allow DevTools toggle with F12 or Ctrl+Shift+I
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
ipcMain.handle('auth:start', async (_event, includeCorporationScopes = false) => {
  const result = await startAuth(includeCorporationScopes)
  if (result.success && result.refreshToken && result.characterId) {
    characterTokens.set(result.characterId, result.refreshToken)
  }
  return result
})

ipcMain.handle('auth:refresh', async (_event, refreshToken: string, characterId: number) => {
  const result = await refreshAccessToken(refreshToken)
  if (result.success && result.refreshToken && characterId) {
    characterTokens.set(characterId, result.refreshToken)
  }
  return result
})

ipcMain.handle('auth:logout', async (_event, characterId?: number) => {
  if (characterId !== undefined) {
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

// IPC handlers for external API fetches (bypass CORS)
ipcMain.handle('fetch:structures', async () => {
  const response = await fetch('https://data.everef.net/structures/structures-latest.v2.json')
  if (!response.ok) {
    throw new Error(`Failed to fetch structures: ${response.status}`)
  }
  return response.json()
})

ipcMain.handle('fetch:capitalPrices', async () => {
  const response = await fetch('https://buyback.edencom.net/api/capital-prices')
  if (!response.ok) {
    throw new Error(`Failed to fetch capital prices: ${response.status}`)
  }
  return response.json()
})

// File-based storage IPC handlers (replaces localStorage for persistence)
ipcMain.handle('storage:get', () => {
  return readStorage()
})

ipcMain.handle('storage:set', (_event, data: Record<string, unknown>) => {
  writeStorage(data)
  return true
})

app.whenReady().then(() => {
  createWindow()

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
