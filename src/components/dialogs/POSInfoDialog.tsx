import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { cn } from '@/lib/utils'

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

const ROLE_LABELS: Record<StarbaseRole, string> = {
  alliance_member: 'Alliance Members',
  config_starbase_equipment_role: 'Starbase Config Role',
  corporation_member: 'Corp Members',
  starbase_fuel_technician_role: 'Fuel Technician Role',
}

function InfoRow({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-0">
      <span className="text-content-secondary text-sm">{label}</span>
      <span className={cn('text-sm font-medium', className)}>{value}</span>
    </div>
  )
}

function BooleanBadge({ value }: { value: boolean }) {
  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded text-xs font-medium',
        value
          ? 'bg-semantic-success/20 text-status-positive'
          : 'bg-surface-secondary text-content-muted'
      )}
    >
      {value ? 'Yes' : 'No'}
    </span>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">
        {title}
      </h4>
      <div className="bg-surface-secondary/50 rounded-lg px-3 py-1">
        {children}
      </div>
    </div>
  )
}

export function POSInfoDialog({
  open,
  onOpenChange,
  starbase,
  detail,
  ownerName,
}: POSInfoDialogProps) {
  if (!starbase) return null

  const type = getType(starbase.type_id)
  const location = getLocation(starbase.system_id)
  const moon = starbase.moon_id ? getLocation(starbase.moon_id) : undefined

  const typeName = type?.name ?? `Unknown Type ${starbase.type_id}`
  const systemName = location?.name ?? `System ${starbase.system_id}`
  const regionName = location?.regionName ?? 'Unknown Region'
  const moonName =
    moon?.name ?? (starbase.moon_id ? `Moon ${starbase.moon_id}` : 'Unanchored')

  const state = starbase.state ?? 'unknown'
  const stateInfo = getStateDisplay(state)

  const formatDateTime = (dateStr: string | undefined) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString()
  }

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
          <Section title="Location">
            <InfoRow
              label="System"
              value={systemName}
              className="text-status-info"
            />
            <InfoRow label="Region" value={regionName} />
            <InfoRow label="Moon" value={moonName} />
            <InfoRow label="Owner" value={ownerName} />
          </Section>

          <Section title="Status">
            <InfoRow
              label="State"
              value={stateInfo.label}
              className={stateInfo.color}
            />
            {starbase.reinforced_until && (
              <>
                <InfoRow
                  label="RF Timer"
                  value={formatCountdown(starbase.reinforced_until)}
                  className="text-status-negative font-mono"
                />
                <InfoRow
                  label="Reinforced Until"
                  value={formatDateTime(starbase.reinforced_until)}
                  className="text-status-negative"
                />
              </>
            )}
            {starbase.unanchor_at && (
              <>
                <InfoRow
                  label="Unanchor Timer"
                  value={formatCountdown(starbase.unanchor_at)}
                  className="text-status-highlight font-mono"
                />
                <InfoRow
                  label="Unanchor At"
                  value={formatDateTime(starbase.unanchor_at)}
                  className="text-status-highlight"
                />
              </>
            )}
            {starbase.onlined_since && (
              <>
                <InfoRow
                  label="Online Duration"
                  value={formatElapsed(starbase.onlined_since)}
                  className="text-status-positive font-mono"
                />
                <InfoRow
                  label="Online Since"
                  value={formatDateTime(starbase.onlined_since)}
                />
              </>
            )}
          </Section>

          {detail && (
            <Section title="Fuel Timers">
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
                      label="Fuel Remaining"
                      value={formatHoursAsTimer(fuelHours)}
                      className={cn(
                        'font-mono',
                        fuelIsLow ? 'text-status-negative' : undefined
                      )}
                    />
                    <InfoRow
                      label="Stront Remaining"
                      value={formatHoursAsTimer(strontHours)}
                      className={cn(
                        'font-mono',
                        strontIsLow ? 'text-status-negative' : undefined
                      )}
                    />
                  </>
                )
              })()}
            </Section>
          )}

          {detail && (
            <>
              <Section title="Access Settings">
                <InfoRow
                  label="Allow Corp Members"
                  value={
                    <BooleanBadge value={detail.allow_corporation_members} />
                  }
                />
                <InfoRow
                  label="Allow Alliance Members"
                  value={<BooleanBadge value={detail.allow_alliance_members} />}
                />
                <InfoRow
                  label="Use Alliance Standings"
                  value={<BooleanBadge value={detail.use_alliance_standings} />}
                />
              </Section>

              <Section title="Combat Settings">
                <InfoRow
                  label="Attack If At War"
                  value={<BooleanBadge value={detail.attack_if_at_war} />}
                />
                <InfoRow
                  label="Attack Criminals"
                  value={
                    <BooleanBadge
                      value={detail.attack_if_other_security_status_dropping}
                    />
                  }
                />
                {detail.attack_security_status_threshold !== undefined && (
                  <InfoRow
                    label="Sec Status Threshold"
                    value={detail.attack_security_status_threshold.toFixed(1)}
                  />
                )}
                {detail.attack_standing_threshold !== undefined && (
                  <InfoRow
                    label="Standing Threshold"
                    value={detail.attack_standing_threshold.toFixed(1)}
                  />
                )}
              </Section>

              <Section title="Role Permissions">
                <InfoRow label="Anchor" value={ROLE_LABELS[detail.anchor]} />
                <InfoRow
                  label="Unanchor"
                  value={ROLE_LABELS[detail.unanchor]}
                />
                <InfoRow label="Online" value={ROLE_LABELS[detail.online]} />
                <InfoRow label="Offline" value={ROLE_LABELS[detail.offline]} />
                <InfoRow
                  label="Fuel Bay View"
                  value={ROLE_LABELS[detail.fuel_bay_view]}
                />
                <InfoRow
                  label="Fuel Bay Take"
                  value={ROLE_LABELS[detail.fuel_bay_take]}
                />
              </Section>

              {detail.fuels && detail.fuels.length > 0 && (
                <Section title="Fuel Bay">
                  {detail.fuels.map((fuel) => {
                    const fuelType = getType(fuel.type_id)
                    return (
                      <InfoRow
                        key={fuel.type_id}
                        label={fuelType?.name ?? `Type ${fuel.type_id}`}
                        value={fuel.quantity.toLocaleString()}
                      />
                    )
                  })}
                </Section>
              )}
            </>
          )}

          {!detail && (
            <div className="text-center py-4 text-content-muted text-sm">
              Detailed information not available for offline POSes
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
