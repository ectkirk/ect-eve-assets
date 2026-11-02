import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { BrowserWindow, shell } from 'electron'
import { logger } from './logger.js'

// macOS only installs updates signed with an Apple Developer ID. The Mac build
// is ad-hoc signed, so Mac users are pointed to the release page instead.
const MANUAL_UPDATES = process.platform === 'darwin'
const RELEASES_URL = 'https://github.com/ectkirk/ect-eve-assets/releases'
const VERSION_PATTERN = /^[0-9A-Za-z.-]+$/

autoUpdater.autoDownload = !MANUAL_UPDATES
autoUpdater.autoInstallOnAppQuit = !MANUAL_UPDATES
autoUpdater.allowPrerelease = false

let availableVersion: string | null = null

export function releasePageUrl(version: string | null): string {
  return version && VERSION_PATTERN.test(version)
    ? `${RELEASES_URL}/tag/v${version}`
    : `${RELEASES_URL}/latest`
}

const CHECK_INTERVAL_MS = 30 * 60 * 1000

let updateCheckInterval: ReturnType<typeof setInterval> | null = null
let listenersRegistered = false

export function initUpdater(mainWindow: BrowserWindow): void {
  if (!listenersRegistered) {
    autoUpdater.on('checking-for-update', () => {
      logger.info('Checking for updates...', { module: 'Updater' })
    })

    autoUpdater.on('update-not-available', () => {
      logger.info('No updates available', { module: 'Updater' })
    })

    autoUpdater.on('error', (err) => {
      logger.error('Update error', err, { module: 'Updater' })
    })

    listenersRegistered = true
  }

  autoUpdater.removeAllListeners('update-available')
  autoUpdater.removeAllListeners('download-progress')
  autoUpdater.removeAllListeners('update-downloaded')

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info(`Update available: ${info.version}`, { module: 'Updater' })
    availableVersion = info.version
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:update-available', info.version)
      if (MANUAL_UPDATES) {
        mainWindow.webContents.send(
          'updater:manual-update-available',
          info.version,
        )
      }
    }
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

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      logger.error('Failed to check for updates', err, { module: 'Updater' })
    })
  }

  checkForUpdates()
  updateCheckInterval ??= setInterval(checkForUpdates, CHECK_INTERVAL_MS)
}

export function stopUpdater(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
    updateCheckInterval = null
  }
}

export function installUpdate(): void {
  if (MANUAL_UPDATES) {
    void shell.openExternal(releasePageUrl(availableVersion))
    return
  }
  autoUpdater.quitAndInstall(false, true)
}
