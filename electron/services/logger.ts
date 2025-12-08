import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface LogContext {
  module?: string
  [key: string]: unknown
}

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

const LOG_RETENTION_DAYS = 7
const MAX_LOG_SIZE_MB = 10

let logDir: string
let logFile: string
let currentLogLevel: LogLevel = 'DEBUG'

function ensureLogDir(): void {
  if (!logDir) {
    logDir = path.join(app.getPath('userData'), 'logs')
  }
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
}

function getLogFilePath(): string {
  ensureLogDir()
  const date = new Date().toISOString().split('T')[0]
  return path.join(logDir, `app-${date}.log`)
}

function rotateLogsIfNeeded(): void {
  ensureLogDir()

  // Check current log file size
  if (logFile && fs.existsSync(logFile)) {
    const stats = fs.statSync(logFile)
    const sizeMB = stats.size / (1024 * 1024)
    if (sizeMB > MAX_LOG_SIZE_MB) {
      const timestamp = Date.now()
      const rotatedPath = logFile.replace('.log', `-${timestamp}.log`)
      fs.renameSync(logFile, rotatedPath)
    }
  }

  // Clean up old log files
  const files = fs.readdirSync(logDir)
  const cutoffDate = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000

  for (const file of files) {
    if (!file.startsWith('app-') || !file.endsWith('.log')) continue
    const filePath = path.join(logDir, file)
    const stats = fs.statSync(filePath)
    if (stats.mtimeMs < cutoffDate) {
      fs.unlinkSync(filePath)
    }
  }
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString()
  const module = context?.module ? `[${context.module}]` : ''
  const contextStr = context
    ? Object.entries(context)
        .filter(([key]) => key !== 'module')
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ')
    : ''

  return `[${timestamp}] [${level}]${module} ${message}${contextStr ? ' ' + contextStr : ''}`
}

function writeToFile(formatted: string): void {
  try {
    const currentPath = getLogFilePath()
    if (currentPath !== logFile) {
      logFile = currentPath
      rotateLogsIfNeeded()
    }
    fs.appendFileSync(logFile, formatted + '\n', 'utf-8')
  } catch (err) {
    console.error('[Logger] Failed to write to file:', err)
  }
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel]
}

function extractError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack }
  }
  if (typeof error === 'string') {
    return { message: error }
  }
  return { message: String(error) }
}

export const logger = {
  setLevel(level: LogLevel): void {
    currentLogLevel = level
  },

  getLogDir(): string {
    ensureLogDir()
    return logDir
  },

  debug(message: string, context?: LogContext): void {
    if (!shouldLog('DEBUG')) return
    const formatted = formatMessage('DEBUG', message, context)
    console.log(formatted)
    writeToFile(formatted)
  },

  info(message: string, context?: LogContext): void {
    if (!shouldLog('INFO')) return
    const formatted = formatMessage('INFO', message, context)
    console.log(formatted)
    writeToFile(formatted)
  },

  warn(message: string, context?: LogContext): void {
    if (!shouldLog('WARN')) return
    const formatted = formatMessage('WARN', message, context)
    console.warn(formatted)
    writeToFile(formatted)
  },

  error(message: string, error?: unknown, context?: LogContext): void {
    if (!shouldLog('ERROR')) return
    const errorInfo = error ? extractError(error) : undefined
    const fullContext = errorInfo
      ? { ...context, error: errorInfo.message, stack: errorInfo.stack }
      : context
    const formatted = formatMessage('ERROR', message, fullContext)
    console.error(formatted)
    writeToFile(formatted)
  },
}

export function initLogger(): void {
  ensureLogDir()
  rotateLogsIfNeeded()
  logger.info('Logger initialized', { module: 'Logger', logDir })
}
