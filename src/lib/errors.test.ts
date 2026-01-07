import { describe, it, expect } from 'vitest'
import {
  ValidationError,
  ConfigurationError,
  TimeoutError,
  getErrorMessage,
  getErrorForLog,
  getUserFriendlyMessage,
} from './errors'
import { ESIError } from '../../shared/esi-types'

describe('Custom Errors', () => {
  describe('ValidationError', () => {
    it('has correct name and message', () => {
      const err = new ValidationError('Invalid data')
      expect(err.name).toBe('ValidationError')
      expect(err.message).toBe('Invalid data')
      expect(err).toBeInstanceOf(Error)
    })

    it('stores field and value', () => {
      const err = new ValidationError('Invalid field', 'email', 'bad@')
      expect(err.field).toBe('email')
      expect(err.value).toBe('bad@')
    })
  })

  describe('ConfigurationError', () => {
    it('has correct name and message', () => {
      const err = new ConfigurationError('Missing config')
      expect(err.name).toBe('ConfigurationError')
      expect(err.message).toBe('Missing config')
      expect(err).toBeInstanceOf(Error)
    })
  })

  describe('TimeoutError', () => {
    it('has correct name and message', () => {
      const err = new TimeoutError('Request timed out', 5000)
      expect(err.name).toBe('TimeoutError')
      expect(err.message).toBe('Request timed out')
      expect(err.timeoutMs).toBe(5000)
      expect(err).toBeInstanceOf(Error)
    })
  })
})

describe('Error Utilities', () => {
  describe('getErrorMessage', () => {
    it('extracts message from Error', () => {
      expect(getErrorMessage(new Error('test error'))).toBe('test error')
    })

    it('returns stringified value for non-Error', () => {
      expect(getErrorMessage('string')).toBe('string')
      expect(getErrorMessage(123)).toBe('123')
      expect(getErrorMessage(null)).toBe('null')
      expect(getErrorMessage(undefined)).toBe('undefined')
    })
  })

  describe('getErrorForLog', () => {
    it('returns Error instance', () => {
      const err = new Error('test')
      expect(getErrorForLog(err)).toBe(err)
    })

    it('returns undefined for non-Error', () => {
      expect(getErrorForLog('string')).toBeUndefined()
      expect(getErrorForLog(123)).toBeUndefined()
      expect(getErrorForLog(null)).toBeUndefined()
    })
  })

  describe('getUserFriendlyMessage', () => {
    it('returns friendly message for ESI 503', () => {
      const err = new ESIError('Service unavailable', 503)
      expect(getUserFriendlyMessage(err)).toBe(
        'EVE servers are currently unavailable. Please try again later.'
      )
    })

    it('returns friendly message for ESI 420', () => {
      const err = new ESIError('Rate limited', 420)
      expect(getUserFriendlyMessage(err)).toBe(
        'Too many requests. Please wait a moment.'
      )
    })

    it('returns friendly message for ESI 429', () => {
      const err = new ESIError('Rate limited', 429)
      expect(getUserFriendlyMessage(err)).toBe(
        'Too many requests. Please wait a moment.'
      )
    })

    it('returns friendly message for ESI 401', () => {
      const err = new ESIError('Unauthorized', 401)
      expect(getUserFriendlyMessage(err)).toBe(
        'Authentication expired. Please re-login.'
      )
    })

    it('returns friendly message for ESI 403', () => {
      const err = new ESIError('Forbidden', 403)
      expect(getUserFriendlyMessage(err)).toBe(
        'You do not have permission to access this data.'
      )
    })

    it('returns friendly message for ESI 404', () => {
      const err = new ESIError('Not found', 404)
      expect(getUserFriendlyMessage(err)).toBe(
        'The requested data was not found.'
      )
    })

    it('returns friendly message for MktMarketOpening', () => {
      const err = new ESIError('MktMarketOpening', 500)
      expect(getUserFriendlyMessage(err)).toBe(
        'Market data is unavailable during daily downtime.'
      )
    })

    it('returns friendly message for SDE_SERVICE_UNAVAILABLE', () => {
      const err = new ESIError('SDE_SERVICE_UNAVAILABLE', 500)
      expect(getUserFriendlyMessage(err)).toBe(
        'EVE static data is temporarily unavailable.'
      )
    })

    it('returns original message for unknown ESI errors', () => {
      const err = new ESIError('Some other error', 500)
      expect(getUserFriendlyMessage(err)).toBe('Some other error')
    })

    it('returns message for regular Error', () => {
      const err = new Error('Regular error')
      expect(getUserFriendlyMessage(err)).toBe('Regular error')
    })

    it('returns stringified value for non-Error', () => {
      expect(getUserFriendlyMessage('string')).toBe('string')
    })
  })
})
