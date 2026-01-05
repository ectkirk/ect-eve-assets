import { ESIError } from '../../shared/esi-types'

export class ValidationError extends Error {
  field?: string
  value?: unknown

  constructor(message: string, field?: string, value?: unknown) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
    this.value = value
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

export class TimeoutError extends Error {
  timeoutMs: number

  constructor(message: string, timeoutMs: number) {
    super(message)
    this.name = 'TimeoutError'
    this.timeoutMs = timeoutMs
  }
}

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}

export function getErrorForLog(err: unknown): Error | undefined {
  return err instanceof Error ? err : undefined
}

function friendlyESIMessage(status: number, message: string): string {
  if (status === 503)
    return 'EVE servers are currently unavailable. Please try again later.'
  if (status === 420 || status === 429)
    return 'Too many requests. Please wait a moment.'
  if (status === 401) return 'Authentication expired. Please re-login.'
  if (status === 403) return 'You do not have permission to access this data.'
  if (status === 404) return 'The requested data was not found.'
  if (message.includes('MktMarketOpening'))
    return 'Market data is unavailable during daily downtime.'
  if (message.includes('SDE_SERVICE_UNAVAILABLE'))
    return 'EVE static data is temporarily unavailable.'
  return message
}

export function getUserFriendlyMessage(err: unknown): string {
  if (err instanceof ESIError) {
    return friendlyESIMessage(err.status, err.message)
  }
  return getErrorMessage(err)
}
