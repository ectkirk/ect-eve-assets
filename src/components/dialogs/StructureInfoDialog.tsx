import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ESICorporationStructure } from '@/store/structures-store'
import { getType, getLocation } from '@/store/reference-cache'
import { cn } from '@/lib/utils'

interface StructureInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  structure: ESICorporationStructure | null
  ownerName: string
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

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  anchor_vulnerable: {
    label: 'Anchor Vulnerable',
    color: 'text-status-highlight',
  },
  anchoring: { label: 'Anchoring', color: 'text-status-info' },
  armor_reinforce: { label: 'Armor Reinforced', color: 'text-status-negative' },
  armor_vulnerable: {
    label: 'Armor Vulnerable',
    color: 'text-status-highlight',
  },
  deploy_vulnerable: {
    label: 'Deploy Vulnerable',
    color: 'text-status-highlight',
  },
  fitting_invulnerable: { label: 'Fitting', color: 'text-status-info' },
  hull_reinforce: { label: 'Hull Reinforced', color: 'text-status-negative' },
  hull_vulnerable: { label: 'Hull Vulnerable', color: 'text-status-negative' },
  online_deprecated: { label: 'Online', color: 'text-status-positive' },
  onlining_vulnerable: { label: 'Onlining', color: 'text-status-info' },
  shield_vulnerable: { label: 'Online', color: 'text-status-positive' },
  unanchored: { label: 'Unanchored', color: 'text-content-muted' },
  unknown: { label: 'Unknown', color: 'text-content-muted' },
}

export function StructureInfoDialog({
  open,
  onOpenChange,
  structure,
  ownerName,
}: StructureInfoDialogProps) {
  if (!structure) return null

  const type = getType(structure.type_id)
  const location = getLocation(structure.system_id)

  const typeName = type?.name ?? `Unknown Type ${structure.type_id}`
  const systemName = location?.name ?? `System ${structure.system_id}`
  const regionName = location?.regionName ?? 'Unknown Region'

  const stateInfo = STATE_LABELS[structure.state] ?? {
    label: 'Unknown',
    color: 'text-content-muted',
  }

  const formatDateTime = (dateStr: string | undefined) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString()
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
                {structure.name || 'Unnamed Structure'}
              </DialogTitle>
              <DialogDescription>{typeName}</DialogDescription>
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
            <InfoRow label="Owner" value={ownerName} />
          </Section>

          <Section title="Status">
            <InfoRow
              label="State"
              value={stateInfo.label}
              className={stateInfo.color}
            />
            {structure.state_timer_start && (
              <InfoRow
                label="State Started"
                value={formatDateTime(structure.state_timer_start)}
              />
            )}
            {structure.state_timer_end && (
              <InfoRow
                label="State Ends"
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
                label="Unanchors At"
                value={formatDateTime(structure.unanchors_at)}
                className="text-status-highlight"
              />
            )}
          </Section>

          <Section title="Reinforcement">
            <InfoRow
              label="Vulnerability Window"
              value={formatReinforceHour(structure.reinforce_hour)}
            />
            {structure.next_reinforce_hour !== undefined &&
              structure.next_reinforce_apply && (
                <>
                  <InfoRow
                    label="Pending Window"
                    value={formatReinforceHour(structure.next_reinforce_hour)}
                    className="text-status-info"
                  />
                  <InfoRow
                    label="Change Applies"
                    value={formatDateTime(structure.next_reinforce_apply)}
                  />
                </>
              )}
          </Section>

          <Section title="Fuel">
            <InfoRow
              label="Fuel Expires"
              value={
                structure.fuel_expires
                  ? formatDateTime(structure.fuel_expires)
                  : 'No fuel data'
              }
              className={
                structure.fuel_expires ? undefined : 'text-content-muted'
              }
            />
          </Section>

          {structure.services && structure.services.length > 0 && (
            <Section title="Services">
              <div className="flex flex-wrap gap-2 py-2">
                {structure.services.map((service, idx) => (
                  <ServiceBadge
                    key={idx}
                    name={service.name}
                    state={service.state}
                  />
                ))}
              </div>
            </Section>
          )}

          {(!structure.services || structure.services.length === 0) && (
            <Section title="Services">
              <div className="py-2 text-content-muted text-sm">
                No services installed
              </div>
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
