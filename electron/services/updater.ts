import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { logger } from './logger.js'

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.allowPrerelease = true

const CHECK_INTERVAL_MS = 30 * 60 * 1000

let updateCheckInterval: ReturnType<typeof setInterval> | null = null

export function initUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for updates...', { module: 'Updater' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info(`Update available: ${info.version}`, { module: 'Updater' })
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:update-available', info.version)
    }
  })

  autoUpdater.on('update-not-available', () => {
    logger.info('No updates available', { module: 'Updater' })
  })

  autoUpdater.on('download-progress', (progress) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:download-progress', progress.percent)
    }
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logger.info(`Update downloaded: ${info.version}`, { module: 'Updater' })
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:update-downloaded', info.version)
    }
  })

  autoUpdater.on('error', (err) => {
    logger.error('Update error', err, { module: 'Updater' })
  })

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      logger.error('Failed to check for updates', err, { module: 'Updater' })
    })
  }

  checkForUpdates()
  if (!updateCheckInterval) {
    updateCheckInterval = setInterval(checkForUpdates, CHECK_INTERVAL_MS)
  }
}

export function stopUpdater(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
    updateCheckInterval = null
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}
