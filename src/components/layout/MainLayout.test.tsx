import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/store/auth-store'
import { useAssetStore } from '@/store/asset-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { MainLayout } from './MainLayout'

vi.mock('./UpdateBanner', () => ({
  UpdateBanner: () => null,
}))

vi.mock('./OwnerButton', () => ({
  OwnerButton: () => <div data-testid="owner-button">OwnerButton</div>,
}))

vi.mock('./WindowControls', () => ({
  WindowControls: () => <div data-testid="window-controls">WindowControls</div>,
}))

vi.mock('./SearchBar', () => ({
  SearchBar: () => <div data-testid="search-bar">SearchBar</div>,
}))

vi.mock('@/features/assets', () => ({
  AssetsTab: () => <div data-testid="assets-tab">AssetsTab</div>,
}))

vi.mock('@/features/structures', () => ({
  StructuresTab: () => <div data-testid="structures-tab">StructuresTab</div>,
}))

vi.mock('@/features/assets-tree', () => ({
  AssetsTreeTab: () => <div data-testid="assets-tree-tab">AssetsTreeTab</div>,
}))

vi.mock('@/features/market-orders', () => ({
  MarketOrdersTab: () => (
    <div data-testid="market-orders-tab">MarketOrdersTab</div>
  ),
}))

vi.mock('@/features/industry-jobs', () => ({
  IndustryJobsTab: () => (
    <div data-testid="industry-jobs-tab">IndustryJobsTab</div>
  ),
}))

vi.mock('@/features/clones', () => ({
  ClonesTab: () => <div data-testid="clones-tab">ClonesTab</div>,
}))

vi.mock('@/features/loyalty', () => ({
  LoyaltyTab: () => <div data-testid="loyalty-tab">LoyaltyTab</div>,
}))

vi.mock('@/features/contracts', () => ({
  ContractsTab: () => <div data-testid="contracts-tab">ContractsTab</div>,
}))

vi.mock('@/features/wallet', () => ({
  WalletTab: () => <div data-testid="wallet-tab">WalletTab</div>,
}))

vi.mock('@/features/buyback', () => ({
  BuybackTab: () => <div data-testid="buyback-tab">BuybackTab</div>,
  BUYBACK_TABS: ['High Sec', 'Low Sec', 'Null Sec', 'Wormhole'],
  getStyling: () => ({ color: 'bg-green-500' }),
  tabToKey: (tab: string) => tab.toLowerCase().replace(' ', '-'),
}))

vi.mock('@/features/tools/freight', () => ({
  FreightPanel: () => <div data-testid="freight-panel">FreightPanel</div>,
}))

vi.mock('@/features/tools/contracts-search', () => ({
  ContractsSearchPanel: () => (
    <div data-testid="contracts-search-panel">ContractsSearchPanel</div>
  ),
}))

vi.mock('@/features/tools/regional-market', () => ({
  RegionalMarketPanel: () => (
    <div data-testid="regional-market-panel">RegionalMarketPanel</div>
  ),
}))

vi.mock('@/features/tools/reference', () => ({
  ReferencePanel: () => <div data-testid="reference-panel">ReferencePanel</div>,
}))

vi.mock('@/hooks', () => ({
  useTotalAssets: () => ({
    total: 1000000000,
    assetsTotal: 500000000,
    marketTotal: 200000000,
    industryTotal: 100000000,
    contractsTotal: 150000000,
    walletTotal: 50000000,
    structuresTotal: 0,
  }),
  useNavigationAction: vi.fn(),
}))

