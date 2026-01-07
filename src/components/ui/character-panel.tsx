import { ReactNode } from 'react'
import { CharacterPortrait } from './type-icon'

interface CharacterPanelProps {
  characterId: number
  characterName: string
  subtitle: string
  children: ReactNode
}

export function CharacterPanel({
  characterId,
  characterName,
  subtitle,
  children,
}: CharacterPanelProps) {
  return (
    <div className="flex h-full w-80 shrink-0 flex-col rounded-lg border border-border bg-surface-secondary/30">
      <div className="flex items-center gap-3 border-b border-border bg-surface-secondary px-3 py-2">
        <CharacterPortrait characterId={characterId} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{characterName}</div>
          <div className="text-xs text-content-secondary">{subtitle}</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}
