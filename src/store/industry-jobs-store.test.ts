import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useIndustryJobsStore } from './industry-jobs-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {} })),
  },
  ownerKey: (type: string, id: number) => `${type}-${id}`,
  findOwnerByKey: vi.fn(),
}))

vi.mock('./expiry-cache-store', () => ({
  useExpiryCacheStore: {
    getState: vi.fn(() => ({
      isExpired: () => true,
      setExpiry: vi.fn(),
      clearForOwner: vi.fn(),
      registerRefreshCallback: vi.fn(() => vi.fn()),
    })),
  },
}))

vi.mock('@/api/esi', () => ({
  esi: {
    fetchWithMeta: vi.fn(),
    fetchPaginatedWithMeta: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/data-resolver', () => ({
  triggerResolution: vi.fn(),
}))

vi.mock('./asset-store', () => ({
  useAssetStore: {
    getState: () => ({
      prices: new Map(),
      setPrices: vi.fn(),
    }),
  },
}))

vi.mock('@/api/ref-client', () => ({
  queuePriceRefresh: vi.fn().mockResolvedValue(new Map()),
}))

describe('industry-jobs-store', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await useIndustryJobsStore.getState().clear()
    useIndustryJobsStore.setState({
      itemsById: new Map(),
      visibilityByOwner: new Map(),
      isUpdating: false,
      updateError: null,
      initialized: false,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useIndustryJobsStore.getState()
      expect(state.itemsById.size).toBe(0)
      expect(state.visibilityByOwner.size).toBe(0)
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('update', () => {
    it('sets error when no owners logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useIndustryJobsStore.getState().update(true)

      expect(useIndustryJobsStore.getState().updateError).toBe(
        'No owners logged in'
      )
    })

    it('fetches character jobs for character owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-12345': mockOwner })
      )

      vi.mocked(esi.fetchWithMeta).mockResolvedValue({
        data: [
          {
            job_id: 1,
            installer_id: 12345,
            facility_id: 60003760,
            station_id: 60003760,
            activity_id: 1,
            blueprint_id: 100,
            blueprint_type_id: 1000,
            blueprint_location_id: 60003760,
            location_id: 60003760,
            output_location_id: 60003760,
            runs: 1,
            status: 'active',
            start_date: '2024-01-01T00:00:00Z',
            end_date: '2024-01-02T00:00:00Z',
            duration: 86400,
            cost: 1000,
          },
        ],
        expiresAt: Date.now() + 300000,
        etag: 'test-etag',
        notModified: false,
      })

      await useIndustryJobsStore.getState().update(true)

      expect(esi.fetchWithMeta).toHaveBeenCalled()
      expect(useIndustryJobsStore.getState().itemsById.size).toBe(1)
      expect(useIndustryJobsStore.getState().visibilityByOwner.size).toBe(1)
    })

    it('fetches corporation jobs for corporation owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockCorpOwner = createMockOwner({
        id: 98000001,
        characterId: 12345,
        name: 'Test Corp',
        type: 'corporation',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'corporation-98000001': mockCorpOwner })
      )

      vi.mocked(esi.fetchPaginatedWithMeta).mockResolvedValue({
        data: [],
        expiresAt: Date.now() + 300000,
        etag: 'test-etag',
        notModified: false,
      })

      await useIndustryJobsStore.getState().update(true)

      expect(esi.fetchPaginatedWithMeta).toHaveBeenCalled()
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-12345': mockOwner })
      )

      vi.mocked(esi.fetchWithMeta).mockRejectedValue(new Error('API Error'))

      await useIndustryJobsStore.getState().update(true)

      expect(useIndustryJobsStore.getState().itemsById.size).toBe(0)
      expect(useIndustryJobsStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useIndustryJobsStore.setState({
        itemsById: new Map([
          [1, { item: {} as never, sourceOwner: {} as never }],
        ]),
        visibilityByOwner: new Map([['test', new Set([1])]]),
        updateError: 'error',
      })

      await useIndustryJobsStore.getState().clear()

      const state = useIndustryJobsStore.getState()
      expect(state.itemsById.size).toBe(0)
      expect(state.visibilityByOwner.size).toBe(0)
      expect(state.updateError).toBeNull()
    })
  })
})
