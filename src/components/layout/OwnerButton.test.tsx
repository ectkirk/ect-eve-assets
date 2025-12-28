import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { OwnerButton } from './OwnerButton'
import { createMockOwner } from '@/test/helpers'

vi.mock('./OwnerManagementModal', () => ({
  OwnerManagementModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="owner-modal">Modal Open</div> : null,
}))

vi.mock('@/components/ui/type-icon', () => ({
  OwnerIcon: ({ ownerId }: { ownerId: number }) => (
    <div data-testid={`owner-icon-${ownerId}`}>Icon</div>
  ),
}))

describe('OwnerButton', () => {
  beforeEach(() => {
    useAuthStore.setState({
      owners: {},
      selectedOwnerIds: [],
      isAuthenticated: false,
    })
    useExpiryCacheStore.setState({
      currentlyRefreshing: null,
    })
    Object.defineProperty(window, 'electronAPI', {
      value: {
        startAuth: vi.fn(),
        storageGet: vi.fn().mockResolvedValue({}),
        storageSet: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
    })
  })

  describe('when no owners exist', () => {
    it('renders EVE SSO login button', () => {
      render(<OwnerButton />)
      expect(screen.getByAltText('Log in with EVE Online')).toBeInTheDocument()
    })

    it('shows loading state while logging in', async () => {
      const startAuthPromise = new Promise<{ success: false }>(() => {})
      vi.mocked(window.electronAPI!.startAuth).mockReturnValue(startAuthPromise)

      render(<OwnerButton />)
      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText('Logging in...')).toBeInTheDocument()
      })
    })

    it('adds owner on successful login', async () => {
      vi.mocked(window.electronAPI!.startAuth).mockResolvedValue({
        success: true,
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 3600000,
        characterId: 12345,
        characterName: 'Test Character',
        corporationId: 98000001,
        scopes: ['esi-assets.read_assets.v1'],
      })

      render(<OwnerButton />)
      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        const state = useAuthStore.getState()
        expect(state.owners['character-12345']).toBeDefined()
        expect(state.owners['character-12345']?.name).toBe('Test Character')
      })
    })
  })

  describe('when owners exist', () => {
    beforeEach(() => {
      const owner = createMockOwner({
        id: 12345,
        name: 'Test Character',
        type: 'character',
      })
      useAuthStore.setState({
        owners: { [ownerKey('character', 12345)]: owner },
        selectedOwnerIds: [ownerKey('character', 12345)],
        isAuthenticated: true,
      })
    })

    it('renders owner icon', () => {
      render(<OwnerButton />)
      expect(screen.getByTestId('owner-icon-12345')).toBeInTheDocument()
    })

    it('shows selection count', () => {
      render(<OwnerButton />)
      expect(screen.getByText('(1/1)')).toBeInTheDocument()
    })

    it('opens modal on click', () => {
      render(<OwnerButton />)
      expect(screen.queryByTestId('owner-modal')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button'))

      expect(screen.getByTestId('owner-modal')).toBeInTheDocument()
    })
  })

  describe('when no owners selected', () => {
    beforeEach(() => {
      const owner = createMockOwner({
        id: 12345,
        name: 'Test Character',
        type: 'character',
      })
      useAuthStore.setState({
        owners: { [ownerKey('character', 12345)]: owner },
        selectedOwnerIds: [],
        isAuthenticated: true,
      })
    })

    it('shows "No Selection" text', () => {
      render(<OwnerButton />)
      expect(screen.getByText('No Selection')).toBeInTheDocument()
    })
  })

  describe('status indicators', () => {
    it('shows auth failure warning', () => {
      const owner = createMockOwner({
        id: 12345,
        name: 'Test Character',
        type: 'character',
        authFailed: true,
      })
      useAuthStore.setState({
        owners: { [ownerKey('character', 12345)]: owner },
        selectedOwnerIds: [ownerKey('character', 12345)],
        isAuthenticated: true,
      })

      render(<OwnerButton />)
      expect(
        screen.getByTitle('Auth failure - click to re-authenticate')
      ).toBeInTheDocument()
    })

    it('shows scopes outdated warning', () => {
      const owner = createMockOwner({
        id: 12345,
        name: 'Test Character',
        type: 'character',
        scopesOutdated: true,
      })
      useAuthStore.setState({
        owners: { [ownerKey('character', 12345)]: owner },
        selectedOwnerIds: [ownerKey('character', 12345)],
        isAuthenticated: true,
      })

      render(<OwnerButton />)
      expect(
        screen.getByTitle('Scopes outdated - click to upgrade')
      ).toBeInTheDocument()
    })

    it('prioritizes auth failure over scopes outdated', () => {
      const owner = createMockOwner({
        id: 12345,
        name: 'Test Character',
        type: 'character',
        authFailed: true,
        scopesOutdated: true,
      })
      useAuthStore.setState({
        owners: { [ownerKey('character', 12345)]: owner },
        selectedOwnerIds: [ownerKey('character', 12345)],
        isAuthenticated: true,
      })

      render(<OwnerButton />)
      expect(
        screen.getByTitle('Auth failure - click to re-authenticate')
      ).toBeInTheDocument()
      expect(
        screen.queryByTitle('Scopes outdated - click to upgrade')
      ).not.toBeInTheDocument()
    })
  })

  describe('multiple owners', () => {
    it('shows multiple character icons', () => {
      const owner1 = createMockOwner({
        id: 11111,
        name: 'Char One',
        type: 'character',
      })
      const owner2 = createMockOwner({
        id: 22222,
        name: 'Char Two',
        type: 'character',
      })
      useAuthStore.setState({
        owners: {
          [ownerKey('character', 11111)]: owner1,
          [ownerKey('character', 22222)]: owner2,
        },
        selectedOwnerIds: [
          ownerKey('character', 11111),
          ownerKey('character', 22222),
        ],
        isAuthenticated: true,
      })

      render(<OwnerButton />)
      expect(screen.getByTestId('owner-icon-11111')).toBeInTheDocument()
      expect(screen.getByTestId('owner-icon-22222')).toBeInTheDocument()
      expect(screen.getByText('(2/2)')).toBeInTheDocument()
    })

    it('shows characters and corporations separately', () => {
      const char = createMockOwner({
        id: 12345,
        name: 'Test Char',
        type: 'character',
      })
      const corp = createMockOwner({
        id: 98000001,
        name: 'Test Corp',
        type: 'corporation',
        characterId: 12345,
      })
      useAuthStore.setState({
        owners: {
          [ownerKey('character', 12345)]: char,
          [ownerKey('corporation', 98000001)]: corp,
        },
        selectedOwnerIds: [
          ownerKey('character', 12345),
          ownerKey('corporation', 98000001),
        ],
        isAuthenticated: true,
      })

      render(<OwnerButton />)
      expect(screen.getByTestId('owner-icon-12345')).toBeInTheDocument()
      expect(screen.getByTestId('owner-icon-98000001')).toBeInTheDocument()
    })
  })
})
