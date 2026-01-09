import { TypeIcon } from '@/components/ui/type-icon'
import { formatFullNumber } from '@/lib/utils'

interface TypeItem {
  id: number
  name: string
  categoryId?: number
  quantity?: number
}

interface TypeItemListProps {
  items: TypeItem[]
  onNavigate?: (typeId: number) => void
  showQuantity?: boolean
  iconSize?: 'sm' | 'md' | 'lg'
}

export function TypeItemList({
  items,
  onNavigate,
  showQuantity,
  iconSize = 'md',
}: TypeItemListProps) {
  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <button
          key={`${item.id}-${index}`}
          onClick={() => onNavigate?.(item.id)}
          className="flex w-full items-center gap-2 rounded p-1 text-left hover:bg-surface-tertiary"
        >
          <TypeIcon
            typeId={item.id}
            categoryId={item.categoryId}
            size={iconSize}
          />
          <span className="flex-1 text-sm text-content">{item.name}</span>
          {showQuantity && item.quantity != null && (
            <span className="text-sm text-content-secondary">
              x{formatFullNumber(item.quantity)}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
