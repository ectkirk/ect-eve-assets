import { app } from 'electron'
import {
  appendTextFile,
  ensureDirectory,
  getFileStats,
  listDirectory,
  pathExists,
  removeFile,
  renameFile,
  resolveSafePath,
} from './safe-fs.js'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface LogContext {
  module?: string
  [key: string]: unknown
}

const LOG_LEVELS = new Map<LogLevel, number>([
  ['DEBUG', 0],
  ['INFO', 1],
  ['WARN', 2],
  ['ERROR', 3],
])

const LOG_RETENTION_DAYS = 7
const MAX_LOG_SIZE_MB = 10
const SENSITIVE_KEYS = [
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'token',
  'password',
  'secret',
  'authorization',
]

let logDir: string
let logFile: string
let currentLogLevel: LogLevel = 'DEBUG'

function ensureLogDir(): void {
  if (!logDir) {
    if (!app?.getPath) return
    logDir = resolveSafePath(app.getPath('userData'), 'logs')
  }
  if (!pathExists(logDir)) {
    ensureDirectory(logDir)
  }
}

function getLogFilePath(): string | null {
  ensureLogDir()
  if (!logDir) return null
  const date = new Date().toISOString().slice(0, 10)
  return resolveSafePath(logDir, `app-${date}.log`)
}

function rotateLogsIfNeeded(): void {
  ensureLogDir()
  if (!logDir) return

  if (logFile && pathExists(logFile)) {
    const stats = getFileStats(logFile)
    const sizeMB = stats.size / (1024 * 1024)
    if (sizeMB > MAX_LOG_SIZE_MB) {
      const timestamp = Date.now()
      const rotatedPath = logFile.replace('.log', `-${timestamp}.log`)
      renameFile(logFile, rotatedPath)
    }
  }

  const files = listDirectory(logDir)
  const cutoffDate = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000

  for (const file of files) {
    if (!file.startsWith('app-') || !file.endsWith('.log')) continue
    const filePath = resolveSafePath(logDir, file)
    const stats = getFileStats(filePath)
    if (stats.mtimeMs < cutoffDate) {
      removeFile(filePath)
    }
  }
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(sanitizeValue)
    }
    return sanitizeContext(value as Record<string, unknown>)
  }
  return value
}

function sanitizeContext(
  context: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      SENSITIVE_KEYS.some((sensitive) =>
        key.toLowerCase().includes(sensitive.toLowerCase()),
      )
        ? '[REDACTED]'
        : sanitizeValue(value),
    ]),
  )
}

function formatMessage(
  level: LogLevel,
  message: string,
  context?: LogContext,
): string {
  const timestamp = new Date().toISOString()
  const sanitizedContext = context ? sanitizeContext(context) : undefined
  const moduleValue = sanitizedContext?.['module']
  const moduleName =
    typeof moduleValue === 'string' ? moduleValue : JSON.stringify(moduleValue)
  const module = moduleName ? `[${moduleName}]` : ''
  const contextStr = sanitizedContext
    ? Object.entries(sanitizedContext)
        .filter(([key]) => key !== 'module')
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ')
    : ''

  return `[${timestamp}] [${level}]${module} ${message}${contextStr ? ' ' + contextStr : ''}`
}

function writeToFile(formatted: string): void {
  try {
    const currentPath = getLogFilePath()
    if (!currentPath) return
    if (currentPath !== logFile) {
      logFile = currentPath
      rotateLogsIfNeeded()
    }
    appendTextFile(logFile, formatted + '\n')
  } catch (err) {
    console.error('[Logger] Failed to write to file:', err)
  }
}

function shouldLog(level: LogLevel): boolean {
  return (LOG_LEVELS.get(level) ?? 0) >= (LOG_LEVELS.get(currentLogLevel) ?? 0)
}

function extractError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return error.stack
      ? { message: error.message, stack: error.stack }
      : { message: error.message }
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
