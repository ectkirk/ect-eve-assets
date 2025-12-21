import { useState, useEffect, useRef } from 'react'
import {
  Minus,
  Square,
  Copy,
  X,
  Settings,
  Info,
  Heart,
  Shield,
  FileText,
  History,
  Trash2,
  Sparkles,
  Bug,
  FolderOpen,
} from 'lucide-react'
import { useThemeStore, THEME_OPTIONS } from '@/store/theme-store'
import { CreditsModal } from './CreditsModal'
import { SupportModal } from './SupportModal'
import { BugReportModal } from './BugReportModal'
import { ChangelogModal } from './ChangelogModal'
import { ClearCacheModal } from '@/components/dialogs/ClearCacheModal'
import { AbyssalSyncModal } from '@/components/dialogs/AbyssalSyncModal'

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [showClearCacheModal, setShowClearCacheModal] = useState(false)
  const [showAbyssalModal, setShowAbyssalModal] = useState(false)
  const [showBugReportModal, setShowBugReportModal] = useState(false)
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.windowIsMaximized().then(setIsMaximized)
    return window.electronAPI.onWindowMaximizeChange(setIsMaximized)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (
        settingsPanelRef.current &&
        !settingsPanelRef.current.contains(e.target as Node)
      ) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [settingsOpen])

  return (
    <div
      className="flex items-center -mr-4"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div ref={settingsPanelRef} className="relative">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex h-10 w-12 items-center justify-center text-content-secondary hover:bg-surface-tertiary hover:text-content"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
        {settingsOpen && (
          <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-border bg-surface-secondary shadow-lg z-50">
            <div className="p-3 border-b border-border">
              <span className="text-sm font-medium text-content-secondary">
                Settings
              </span>
            </div>
            <div className="p-2">
              <div className="px-2 py-1.5">
                <label className="text-xs text-content-muted mb-1 block">
                  Theme
                </label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as typeof theme)}
                  className="w-full rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm text-content-secondary focus:border-accent focus:outline-hidden"
                >
                  {THEME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="my-2 border-t border-border" />
              <button
                onClick={() => {
                  setShowAbyssalModal(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <Sparkles className="h-4 w-4" />
                Abyssal Pricing
              </button>
              <div className="my-2 border-t border-border" />
              <button
                onClick={() => {
                  setChangelogOpen(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <History className="h-4 w-4" />
                Changelog
              </button>
              <button
                onClick={() => {
                  setCreditsOpen(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <Info className="h-4 w-4" />
                Credits
              </button>
              <button
                onClick={() => {
                  setSupportOpen(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <Heart className="h-4 w-4" />
                Support Us
              </button>
              <div className="my-2 border-t border-border" />
              <button
                onClick={() => {
                  window.electronAPI?.openLogsFolder()
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <FolderOpen className="h-4 w-4" />
                Open Logs Folder
              </button>
              <button
                onClick={() => {
                  setShowBugReportModal(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <Bug className="h-4 w-4" />
                Report A Bug
              </button>
              <div className="my-2 border-t border-border" />
              <a
                href="https://edencom.net/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <Shield className="h-4 w-4" />
                Privacy Policy
              </a>
              <a
                href="https://edencom.net/terms-of-service"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <FileText className="h-4 w-4" />
                Terms of Service
              </a>
              <div className="my-2 border-t border-semantic-danger/30" />
              <button
                onClick={() => {
                  setShowClearCacheModal(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-semantic-danger hover:bg-semantic-danger/10"
              >
                <Trash2 className="h-4 w-4" />
                Clear Cache...
              </button>
            </div>
          </div>
        )}
      </div>
      <ChangelogModal open={changelogOpen} onOpenChange={setChangelogOpen} />
      <CreditsModal open={creditsOpen} onOpenChange={setCreditsOpen} />
      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />
      <ClearCacheModal
        open={showClearCacheModal}
        onOpenChange={setShowClearCacheModal}
      />
      <AbyssalSyncModal
        open={showAbyssalModal}
        onOpenChange={setShowAbyssalModal}
      />
      <BugReportModal
        open={showBugReportModal}
        onOpenChange={setShowBugReportModal}
      />
      <button
        onClick={() => window.electronAPI?.windowMinimize()}
        className="flex h-10 w-12 items-center justify-center text-content-secondary hover:bg-surface-tertiary hover:text-content"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        onClick={() => window.electronAPI?.windowMaximize()}
        className="flex h-10 w-12 items-center justify-center text-content-secondary hover:bg-surface-tertiary hover:text-content"
      >
        {isMaximized ? (
          <Copy className="h-3.5 w-3.5" />
        ) : (
          <Square className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        onClick={() => window.electronAPI?.windowClose()}
        className="flex h-10 w-12 items-center justify-center text-content-secondary hover:bg-semantic-danger hover:text-content"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
