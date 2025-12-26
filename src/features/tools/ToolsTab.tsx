import { ContractsSearchPanel } from './contracts-search'
import { RegionalMarketPanel } from './regional-market'
import type { ToolsTabType } from './config'

interface ToolsTabProps {
  activeTab: ToolsTabType
  regionalMarketTypeId?: number | null
  onRegionalMarketTypeConsumed?: () => void
}

export function ToolsTab({
  activeTab,
  regionalMarketTypeId,
  onRegionalMarketTypeConsumed,
}: ToolsTabProps) {
  switch (activeTab) {
    case 'Contracts':
      return <ContractsSearchPanel />
    case 'Regional Market':
      return (
        <RegionalMarketPanel
          initialTypeId={regionalMarketTypeId}
          onInitialTypeConsumed={onRegionalMarketTypeConsumed}
        />
      )
  }
}
