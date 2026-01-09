import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InfoRow, InfoSection } from '@/components/ui/info-display'
import type { ESIStarbase, ESIStarbaseDetail } from '@/api/endpoints/starbases'
import { getType, getLocation } from '@/store/reference-cache'
import {
  calculateFuelHours,
  calculateStrontHours,
} from '@/store/starbase-details-store'
import {
  getStateDisplay,
  LOW_FUEL_THRESHOLD_HOURS,
} from '@/lib/structure-constants'
import {
  formatCountdown,
  formatElapsed,
  formatHoursAsTimer,
} from '@/lib/timer-utils'
import {
  cn,
  formatDateTime,
  formatFullNumber,
  formatSecurity,
} from '@/lib/utils'

interface POSInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  starbase: ESIStarbase | null
  detail: ESIStarbaseDetail | undefined
  ownerName: string
}

type StarbaseRole =
  | 'alliance_member'
  | 'config_starbase_equipment_role'
  | 'corporation_member'
  | 'starbase_fuel_technician_role'

const ROLE_LABEL_KEYS: Record<StarbaseRole, string> = {
  alliance_member: 'posInfo.roles.allianceMember',
  config_starbase_equipment_role: 'posInfo.roles.configStarbaseEquipmentRole',
  corporation_member: 'posInfo.roles.corporationMember',
  starbase_fuel_technician_role: 'posInfo.roles.starbaseFuelTechnicianRole',
}

function BooleanBadge({
  value,
  yesLabel,
  noLabel,
}: {
  value: boolean
  yesLabel: string
  noLabel: string
}) {
  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded text-xs font-medium',
        value
          ? 'bg-semantic-success/20 text-status-positive'
          : 'bg-surface-secondary text-content-muted'
      )}
    >
      {value ? yesLabel : noLabel}
    </span>
  )
}

