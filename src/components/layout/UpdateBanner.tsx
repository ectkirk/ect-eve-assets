import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X } from 'lucide-react'

export function UpdateBanner() {
  const { t } = useTranslation('layout')
  const [updateReady, setUpdateReady] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.electronAPI) return

    const unsubscribe = window.electronAPI.onUpdateDownloaded((version) => {
      setUpdateReady(version)
    })

    return unsubscribe
  }, [])

  if (!updateReady || dismissed) return null

  const handleInstall = () => {
    window.electronAPI?.installUpdate()
  }

  return (
    <div className="flex items-center justify-between bg-accent px-4 py-2 text-sm text-accent-foreground">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4" />
        <span>{t('update.versionReady', { version: updateReady })}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleInstall}
          className="rounded bg-surface-inverse px-3 py-1 text-sm font-medium text-surface-inverse-foreground hover:opacity-90"
        >
          {t('buttons.restartNow', { ns: 'common' })}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label={t('accessibility.dismissUpdateNotification')}
          className="rounded p-1 hover:bg-accent-hover"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
