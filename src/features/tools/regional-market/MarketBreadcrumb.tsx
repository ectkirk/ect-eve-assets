import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { TypeIcon } from '@/components/ui/type-icon'
import type { CachedType } from '@/store/reference-cache'
import type { MarketGroupNode } from './types'

interface MarketBreadcrumbProps {
  path: MarketGroupNode[]
  selectedGroupId: number | null
  selectedType: CachedType | null
  onNavigate: (groupId: number | null) => void
}

export const MarketBreadcrumb = memo(function MarketBreadcrumb({
  path,
  selectedGroupId,
  selectedType,
  onNavigate,
}: MarketBreadcrumbProps) {
  const { t } = useTranslation('tools')
  if (path.length === 0 && !selectedType) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border text-sm overflow-x-auto">
      {selectedType && (
        <TypeIcon
          typeId={selectedType.id}
          categoryId={selectedType.categoryId}
          size="lg"
        />
      )}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onNavigate(null)}
          className="text-content-secondary hover:text-accent shrink-0"
        >
          {t('regionalMarket.market')}
        </button>
        {path.map((node) => (
          <span
            key={node.group.id}
            className="flex items-center gap-1 shrink-0"
          >
            <span className="text-content-tertiary">/</span>
            <button
              onClick={() => onNavigate(node.group.id)}
              className={
                node.group.id === selectedGroupId && !selectedType
                  ? 'text-content font-medium'
                  : 'text-content-secondary hover:text-accent'
              }
            >
              {node.group.name}
            </button>
          </span>
        ))}
        {selectedType && (
          <span className="flex items-center gap-1 shrink-0">
            <span className="text-content-tertiary">/</span>
            <span className="text-content font-medium">
              {selectedType.name}
            </span>
          </span>
        )}
      </div>
    </div>
  )
})
