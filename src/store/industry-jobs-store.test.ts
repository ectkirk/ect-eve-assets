import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useIndustryJobsStore } from './industry-jobs-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {} })),
  },
}))

vi.mock('@/api/endpoints/industry', () => ({
  getCharacterIndustryJobs: vi.fn(),
  getCorporationIndustryJobs: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('industry-jobs-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useIndustryJobsStore.setState({
      jobsByOwner: [],
      lastUpdated: null,
      isUpdating: false,
      updateError: null,
      initialized: false,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useIndustryJobsStore.getState()
      expect(state.jobsByOwner).toEqual([])
      expect(state.lastUpdated).toBeNull()
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('canUpdate', () => {
    it('returns true when never updated', () => {
      useIndustryJobsStore.setState({ lastUpdated: null, isUpdating: false })
      expect(useIndustryJobsStore.getState().canUpdate()).toBe(true)
    })

    it('returns false when currently updating', () => {
      useIndustryJobsStore.setState({ isUpdating: true })
      expect(useIndustryJobsStore.getState().canUpdate()).toBe(false)
    })
  })

  describe('update', () => {
    it('sets error when no characters logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useIndustryJobsStore.getState().update(true)

      expect(useIndustryJobsStore.getState().updateError).toBe('No characters logged in')
    })

    it('fetches character jobs for character owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterIndustryJobs } = await import('@/api/endpoints/industry')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterIndustryJobs).mockResolvedValue([
        {
          job_id: 1,
          installer_id: 12345,
          facility_id: 60003760,
          station_id: 60003760,
          activity_id: 1,
          blueprint_id: 100,
          blueprint_type_id: 1000,
          blueprint_location_id: 60003760,
          output_location_id: 60003760,
          runs: 1,
          status: 'active',
          start_date: '2024-01-01T00:00:00Z',
          end_date: '2024-01-02T00:00:00Z',
          duration: 86400,
          cost: 1000,
        },
      ])

      await useIndustryJobsStore.getState().update(true)

      expect(getCharacterIndustryJobs).toHaveBeenCalledWith(12345)
      expect(useIndustryJobsStore.getState().jobsByOwner).toHaveLength(1)
    })

    it('fetches corporation jobs for corporation owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCorporationIndustryJobs } = await import('@/api/endpoints/industry')

      const mockCorpOwner = createMockOwner({ id: 98000001, characterId: 12345, name: 'Test Corp', type: 'corporation' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'corporation-98000001': mockCorpOwner }))

      vi.mocked(getCorporationIndustryJobs).mockResolvedValue([])

      await useIndustryJobsStore.getState().update(true)

      expect(getCorporationIndustryJobs).toHaveBeenCalledWith(12345, 98000001)
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterIndustryJobs } = await import('@/api/endpoints/industry')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterIndustryJobs).mockRejectedValue(new Error('API Error'))

      await useIndustryJobsStore.getState().update(true)

      expect(useIndustryJobsStore.getState().jobsByOwner).toHaveLength(0)
      expect(useIndustryJobsStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useIndustryJobsStore.setState({
        jobsByOwner: [{ owner: {} as never, jobs: [] }],
        lastUpdated: Date.now(),
        updateError: 'error',
      })

      await useIndustryJobsStore.getState().clear()

      const state = useIndustryJobsStore.getState()
      expect(state.jobsByOwner).toHaveLength(0)
      expect(state.lastUpdated).toBeNull()
      expect(state.updateError).toBeNull()
    })
  })
})
