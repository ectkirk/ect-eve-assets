import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

export function UpdateBanner() {
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
    <div className="flex items-center justify-between bg-blue-600 px-4 py-2 text-sm text-white">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4" />
        <span>Version {updateReady} is ready to install</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleInstall}
          className="rounded bg-white px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
        >
          Restart Now
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="rounded p-1 hover:bg-blue-500"
          title="Install later (on next restart)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
