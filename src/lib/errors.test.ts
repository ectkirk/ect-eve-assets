import { describe, it, expect } from 'vitest'
import { ValidationError, ConfigurationError, TimeoutError } from './errors'

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
