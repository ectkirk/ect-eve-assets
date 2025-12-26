import { ContractsSearchPanel } from './contracts-search'
import { RegionalMarketPanel } from './regional-market'
import type { ToolsTabType } from './config'

interface ToolsTabProps {
  activeTab: ToolsTabType
}

export function ToolsTab({ activeTab }: ToolsTabProps) {
  switch (activeTab) {
    case 'Contracts':
      return <ContractsSearchPanel />
    case 'Regional Market':
      return <RegionalMarketPanel />
  }
}
