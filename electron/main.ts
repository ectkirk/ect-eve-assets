import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { startAuth, refreshAccessToken, revokeToken } from './services/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(APP_ROOT, 'dist')
export const VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(APP_ROOT, 'public')
  : RENDERER_DIST

let mainWindow: BrowserWindow | null = null
let currentRefreshToken: string | null = null

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
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// IPC handlers for auth
ipcMain.handle('auth:start', async () => {
  const result = await startAuth()
  if (result.success && result.refreshToken) {
    currentRefreshToken = result.refreshToken
  }
  return result
})

ipcMain.handle('auth:refresh', async (_event, refreshToken: string) => {
  const result = await refreshAccessToken(refreshToken)
  if (result.success && result.refreshToken) {
    currentRefreshToken = result.refreshToken
  }
  return result
})

ipcMain.handle('auth:logout', async () => {
  if (currentRefreshToken) {
    await revokeToken(currentRefreshToken)
    currentRefreshToken = null
  }
  return { success: true }
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
