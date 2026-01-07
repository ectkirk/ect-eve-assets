import { useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertBox } from '@/components/ui/alert-box'
import { useAbyssalSyncStore } from '@/store/abyssal-sync-store'
import { ExternalLink } from 'lucide-react'

interface AbyssalSyncModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AbyssalSyncModal({
  open,
  onOpenChange,
}: AbyssalSyncModalProps) {
  const {
    isSyncing,
    progress,
    lastResult,
    unpricedCount,
    refreshUnpricedCount,
    startSync,
  } = useAbyssalSyncStore()

  useEffect(() => {
    if (open) {
      refreshUnpricedCount()
    }
  }, [open, refreshUnpricedCount])

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
          <AlertBox variant="warning" title="Privacy Notice">
            <p>
              By syncing your abyssal modules, you are sending your unique item
              IDs to{' '}
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
            <p className="mt-2">
              This will make your abyssal modules{' '}
              <strong>publicly searchable</strong> on Mutamarket. Other players
              will be able to see these modules exist and their stats.
            </p>
          </AlertBox>

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
              {unpricedCount === 0 && !isSyncing && (
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
              <p className="text-xs text-content-muted">
                You can close this dialog — sync will continue in the background
              </p>
            </div>
          )}

          {lastResult && (
            <div className="rounded-lg border border-border bg-surface-tertiary/50 p-3 text-sm">
              <span className="text-semantic-positive">
                {lastResult.success} priced
              </span>
              {lastResult.failed > 0 && (
                <>
                  <span className="text-content-muted"> · </span>
                  <span className="text-semantic-warning">
                    {lastResult.failed} not found on Mutamarket
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-tertiary"
          >
            Close
          </button>
          <button
            onClick={startSync}
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