describe('MainLayout', () => {
  beforeEach(() => {
    useAuthStore.setState({
      owners: {},
      selectedOwnerIds: [],
      isAuthenticated: false,
    })
    useAssetStore.setState({
      assetsByOwner: [],
    })
    useExpiryCacheStore.setState({
      currentlyRefreshing: null,
    })
    Object.defineProperty(window, 'electronAPI', {
      value: {
        storageGet: vi.fn().mockResolvedValue({}),
        storageSet: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
    })
  })

  describe('rendering', () => {
    it('renders header with app name', () => {
      render(<MainLayout />)
      expect(screen.getByText('ECT')).toBeInTheDocument()
      expect(screen.getByText('EVE Assets')).toBeInTheDocument()
    })

    it('renders mode switcher with all modes', () => {
      render(<MainLayout />)
      const modeTablist = screen.getByRole('tablist', {
        name: 'Application modes',
      })
      expect(within(modeTablist).getByText('Assets')).toBeInTheDocument()
      expect(within(modeTablist).getByText('Tools')).toBeInTheDocument()
      expect(within(modeTablist).getByText('Buyback')).toBeInTheDocument()
    })

    it('renders skip link for accessibility', () => {
      render(<MainLayout />)
      expect(screen.getByText('Skip to main content')).toBeInTheDocument()
    })

    it('renders Discord link', () => {
      render(<MainLayout />)
      expect(
        screen.getByRole('link', { name: 'Join our Discord server' })
      ).toHaveAttribute('href', 'https://discord.gg/dexSsJYYbv')
    })
  })

  describe('asset tabs', () => {
    it('renders all asset tabs', () => {
      render(<MainLayout />)
      const tablist = screen.getByRole('tablist', { name: 'Assets tabs' })
      expect(tablist).toBeInTheDocument()

      const tabs = [
        'Assets',
        'Assets Tree',
        'Clones',
        'Contracts',
        'Industry Jobs',
        'Loyalty Points',
        'Market Orders',
        'Structures',
        'Wallet',
      ]
      tabs.forEach((tab) => {
        expect(within(tablist).getByText(tab)).toBeInTheDocument()
      })
    })

    it('switches tabs on click', async () => {
      render(<MainLayout />)
      const tablist = screen.getByRole('tablist', { name: 'Assets tabs' })

      expect(await screen.findByTestId('assets-tab')).toBeInTheDocument()

      fireEvent.click(within(tablist).getByText('Clones'))

      expect(await screen.findByTestId('clones-tab')).toBeInTheDocument()
    })

    it('shows search bar in assets mode', () => {
      render(<MainLayout />)
      expect(screen.getByTestId('search-bar')).toBeInTheDocument()
    })
  })

  describe('keyboard navigation', () => {
    it('moves focus with ArrowRight', async () => {
      const user = userEvent.setup()
      render(<MainLayout />)
      const tablist = screen.getByRole('tablist', { name: 'Assets tabs' })

      const assetsTab = within(tablist).getByText('Assets')
      assetsTab.focus()

      await user.keyboard('{ArrowRight}')

      expect(within(tablist).getByText('Assets Tree')).toHaveFocus()
    })

    it('moves focus with ArrowLeft', async () => {
      const user = userEvent.setup()
      render(<MainLayout />)
      const tablist = screen.getByRole('tablist', { name: 'Assets tabs' })

      const clonesTab = within(tablist).getByText('Clones')
      clonesTab.focus()

      await user.keyboard('{ArrowLeft}')

      expect(within(tablist).getByText('Assets Tree')).toHaveFocus()
    })

    it('wraps around from last to first with ArrowRight', async () => {
      const user = userEvent.setup()
      render(<MainLayout />)
      const tablist = screen.getByRole('tablist', { name: 'Assets tabs' })

      const walletTab = within(tablist).getByText('Wallet')
      walletTab.focus()

      await user.keyboard('{ArrowRight}')

      expect(within(tablist).getByText('Assets')).toHaveFocus()
    })

    it('moves to first tab with Home', async () => {
      const user = userEvent.setup()
      render(<MainLayout />)
      const tablist = screen.getByRole('tablist', { name: 'Assets tabs' })

      const walletTab = within(tablist).getByText('Wallet')
      walletTab.focus()

      await user.keyboard('{Home}')

      expect(within(tablist).getByText('Assets')).toHaveFocus()
    })

    it('moves to last tab with End', async () => {
      const user = userEvent.setup()
      render(<MainLayout />)
      const tablist = screen.getByRole('tablist', { name: 'Assets tabs' })

      const assetsTab = within(tablist).getByText('Assets')
      assetsTab.focus()

      await user.keyboard('{End}')

      expect(within(tablist).getByText('Wallet')).toHaveFocus()
    })
  })

  describe('mode switching', () => {
    it('switches to Tools mode and shows Contracts by default', async () => {
      render(<MainLayout />)
      const modeTablist = screen.getByRole('tablist', {
        name: 'Application modes',
      })

      fireEvent.click(within(modeTablist).getByText('Tools'))

      expect(
        await screen.findByTestId('contracts-search-panel')
      ).toBeInTheDocument()
    })

    it('switches to Tools mode Market tab', async () => {
      render(<MainLayout />)
      const modeTablist = screen.getByRole('tablist', {
        name: 'Application modes',
      })

      fireEvent.click(within(modeTablist).getByText('Tools'))

      const toolsTablist = await screen.findByRole('tablist', {
        name: 'Tools tabs',
      })
      fireEvent.click(within(toolsTablist).getByText('Market'))

      expect(
        await screen.findByTestId('regional-market-panel')
      ).toBeInTheDocument()
    })

    it('switches to Buyback mode', async () => {
      render(<MainLayout />)
      const modeTablist = screen.getByRole('tablist', {
        name: 'Application modes',
      })

      fireEvent.click(within(modeTablist).getByText('Buyback'))

      expect(await screen.findByTestId('buyback-tab')).toBeInTheDocument()
    })

    it('switches to Freight mode', async () => {
      render(<MainLayout />)
      const modeTablist = screen.getByRole('tablist', {
        name: 'Application modes',
      })

      fireEvent.click(within(modeTablist).getByText('Freight'))

      expect(await screen.findByTestId('freight-panel')).toBeInTheDocument()
    })

    it('hides search bar in non-assets modes', () => {
      render(<MainLayout />)
      const modeTablist = screen.getByRole('tablist', {
        name: 'Application modes',
      })

      fireEvent.click(within(modeTablist).getByText('Tools'))

      expect(screen.queryByTestId('search-bar')).not.toBeInTheDocument()
    })
  })

  describe('header controls', () => {
    it('does not show totals when no data', () => {
      render(<MainLayout />)
      expect(screen.queryByText(/Total:/)).not.toBeInTheDocument()
    })

    it('shows totals when data exists', () => {
      useAssetStore.setState({
        assetsByOwner: [
          {
            owner: {
              id: 123,
              type: 'character',
              name: 'Test',
              characterId: 123,
              corporationId: 98000001,
              accessToken: 'token',
              refreshToken: 'refresh',
              expiresAt: Date.now() + 3600000,
            },
            assets: [],
          },
        ],
      })

      render(<MainLayout />)

      expect(screen.getByText(/Total:/)).toBeInTheDocument()
      expect(screen.getByText(/Assets:/)).toBeInTheDocument()
      expect(screen.getByText(/Market:/)).toBeInTheDocument()
    })
  })
})
