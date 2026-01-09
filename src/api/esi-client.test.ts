import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import { esi } from './esi'
import { ValidationError, ConfigurationError } from '@/lib/errors'

describe('ESI Client Integration', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let mockFetchWithMeta: ReturnType<typeof vi.fn>
  let mockFetchPaginated: ReturnType<typeof vi.fn>
  let mockFetchPaginatedWithMeta: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    mockFetchWithMeta = vi.fn()
    mockFetchPaginated = vi.fn()
    mockFetchPaginatedWithMeta = vi.fn()

    Object.defineProperty(window, 'electronAPI', {
      value: {
        esi: {
          fetch: mockFetch,
          fetchWithMeta: mockFetchWithMeta,
          fetchPaginated: mockFetchPaginated,
          fetchPaginatedWithMeta: mockFetchPaginatedWithMeta,
          clearCache: vi.fn(),
          getRateLimitInfo: vi.fn(),
        },
      },
      writable: true,
    })
  })

  describe('fetch', () => {
    it('calls underlying IPC and returns data', async () => {
      mockFetch.mockResolvedValue({ id: 123, name: 'Test' })

      const result = await esi.fetch('/test/endpoint')

      expect(mockFetch).toHaveBeenCalledWith('/test/endpoint', {
        language: 'en',
      })
      expect(result).toEqual({ id: 123, name: 'Test' })
    })

    it('validates response against schema', async () => {
      const schema = z.object({ id: z.number(), name: z.string() })
      mockFetch.mockResolvedValue({ id: 123, name: 'Valid' })

      const result = await esi.fetch('/test', { schema })

      expect(result).toEqual({ id: 123, name: 'Valid' })
    })

    it('throws ValidationError for invalid schema', async () => {
      const schema = z.object({ id: z.number(), name: z.string() })
      mockFetch.mockResolvedValue({ id: 'not-a-number', name: 'Test' })

      await expect(esi.fetch('/test', { schema })).rejects.toThrow(
        ValidationError
      )
    })

    it('passes options to underlying call', async () => {
      mockFetch.mockResolvedValue({})

      await esi.fetch('/test', { characterId: 12345 })

      expect(mockFetch).toHaveBeenCalledWith('/test', {
        characterId: 12345,
        language: 'en',
      })
    })
  })

  describe('fetchWithMeta', () => {
    it('returns data with metadata', async () => {
      mockFetchWithMeta.mockResolvedValue({
        data: { id: 1 },
        expiresAt: 1234567890,
        etag: 'abc123',
        notModified: false,
      })

      const result = await esi.fetchWithMeta('/test')

      expect(result.data).toEqual({ id: 1 })
      expect(result.expiresAt).toBe(1234567890)
      expect(result.etag).toBe('abc123')
    })

    it('validates response data against schema', async () => {
      const schema = z.object({ id: z.number() })
      mockFetchWithMeta.mockResolvedValue({
        data: { id: 1 },
        expiresAt: 1234567890,
        notModified: false,
      })

      const result = await esi.fetchWithMeta('/test', { schema })

      expect(result.data).toEqual({ id: 1 })
    })

    it('skips validation when notModified is true', async () => {
      const schema = z.object({ id: z.number() })
      mockFetchWithMeta.mockResolvedValue({
        data: undefined,
        expiresAt: 1234567890,
        notModified: true,
      })

      const result = await esi.fetchWithMeta('/test', { schema })

      expect(result.notModified).toBe(true)
    })
  })

  describe('fetchPaginated', () => {
    it('returns flat array of results', async () => {
      mockFetchPaginated.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }])

      const result = await esi.fetchPaginated('/test')

      expect(result).toHaveLength(3)
    })

    it('validates each item against schema', async () => {
      const schema = z.object({ id: z.number() })
      mockFetchPaginated.mockResolvedValue([{ id: 1 }, { id: 2 }])

      const result = await esi.fetchPaginated('/test', { schema })

      expect(result).toEqual([{ id: 1 }, { id: 2 }])
    })

    it('throws ValidationError for invalid items', async () => {
      const schema = z.object({ id: z.number() })
      mockFetchPaginated.mockResolvedValue([{ id: 'bad' }])

      await expect(esi.fetchPaginated('/test', { schema })).rejects.toThrow(
        ValidationError
      )
    })
  })

  describe('error handling', () => {
    it('throws ConfigurationError when electronAPI not available', async () => {
      Object.defineProperty(window, 'electronAPI', {
        value: undefined,
        writable: true,
      })

      await expect(esi.fetch('/test')).rejects.toThrow(ConfigurationError)
    })
  })
})