export function POSInfoDialog({
  open,
  onOpenChange,
  starbase,
  detail,
  ownerName,
}: POSInfoDialogProps) {
  const { t } = useTranslation('dialogs')

  if (!starbase) return null

  const type = getType(starbase.type_id)
  const location = getLocation(starbase.system_id)
  const moon = starbase.moon_id ? getLocation(starbase.moon_id) : undefined

  const typeName =
    type?.name ?? t('posInfo.unknownType', { id: starbase.type_id })
  const systemName =
    location?.name ?? t('posInfo.systemTemplate', { id: starbase.system_id })
  const regionName = location?.regionName ?? t('structureInfo.unknownRegion')
  const moonName =
    moon?.name ??
    (starbase.moon_id
      ? t('posInfo.moonTemplate', { id: starbase.moon_id })
      : t('posInfo.unanchored'))

  const state = starbase.state ?? 'unknown'
  const stateInfo = getStateDisplay(state)

  const yesLabel = t('posInfo.yes')
  const noLabel = t('posInfo.no')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <img
              src={`https://images.evetech.net/types/${starbase.type_id}/icon?size=64`}
              alt={typeName}
              className="w-12 h-12 rounded"
            />
            <div>
              <DialogTitle className="text-lg">{typeName}</DialogTitle>
              <DialogDescription>{moonName}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <InfoSection title={t('posInfo.location')}>
            <InfoRow
              label={t('posInfo.system')}
              value={systemName}
              className="text-status-info"
            />
            <InfoRow label={t('posInfo.region')} value={regionName} />
            <InfoRow label={t('posInfo.moon')} value={moonName} />
            <InfoRow label={t('posInfo.owner')} value={ownerName} />
          </InfoSection>

          <InfoSection title={t('posInfo.status')}>
            <InfoRow
              label={t('posInfo.state')}
              value={stateInfo.label}
              className={stateInfo.color}
            />
            {starbase.reinforced_until && (
              <>
                <InfoRow
                  label={t('posInfo.rfTimer')}
                  value={formatCountdown(starbase.reinforced_until)}
                  className="text-status-negative font-mono"
                />
                <InfoRow
                  label={t('posInfo.reinforcedUntil')}
                  value={formatDateTime(starbase.reinforced_until)}
                  className="text-status-negative"
                />
              </>
            )}
            {starbase.unanchor_at && (
              <>
                <InfoRow
                  label={t('posInfo.unanchorTimer')}
                  value={formatCountdown(starbase.unanchor_at)}
                  className="text-status-highlight font-mono"
                />
                <InfoRow
                  label={t('posInfo.unanchorAt')}
                  value={formatDateTime(starbase.unanchor_at)}
                  className="text-status-highlight"
                />
              </>
            )}
            {starbase.onlined_since && (
              <>
                <InfoRow
                  label={t('posInfo.onlineDuration')}
                  value={formatElapsed(starbase.onlined_since)}
                  className="text-status-positive font-mono"
                />
                <InfoRow
                  label={t('posInfo.onlineSince')}
                  value={formatDateTime(starbase.onlined_since)}
                />
              </>
            )}
          </InfoSection>

          {detail && (
            <InfoSection title={t('posInfo.fuelTimers')}>
              {(() => {
                const fuelHours = calculateFuelHours(
                  detail,
                  type?.towerSize,
                  type?.fuelTier
                )
                const strontHours = calculateStrontHours(
                  detail,
                  type?.towerSize
                )
                const fuelIsLow =
                  fuelHours !== null && fuelHours < LOW_FUEL_THRESHOLD_HOURS
                const strontIsLow = strontHours !== null && strontHours < 24
                return (
                  <>
                    <InfoRow
                      label={t('posInfo.fuelRemaining')}
                      value={formatHoursAsTimer(fuelHours)}
                      className={cn(
                        'font-mono',
                        fuelIsLow ? 'text-status-negative' : undefined
                      )}
                    />
                    <InfoRow
                      label={t('posInfo.strontRemaining')}
                      value={formatHoursAsTimer(strontHours)}
                      className={cn(
                        'font-mono',
                        strontIsLow ? 'text-status-negative' : undefined
                      )}
                    />
                  </>
                )
              })()}
            </InfoSection>
          )}

          {detail && (
            <>
              <InfoSection title={t('posInfo.accessSettings')}>
                <InfoRow
                  label={t('posInfo.allowCorpMembers')}
                  value={
                    <BooleanBadge
                      value={detail.allow_corporation_members}
                      yesLabel={yesLabel}
                      noLabel={noLabel}
                    />
                  }
                />
                <InfoRow
                  label={t('posInfo.allowAllianceMembers')}
                  value={
                    <BooleanBadge
                      value={detail.allow_alliance_members}
                      yesLabel={yesLabel}
                      noLabel={noLabel}
                    />
                  }
                />
                <InfoRow
                  label={t('posInfo.useAllianceStandings')}
                  value={
                    <BooleanBadge
                      value={detail.use_alliance_standings}
                      yesLabel={yesLabel}
                      noLabel={noLabel}
                    />
                  }
                />
              </InfoSection>

              <InfoSection title={t('posInfo.combatSettings')}>
                <InfoRow
                  label={t('posInfo.attackIfAtWar')}
                  value={
                    <BooleanBadge
                      value={detail.attack_if_at_war}
                      yesLabel={yesLabel}
                      noLabel={noLabel}
                    />
                  }
                />
                <InfoRow
                  label={t('posInfo.attackCriminals')}
                  value={
                    <BooleanBadge
                      value={detail.attack_if_other_security_status_dropping}
                      yesLabel={yesLabel}
                      noLabel={noLabel}
                    />
                  }
                />
                {detail.attack_security_status_threshold !== undefined && (
                  <InfoRow
                    label={t('posInfo.secStatusThreshold')}
                    value={formatSecurity(
                      detail.attack_security_status_threshold
                    )}
                  />
                )}
                {detail.attack_standing_threshold !== undefined && (
                  <InfoRow
                    label={t('posInfo.standingThreshold')}
                    value={formatSecurity(detail.attack_standing_threshold)}
                  />
                )}
              </InfoSection>

              <InfoSection title={t('posInfo.rolePermissions')}>
                <InfoRow
                  label={t('posInfo.anchor')}
                  value={t(ROLE_LABEL_KEYS[detail.anchor])}
                />
                <InfoRow
                  label={t('posInfo.unanchor')}
                  value={t(ROLE_LABEL_KEYS[detail.unanchor])}
                />
                <InfoRow
                  label={t('posInfo.online')}
                  value={t(ROLE_LABEL_KEYS[detail.online])}
                />
                <InfoRow
                  label={t('posInfo.offline')}
                  value={t(ROLE_LABEL_KEYS[detail.offline])}
                />
                <InfoRow
                  label={t('posInfo.fuelBayView')}
                  value={t(ROLE_LABEL_KEYS[detail.fuel_bay_view])}
                />
                <InfoRow
                  label={t('posInfo.fuelBayTake')}
                  value={t(ROLE_LABEL_KEYS[detail.fuel_bay_take])}
                />
              </InfoSection>

              {detail.fuels && detail.fuels.length > 0 && (
                <InfoSection title={t('posInfo.fuelBay')}>
                  {detail.fuels.map((fuel) => {
                    const fuelType = getType(fuel.type_id)
                    return (
                      <InfoRow
                        key={fuel.type_id}
                        label={fuelType?.name ?? `Type ${fuel.type_id}`}
                        value={formatFullNumber(fuel.quantity)}
                      />
                    )
                  })}
                </InfoSection>
              )}
            </>
          )}

          {!detail && (
            <div className="text-center py-4 text-content-muted text-sm">
              {t('posInfo.noDetailAvailable')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
