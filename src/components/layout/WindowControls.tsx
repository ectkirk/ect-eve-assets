import { useState, useEffect, useRef, type ReactNode } from 'react'
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
  type LucideIcon,
} from 'lucide-react'
import { useThemeStore, THEME_OPTIONS } from '@/store/theme-store'
import { CreditsModal } from './CreditsModal'
import { SupportModal } from './SupportModal'
import { BugReportModal } from './BugReportModal'
import { ChangelogModal } from './ChangelogModal'
import { ClearCacheModal } from '@/components/dialogs/ClearCacheModal'
import { AbyssalSyncModal } from '@/components/dialogs/AbyssalSyncModal'

const menuItemClass =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary'

function MenuItem({
  icon: Icon,
  children,
  onClick,
  href,
  variant,
}: {
  icon: LucideIcon
  children: ReactNode
  onClick?: () => void
  href?: string
  variant?: 'danger'
}) {
  const className =
    variant === 'danger'
      ? 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-semantic-danger hover:bg-semantic-danger/10'
      : menuItemClass

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        <Icon className="h-4 w-4" />
        {children}
      </a>
    )
  }

  return (
    <button onClick={onClick} className={className}>
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}

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
              <MenuItem
                icon={Sparkles}
                onClick={() => {
                  setShowAbyssalModal(true)
                  setSettingsOpen(false)
                }}
              >
                Abyssal Pricing
              </MenuItem>
              <div className="my-2 border-t border-border" />
              <MenuItem
                icon={History}
                onClick={() => {
                  setChangelogOpen(true)
                  setSettingsOpen(false)
                }}
              >
                Changelog
              </MenuItem>
              <MenuItem
                icon={Info}
                onClick={() => {
                  setCreditsOpen(true)
                  setSettingsOpen(false)
                }}
              >
                Credits
              </MenuItem>
              <MenuItem
                icon={Heart}
                onClick={() => {
                  setSupportOpen(true)
                  setSettingsOpen(false)
                }}
              >
                Support Us
              </MenuItem>
              <div className="my-2 border-t border-border" />
              <MenuItem
                icon={FolderOpen}
                onClick={() => window.electronAPI?.openLogsFolder()}
              >
                Open Logs Folder
              </MenuItem>
              <MenuItem
                icon={Bug}
                onClick={() => {
                  setShowBugReportModal(true)
                  setSettingsOpen(false)
                }}
              >
                Report A Bug
              </MenuItem>
              <div className="my-2 border-t border-border" />
              <MenuItem icon={Shield} href="https://edencom.net/privacy-policy">
                Privacy Policy
              </MenuItem>
              <MenuItem
                icon={FileText}
                href="https://edencom.net/terms-of-service"
              >
                Terms of Service
              </MenuItem>
              <div className="my-2 border-t border-semantic-danger/30" />
              <MenuItem
                icon={Trash2}
                variant="danger"
                onClick={() => {
                  setShowClearCacheModal(true)
                  setSettingsOpen(false)
                }}
              >
                Clear Cache...
              </MenuItem>
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
