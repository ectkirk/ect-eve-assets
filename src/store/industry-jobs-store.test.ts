import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useIndustryJobsStore } from './industry-jobs-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {} })),
  },
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

vi.mock('@/lib/data-resolver', () => ({
  triggerResolution: vi.fn(),
  registerCollector: vi.fn(),
  needsTypeResolution: vi.fn(() => false),
  hasLocation: vi.fn(() => true),
  hasStructure: vi.fn(() => true),
  PLAYER_STRUCTURE_ID_THRESHOLD: 1000000000000,
}))

vi.mock('./price-store', () => ({
  usePriceStore: {
    getState: vi.fn(() => ({
      getItemPrice: vi.fn((typeId: number) => (typeId === 2000 ? 500 : 0)),
      ensureJitaPrices: vi.fn(),
    })),
  },
}))

vi.mock('@/store/reference-cache', () => ({
  getType: vi.fn((typeId: number) =>
    typeId === 2000 ? { id: 2000, portionSize: 10 } : undefined,
  ),
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

  describe('update', () => {
    it('fetches character jobs for character owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-12345': mockOwner }),
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

      expect(esi.fetchWithMeta).toHaveBeenCalledWith(
        expect.stringContaining('/characters/12345/industry/jobs'),
        expect.anything(),
      )
      expect(useIndustryJobsStore.getState().itemsById.size).toBe(1)
      expect(useIndustryJobsStore.getState().visibilityByOwner.size).toBe(1)
    })
  })

  describe('getTotal', () => {
    it('sums product value for active jobs', () => {
      const activeJob = {
        job_id: 1,
        installer_id: 12345,
        facility_id: 60003760,
        station_id: 60003760,
        activity_id: 1,
        blueprint_id: 100,
        blueprint_type_id: 1000,
        product_type_id: 2000,
        blueprint_location_id: 60003760,
        location_id: 60003760,
        output_location_id: 60003760,
        runs: 10,
        status: 'active',
        start_date: '2024-01-01T00:00:00Z',
        end_date: '2024-01-02T00:00:00Z',
        duration: 86400,
        cost: 1000,
      }

      const completedJob = {
        ...activeJob,
        job_id: 2,
        status: 'delivered',
        runs: 5,
      }

      useIndustryJobsStore.setState({
        itemsById: new Map([
          [
            1,
            {
              item: activeJob as never,
              sourceOwner: { type: 'character', id: 12345, characterId: 12345 },
            },
          ],
          [
            2,
            {
              item: completedJob as never,
              sourceOwner: { type: 'character', id: 12345, characterId: 12345 },
            },
          ],
        ]),
        visibilityByOwner: new Map([['character-12345', new Set([1, 2])]]),
      })

      const total = useIndustryJobsStore.getTotal(['character-12345'])

      // Only active job counts: price(2000) = 500, runs = 10, portionSize = 10
      // Delivered job is excluded
      expect(total).toBe(50000)
    })

    it('uses blueprint_type_id when product_type_id is absent', () => {
      const job = {
        job_id: 1,
        installer_id: 12345,
        facility_id: 60003760,
        station_id: 60003760,
        activity_id: 1,
        blueprint_id: 100,
        blueprint_type_id: 2000,
        blueprint_location_id: 60003760,
        location_id: 60003760,
        output_location_id: 60003760,
        runs: 3,
        status: 'ready',
        start_date: '2024-01-01T00:00:00Z',
        end_date: '2024-01-02T00:00:00Z',
        duration: 86400,
        cost: 1000,
      }

      useIndustryJobsStore.setState({
        itemsById: new Map([
          [
            1,
            {
              item: job as never,
              sourceOwner: { type: 'character', id: 12345, characterId: 12345 },
            },
          ],
        ]),
        visibilityByOwner: new Map([['character-12345', new Set([1])]]),
      })

      // price(2000) = 500, runs = 3
      expect(useIndustryJobsStore.getTotal(['character-12345'])).toBe(1500)
    })

    it('returns 0 when no jobs match selected owners', () => {
      expect(useIndustryJobsStore.getTotal(['character-99999'])).toBe(0)
    })
  })

  describe('getJobsByOwner', () => {
    it('groups jobs by owner', async () => {
      const { findOwnerByKey } = await import('./auth-store')
      const owner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
      })
      vi.mocked(findOwnerByKey).mockReturnValue(owner)

      const job = {
        job_id: 1,
        installer_id: 12345,
        status: 'active',
      }

      useIndustryJobsStore.setState({
        itemsById: new Map([
          [
            1,
            {
              item: job as never,
              sourceOwner: { type: 'character', id: 12345, characterId: 12345 },
            },
          ],
        ]),
        visibilityByOwner: new Map([['character-12345', new Set([1])]]),
      })

      const result = useIndustryJobsStore.getJobsByOwner()
      expect(result).toHaveLength(1)
      expect(result[0]?.owner).toEqual(owner)
      expect(result[0]?.jobs).toHaveLength(1)
    })
  })
})
