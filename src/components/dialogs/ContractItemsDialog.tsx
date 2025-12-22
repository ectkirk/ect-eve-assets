import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TypeIcon } from '@/components/ui/type-icon'
import { hasType, getType } from '@/store/reference-cache'
import { formatNumber } from '@/lib/utils'

interface ContractItem {
  type_id: number
  quantity: number
  is_included?: boolean
  is_blueprint_copy?: boolean
}

interface ContractItemsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ContractItem[]
  contractType: string
  prices: Map<number, number>
}

export function ContractItemsDialog({
  open,
  onOpenChange,
  items,
  contractType,
  prices,
}: ContractItemsDialogProps) {
  const totalValue = items.reduce((sum, item) => {
    if (item.is_blueprint_copy) return sum
    const price = prices.get(item.type_id) ?? 0
    return sum + price * item.quantity
  }, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Contract Items</DialogTitle>
          <DialogDescription>
            {contractType} · {items.length} item{items.length !== 1 ? 's' : ''}
            {totalValue > 0 && ` · ${formatNumber(totalValue)} ISK`}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[60vh] -mx-6 px-6">
          <div className="space-y-1">
            {items.map((item, idx) => {
              const type = hasType(item.type_id)
                ? getType(item.type_id)
                : undefined
              const typeName = type?.name ?? `Unknown Type ${item.type_id}`
              const price = prices.get(item.type_id) ?? 0
              const itemValue = item.is_blueprint_copy
                ? 0
                : price * item.quantity

              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0"
                >
                  <TypeIcon
                    typeId={item.type_id}
                    categoryId={type?.categoryId}
                    isBlueprintCopy={item.is_blueprint_copy}
                  />
                  <div className="flex-1 min-w-0">
                    <span
                      className={
                        item.is_blueprint_copy ? 'text-status-special' : ''
                      }
                    >
                      {typeName}
                    </span>
                  </div>
                  <span className="text-content-secondary tabular-nums">
                    x{item.quantity.toLocaleString()}
                  </span>
                  {itemValue > 0 && (
                    <span className="text-status-positive tabular-nums w-24 text-right">
                      {formatNumber(itemValue)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
