import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InfoRow, InfoSection } from '@/components/ui/info-display'
import type { ESICorporationStructure } from '@/store/structures-store'
import { getType, getLocation } from '@/store/reference-cache'
import { cn, formatDateTime } from '@/lib/utils'

interface StructureInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  structure: ESICorporationStructure | null
  ownerName: string
}

function ServiceBadge({
  name,
  state,
}: {
  name: string
  state: 'online' | 'offline' | 'cleanup'
}) {
  const isOnline = state === 'online'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs',
        isOnline
          ? 'bg-semantic-success/20 text-status-positive'
          : 'bg-surface-tertiary text-content-muted'
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          isOnline ? 'bg-status-positive' : 'bg-content-muted'
        )}
      />
      {name}
    </span>
  )
}

const STATE_LABEL_KEYS: Record<string, { labelKey: string; color: string }> = {
  anchor_vulnerable: {
    labelKey: 'structureInfo.states.anchorVulnerable',
    color: 'text-status-highlight',
  },
  anchoring: {
    labelKey: 'structureInfo.states.anchoring',
    color: 'text-status-info',
  },
  armor_reinforce: {
    labelKey: 'structureInfo.states.armorReinforce',
    color: 'text-status-negative',
  },
  armor_vulnerable: {
    labelKey: 'structureInfo.states.armorVulnerable',
    color: 'text-status-highlight',
  },
  deploy_vulnerable: {
    labelKey: 'structureInfo.states.deployVulnerable',
    color: 'text-status-highlight',
  },
  fitting_invulnerable: {
    labelKey: 'structureInfo.states.fittingInvulnerable',
    color: 'text-status-info',
  },
  hull_reinforce: {
    labelKey: 'structureInfo.states.hullReinforce',
    color: 'text-status-negative',
  },
  hull_vulnerable: {
    labelKey: 'structureInfo.states.hullVulnerable',
    color: 'text-status-negative',
  },
  online_deprecated: {
    labelKey: 'structureInfo.states.onlineDeprecated',
    color: 'text-status-positive',
  },
  onlining_vulnerable: {
    labelKey: 'structureInfo.states.onliningVulnerable',
    color: 'text-status-info',
  },
  shield_vulnerable: {
    labelKey: 'structureInfo.states.shieldVulnerable',
    color: 'text-status-positive',
  },
  unanchored: {
    labelKey: 'structureInfo.states.unanchored',
    color: 'text-content-muted',
  },
  unknown: {
    labelKey: 'structureInfo.states.unknown',
    color: 'text-content-muted',
  },
}

export function StructureInfoDialog({
  open,
  onOpenChange,
  structure,
  ownerName,
}: StructureInfoDialogProps) {
  const { t } = useTranslation('dialogs')

  if (!structure) return null

  const type = getType(structure.type_id)
  const location = getLocation(structure.system_id)

  const typeName =
    type?.name ?? t('structureInfo.unknownType', { id: structure.type_id })
  const systemName =
    location?.name ??
    t('structureInfo.systemTemplate', { id: structure.system_id })
  const regionName = location?.regionName ?? t('structureInfo.unknownRegion')

  const stateInfo = STATE_LABEL_KEYS[structure.state] ?? {
    labelKey: 'structureInfo.states.unknown',
    color: 'text-content-muted',
  }

  const formatReinforceHour = (hour: number | undefined) => {
    if (hour === undefined) return '-'
    const start = (hour + 22) % 24
    const end = (hour + 2) % 24
    return `${start.toString().padStart(2, '0')}:00 - ${end.toString().padStart(2, '0')}:00 EVE`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <img
              src={`https://images.evetech.net/types/${structure.type_id}/icon?size=64`}
              alt={typeName}
              className="w-12 h-12 rounded"
            />
            <div>
              <DialogTitle className="text-lg">
                {structure.name || t('structureInfo.unnamedStructure')}
              </DialogTitle>
              <DialogDescription>{typeName}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <InfoSection title={t('structureInfo.location')}>
            <InfoRow
              label={t('structureInfo.system')}
              value={systemName}
              className="text-status-info"
            />
            <InfoRow label={t('structureInfo.region')} value={regionName} />
            <InfoRow label={t('structureInfo.owner')} value={ownerName} />
          </InfoSection>

          <InfoSection title={t('structureInfo.status')}>
            <InfoRow
              label={t('structureInfo.state')}
              value={t(stateInfo.labelKey)}
              className={stateInfo.color}
            />
            {structure.state_timer_start && (
              <InfoRow
                label={t('structureInfo.stateStarted')}
                value={formatDateTime(structure.state_timer_start)}
              />
            )}
            {structure.state_timer_end && (
              <InfoRow
                label={t('structureInfo.stateEnds')}
                value={formatDateTime(structure.state_timer_end)}
                className={
                  structure.state.includes('reinforce')
                    ? 'text-status-negative'
                    : undefined
                }
              />
            )}
            {structure.unanchors_at && (
              <InfoRow
                label={t('structureInfo.unanchorsAt')}
                value={formatDateTime(structure.unanchors_at)}
                className="text-status-highlight"
              />
            )}
          </InfoSection>

          <InfoSection title={t('structureInfo.reinforcement')}>
            <InfoRow
              label={t('structureInfo.vulnerabilityWindow')}
              value={formatReinforceHour(structure.reinforce_hour)}
            />
            {structure.next_reinforce_hour !== undefined &&
              structure.next_reinforce_apply && (
                <>
                  <InfoRow
                    label={t('structureInfo.pendingWindow')}
                    value={formatReinforceHour(structure.next_reinforce_hour)}
                    className="text-status-info"
                  />
                  <InfoRow
                    label={t('structureInfo.changeApplies')}
                    value={formatDateTime(structure.next_reinforce_apply)}
                  />
                </>
              )}
          </InfoSection>

          <InfoSection title={t('structureInfo.fuel')}>
            <InfoRow
              label={t('structureInfo.fuelExpires')}
              value={
                structure.fuel_expires
                  ? formatDateTime(structure.fuel_expires)
                  : t('structureInfo.noFuelData')
              }
              className={
                structure.fuel_expires ? undefined : 'text-content-muted'
              }
            />
          </InfoSection>

          {structure.services && structure.services.length > 0 && (
            <InfoSection title={t('structureInfo.services')}>
              <div className="flex flex-wrap gap-2 py-2">
                {structure.services.map((service, idx) => (
                  <ServiceBadge
                    key={idx}
                    name={service.name}
                    state={service.state}
                  />
                ))}
              </div>
            </InfoSection>
          )}

          {(!structure.services || structure.services.length === 0) && (
            <InfoSection title={t('structureInfo.services')}>
              <div className="py-2 text-content-muted text-sm">
                {t('structureInfo.noServices')}
              </div>
            </InfoSection>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
