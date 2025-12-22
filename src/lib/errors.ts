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
