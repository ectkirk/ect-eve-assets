function formatForConsole(
  level: LogLevel,
  message: string,
  context?: LogContext
): string {
  const timestamp = new Date().toISOString()
  const module = context?.module ? `[${context.module}]` : ''
  return `[${timestamp}] [${level}]${module} ${message}`
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

async function writeLog(
  level: LogLevel,
  message: string,
  context?: LogContext
): Promise<void> {
  const formatted = formatForConsole(level, message, context)

  // Always log to console
  switch (level) {
    case 'DEBUG':
    case 'INFO':
      console.log(formatted)
      break
    case 'WARN':
      console.warn(formatted)
      break
    case 'ERROR':
      console.error(formatted)
      break
  }

  // Send to main process for file logging (if available)
  if (window.electronAPI?.writeLog) {
    try {
      await window.electronAPI.writeLog(level, message, context)
    } catch {
      // Silently fail - don't want logging failures to break the app
    }
  }
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    writeLog('DEBUG', message, context)
  },

  info(message: string, context?: LogContext): void {
    writeLog('INFO', message, context)
  },

  warn(message: string, context?: LogContext): void {
    writeLog('WARN', message, context)
  },

  error(message: string, error?: unknown, context?: LogContext): void {
    const errorInfo = error ? extractError(error) : undefined
    const fullContext = errorInfo
      ? { ...context, error: errorInfo.message, stack: errorInfo.stack }
      : context
    writeLog('ERROR', message, fullContext)
  },

  async getLogDir(): Promise<string | null> {
    if (window.electronAPI?.getLogDir) {
      return window.electronAPI.getLogDir()
    }
    return null
  },
}
