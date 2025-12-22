import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAssetStore } from '@/store/asset-store'
import { hasAbyssal } from '@/store/reference-cache'
import {
  isAbyssalTypeId,
  fetchAbyssalPrices,
  type AbyssalItem,
} from '@/api/mutamarket-client'
import { AlertTriangle, ExternalLink } from 'lucide-react'

interface AbyssalSyncModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function collectUnpricedAbyssalItems(): AbyssalItem[] {
  const assetsByOwner = useAssetStore.getState().assetsByOwner
  const unpricedItems: AbyssalItem[] = []

  for (const { assets } of assetsByOwner) {
    for (const asset of assets) {
      if (isAbyssalTypeId(asset.type_id) && !hasAbyssal(asset.item_id)) {
        unpricedItems.push({ itemId: asset.item_id, typeId: asset.type_id })
      }
    }
  }

  return unpricedItems
}

export function AbyssalSyncModal({
  open,
  onOpenChange,
}: AbyssalSyncModalProps) {
  const [unpricedCount, setUnpricedCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [progress, setProgress] = useState<{
    fetched: number
    total: number
  } | null>(null)
  const [syncResult, setSyncResult] = useState<{
    success: number
    failed: number
  } | null>(null)

  const refreshCount = useCallback(() => {
    const items = collectUnpricedAbyssalItems()
    setUnpricedCount(items.length)
    setSyncResult(null)
  }, [])

  useEffect(() => {
    if (open) {
      refreshCount()
    }
  }, [open, refreshCount])

  const handleSync = async () => {
    const items = collectUnpricedAbyssalItems()
    if (items.length === 0) return

    setIsSyncing(true)
    setProgress({ fetched: 0, total: items.length })
    setSyncResult(null)

    try {
      const results = await fetchAbyssalPrices(items, (fetched, total) => {
        setProgress({ fetched, total })
      })

      const successCount = results.size
      const failedCount = items.length - successCount

      setSyncResult({ success: successCount, failed: failedCount })
      refreshCount()
    } finally {
      setIsSyncing(false)
      setProgress(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Abyssal Module Pricing</DialogTitle>
          <DialogDescription>
            Sync your abyssal modules with Mutamarket for accurate pricing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-semantic-warning/50 bg-semantic-warning/10 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-semantic-warning" />
              <div className="space-y-2 text-sm">
                <p className="font-medium text-content">Privacy Notice</p>
                <p className="text-content-secondary">
                  By syncing your abyssal modules, you are sending your unique
                  item IDs to{' '}
                  <a
                    href="https://mutamarket.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline inline-flex items-center gap-1"
                  >
                    Mutamarket.com
                    <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  for appraisal.
                </p>
                <p className="text-content-secondary">
                  This will make your abyssal modules{' '}
                  <strong>publicly searchable</strong> on Mutamarket. Other
                  players will be able to see these modules exist and their
                  stats.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface-tertiary/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-content-secondary">
                  Unpriced Abyssal Modules
                </div>
                <div className="text-2xl font-semibold text-content">
                  {unpricedCount}
                </div>
              </div>
              {unpricedCount === 0 && (
                <div className="text-sm text-semantic-positive">
                  All modules priced
                </div>
              )}
            </div>
          </div>

          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-content-secondary">
                <span>Syncing...</span>
                <span>
                  {progress.fetched} / {progress.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-tertiary">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{
                    width: `${(progress.fetched / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {syncResult && (
            <div className="rounded-lg border border-border bg-surface-tertiary/50 p-3 text-sm">
              <span className="text-semantic-positive">
                {syncResult.success} priced
              </span>
              {syncResult.failed > 0 && (
                <>
                  <span className="text-content-muted"> · </span>
                  <span className="text-semantic-warning">
                    {syncResult.failed} not found on Mutamarket
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            onClick={() => onOpenChange(false)}
            disabled={isSyncing}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-tertiary disabled:opacity-50"
          >
            {isSyncing ? 'Please wait...' : 'Close'}
          </button>
          <button
            onClick={handleSync}
            disabled={unpricedCount === 0 || isSyncing}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {isSyncing ? 'Syncing...' : `Sync ${unpricedCount} Modules`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
