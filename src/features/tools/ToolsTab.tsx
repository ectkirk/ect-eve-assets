import { ContractsSearchPanel } from './contracts-search'
import type { ToolsTabType } from './config'

interface ToolsTabProps {
  activeTab: ToolsTabType
}

export function ToolsTab({ activeTab }: ToolsTabProps) {
  switch (activeTab) {
    case 'Contracts':
      return <ContractsSearchPanel />
  }
}
