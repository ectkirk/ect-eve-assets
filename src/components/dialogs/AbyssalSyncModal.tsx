import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('dialogs')
  const { t: tc } = useTranslation('common')
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
          <DialogTitle>{t('abyssalSync.title')}</DialogTitle>
          <DialogDescription>{t('abyssalSync.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <AlertBox variant="warning" title={t('abyssalSync.privacyTitle')}>
            <p>
              {t('abyssalSync.privacyText1').split('Mutamarket.com')[0]}
              <a
                href="https://mutamarket.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-1"
              >
                Mutamarket.com
                <ExternalLink className="h-3 w-3" />
              </a>
              {t('abyssalSync.privacyText1').split('Mutamarket.com')[1]}
            </p>
            <p className="mt-2">{t('abyssalSync.privacyText2')}</p>
          </AlertBox>

          <div className="rounded-lg border border-border bg-surface-tertiary/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-content-secondary">
                  {t('abyssalSync.unpricedModules')}
                </div>
                <div className="text-2xl font-semibold text-content">
                  {unpricedCount}
                </div>
              </div>
              {unpricedCount === 0 && !isSyncing && (
                <div className="text-sm text-semantic-positive">
                  {t('abyssalSync.allPriced')}
                </div>
              )}
            </div>
          </div>

          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-content-secondary">
                <span>{t('abyssalSync.syncing')}</span>
                <span>
                  {t('abyssalSync.progress', {
                    fetched: progress.fetched,
                    total: progress.total,
                  })}
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
                {t('abyssalSync.backgroundNote')}
              </p>
            </div>
          )}

          {lastResult && (
            <div className="rounded-lg border border-border bg-surface-tertiary/50 p-3 text-sm">
              <span className="text-semantic-positive">
                {t('abyssalSync.resultSuccess', { count: lastResult.success })}
              </span>
              {lastResult.failed > 0 && (
                <>
                  <span className="text-content-muted"> · </span>
                  <span className="text-semantic-warning">
                    {t('abyssalSync.resultFailed', {
                      count: lastResult.failed,
                    })}
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
            {tc('buttons.close')}
          </button>
          <button
            onClick={startSync}
            disabled={unpricedCount === 0 || isSyncing}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {isSyncing
              ? t('abyssalSync.syncingButton')
              : t('abyssalSync.syncButton', { count: unpricedCount })}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
