import type { Owner } from '@/store/auth-store'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  X,
  Loader2,
  Square,
  CheckSquare,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { OwnerIcon } from '@/components/ui/type-icon'

export interface OwnerRowProps {
  owner: Owner
  isSelected: boolean
  disabled?: boolean
  isRefreshingRoles?: boolean
  hasDirectorRole?: boolean
  hasCorporation?: boolean
  indented?: boolean
  onToggle: () => void
  onRemove: (e: React.MouseEvent) => void
  onReauth: (e: React.MouseEvent) => void
  onRefreshRoles?: () => void
  onAddCorporation?: () => void
}

export function OwnerRow({
  owner,
  isSelected,
  disabled,
  isRefreshingRoles,
  hasDirectorRole,
  hasCorporation,
  indented,
  onToggle,
  onRemove,
  onReauth,
  onRefreshRoles,
  onAddCorporation,
}: OwnerRowProps) {
  const isCorp = owner.type === 'corporation'
  const needsAttention = owner.authFailed || owner.scopesOutdated
  const CheckIcon = isSelected ? CheckSquare : Square
  const canAddCorporation =
    hasDirectorRole && !hasCorporation && onAddCorporation

  const rowContent = (
    <div
      onClick={disabled ? undefined : onToggle}
      className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors ${
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-surface-tertiary'
      } ${owner.authFailed ? 'ring-1 ring-semantic-danger/50' : ''} ${owner.scopesOutdated && !owner.authFailed ? 'ring-1 ring-semantic-warning/50' : ''} ${indented ? 'ml-6' : ''}`}
    >
      <div className="flex items-center gap-2">
        <CheckIcon
          className={`h-4 w-4 ${isSelected ? 'text-accent' : 'text-content-muted'}`}
        />
        <OwnerIcon ownerId={owner.id} ownerType={owner.type} size="lg" />
        <span className={`text-sm ${isCorp ? 'text-status-corp' : ''}`}>
          {owner.name}
        </span>
        {isRefreshingRoles && (
          <Loader2 className="h-3 w-3 animate-spin text-content-muted" />
        )}
        {owner.authFailed && (
          <span className="flex items-center gap-1 text-xs text-semantic-danger">
            <AlertCircle className="h-3 w-3" />
            Re-auth needed
          </span>
        )}
        {owner.scopesOutdated && !owner.authFailed && (
          <span className="flex items-center gap-1 text-xs text-semantic-warning">
            <AlertCircle className="h-3 w-3" />
            Upgrade scopes
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {needsAttention && !disabled && (
          <button
            onClick={onReauth}
            className="rounded p-1 text-semantic-warning hover:bg-surface-tertiary"
            title={owner.authFailed ? 'Re-authenticate' : 'Upgrade scopes'}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        {!disabled && (
          <button
            onClick={onRemove}
            className="rounded p-1 text-content-secondary hover:bg-surface-tertiary hover:text-semantic-danger"
            title={`Remove ${owner.type}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )

  if (!isCorp && onRefreshRoles) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={onRefreshRoles}
            disabled={isRefreshingRoles}
          >
            {isRefreshingRoles ? 'Refreshing...' : 'Refresh Corporation Roles'}
          </ContextMenuItem>
          {canAddCorporation && (
            <ContextMenuItem onClick={onAddCorporation}>
              Add Corporation
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return rowContent
}
