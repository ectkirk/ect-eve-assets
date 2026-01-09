import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
  Package,
  Users,
  Map,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { useThemeStore, THEME_OPTIONS } from '@/store/theme-store'
import { useSettingsStore, LANGUAGE_OPTIONS } from '@/store/settings-store'
import { useModalManager, useClickOutside } from '@/hooks'
import { useAbyssalSyncStore } from '@/store/abyssal-sync-store'
import { CreditsModal } from './CreditsModal'
import { SupportModal } from './SupportModal'
import { BugReportModal } from './BugReportModal'
import { ChangelogModal } from './ChangelogModal'
import { SupportersModal } from './SupportersModal'
import { ClearCacheModal } from '@/components/dialogs/ClearCacheModal'
import { AbyssalSyncModal } from '@/components/dialogs/AbyssalSyncModal'
import { AssetSettingsModal } from '@/components/dialogs/AssetSettingsModal'
import { MapSettingsModal } from '@/components/dialogs/MapSettingsModal'

type SettingsModal =
  | 'credits'
  | 'support'
  | 'supporters'
  | 'changelog'
  | 'clearCache'
  | 'abyssal'
  | 'bugReport'
  | 'assetSettings'
  | 'mapSettings'

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
  const { t } = useTranslation('layout')
  const [isMaximized, setIsMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const modals = useModalManager<SettingsModal>()
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const language = useSettingsStore((s) => s.language)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const abyssalSyncing = useAbyssalSyncStore((s) => s.isSyncing)
  const abyssalProgress = useAbyssalSyncStore((s) => s.progress)

  const openModal = (modal: SettingsModal) => {
    setSettingsOpen(false)
    modals.open(modal)
  }

  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.windowIsMaximized().then(setIsMaximized)
    return window.electronAPI.onWindowMaximizeChange(setIsMaximized)
  }, [])

  useClickOutside(settingsPanelRef, settingsOpen, closeSettings)

  return (
    <div
      className="flex items-center -mr-4"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {abyssalSyncing && (
        <button
          onClick={() => modals.open('abyssal')}
          aria-label="Abyssal sync in progress"
          className="flex h-10 items-center gap-1.5 px-3 text-xs text-content-secondary hover:bg-surface-tertiary hover:text-content"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
          <span>
            {abyssalProgress
              ? `${abyssalProgress.fetched}/${abyssalProgress.total}`
              : t('settings.syncing')}
          </span>
        </button>
      )}
      <div ref={settingsPanelRef} className="relative">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          aria-label="Settings"
          aria-expanded={settingsOpen}
          className="flex h-10 w-12 items-center justify-center text-content-secondary hover:bg-surface-tertiary hover:text-content"
        >
          <Settings className="h-4 w-4" />
        </button>
        {settingsOpen && (
          <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-border bg-surface-secondary shadow-lg z-50">
            <div className="p-3 border-b border-border">
              <span className="text-sm font-medium text-content-secondary">
                {t('settings.title')}
              </span>
            </div>
            <div className="p-2">
              <div className="px-2 py-1.5">
                <label className="text-xs text-content-muted mb-1 block">
                  {t('settings.theme')}
                </label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as typeof theme)}
                  className="w-full rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm text-content-secondary focus:border-accent focus:outline-hidden"
                >
                  {THEME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="px-2 py-1.5">
                <label className="text-xs text-content-muted mb-1 block">
                  {t('settings.language')}
                </label>
                <select
                  value={language}
                  onChange={(e) =>
                    setLanguage(e.target.value as typeof language)
                  }
                  className="w-full rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm text-content-secondary focus:border-accent focus:outline-hidden"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="my-2 border-t border-border" />
              <MenuItem
                icon={Package}
                onClick={() => openModal('assetSettings')}
              >
                {t('settings.assetView')}
              </MenuItem>
              <MenuItem icon={Map} onClick={() => openModal('mapSettings')}>
                {t('settings.mapRouting')}
              </MenuItem>
              <div className="my-2 border-t border-border" />
              <MenuItem icon={Sparkles} onClick={() => openModal('abyssal')}>
                {t('settings.abyssalPricing')}
              </MenuItem>
              <div className="my-2 border-t border-border" />
              <MenuItem icon={History} onClick={() => openModal('changelog')}>
                {t('settings.changelog')}
              </MenuItem>
              <MenuItem icon={Info} onClick={() => openModal('credits')}>
                {t('settings.credits')}
              </MenuItem>
              <MenuItem icon={Heart} onClick={() => openModal('support')}>
                {t('settings.supportUs')}
              </MenuItem>
              <MenuItem icon={Users} onClick={() => openModal('supporters')}>
                {t('settings.supporters')}
              </MenuItem>
              <div className="my-2 border-t border-border" />
              <MenuItem
                icon={FolderOpen}
                onClick={() => window.electronAPI?.openLogsFolder()}
              >
                {t('settings.openLogsFolder')}
              </MenuItem>
              <MenuItem icon={Bug} onClick={() => openModal('bugReport')}>
                {t('settings.reportBug')}
              </MenuItem>
              <div className="my-2 border-t border-border" />
              <MenuItem icon={Shield} href="https://edencom.net/privacy-policy">
                {t('settings.privacyPolicy')}
              </MenuItem>
              <MenuItem
                icon={FileText}
                href="https://edencom.net/terms-of-service"
              >
                {t('settings.termsOfService')}
              </MenuItem>
              <div className="my-2 border-t border-semantic-danger/30" />
              <MenuItem
                icon={Trash2}
                variant="danger"
                onClick={() => openModal('clearCache')}
              >
                {t('settings.clearCache')}
              </MenuItem>
            </div>
          </div>
        )}
      </div>
      <ChangelogModal
        open={modals.isOpen('changelog')}
        onOpenChange={(open) => modals.setOpen('changelog', open)}
      />
      <CreditsModal
        open={modals.isOpen('credits')}
        onOpenChange={(open) => modals.setOpen('credits', open)}
      />
      <SupportModal
        open={modals.isOpen('support')}
        onOpenChange={(open) => modals.setOpen('support', open)}
      />
      <SupportersModal
        open={modals.isOpen('supporters')}
        onOpenChange={(open) => modals.setOpen('supporters', open)}
      />
      <ClearCacheModal
        open={modals.isOpen('clearCache')}
        onOpenChange={(open) => modals.setOpen('clearCache', open)}
      />
      <AbyssalSyncModal
        open={modals.isOpen('abyssal')}
        onOpenChange={(open) => modals.setOpen('abyssal', open)}
      />
      <BugReportModal
        open={modals.isOpen('bugReport')}
        onOpenChange={(open) => modals.setOpen('bugReport', open)}
      />
      <AssetSettingsModal
        open={modals.isOpen('assetSettings')}
        onOpenChange={(open) => modals.setOpen('assetSettings', open)}
      />
      <MapSettingsModal
        open={modals.isOpen('mapSettings')}
        onOpenChange={(open) => modals.setOpen('mapSettings', open)}
      />
      <button
        onClick={() => window.electronAPI?.windowMinimize()}
        aria-label="Minimize window"
        className="flex h-10 w-12 items-center justify-center text-content-secondary hover:bg-surface-tertiary hover:text-content"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        onClick={() => window.electronAPI?.windowMaximize()}
        aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
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
        aria-label="Close window"
        className="flex h-10 w-12 items-center justify-center text-content-secondary hover:bg-semantic-danger hover:text-content"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
