import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InfoRow, InfoSection } from '@/components/ui/info-display'
import type { ESICustomsOffice } from '@/store/customs-offices-store'
import { getLocation } from '@/store/reference-cache'
import { cn } from '@/lib/utils'

interface POCOInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customsOffice: ESICustomsOffice | null
  ownerName: string
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

function formatTaxRate(rate: number | undefined): string {
  if (rate === undefined) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

const STANDING_LABEL_KEYS: Record<string, string> = {
  excellent: 'pocoInfo.excellentStanding',
  good: 'pocoInfo.goodStanding',
  neutral: 'pocoInfo.neutralStanding',
  bad: 'pocoInfo.badStanding',
  terrible: 'pocoInfo.terribleStanding',
}

export function POCOInfoDialog({
  open,
  onOpenChange,
  customsOffice,
  ownerName,
}: POCOInfoDialogProps) {
  const { t } = useTranslation('dialogs')

  if (!customsOffice) return null

  const location = getLocation(customsOffice.system_id)
  const planet = getLocation(customsOffice.office_id)

  const systemName =
    location?.name ??
    t('pocoInfo.systemTemplate', { id: customsOffice.system_id })
  const regionName = location?.regionName ?? t('pocoInfo.unknownRegion')
  const planetName =
    planet?.name ?? t('pocoInfo.unknownPlanet', { id: customsOffice.office_id })

  const yesLabel = t('pocoInfo.yes')
  const noLabel = t('pocoInfo.no')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <img
              src="https://images.evetech.net/types/2233/icon?size=64"
              alt="Customs Office"
              className="w-12 h-12 rounded"
            />
            <div>
              <DialogTitle className="text-lg">{planetName}</DialogTitle>
              <DialogDescription>{systemName}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <InfoSection title={t('pocoInfo.location')}>
            <InfoRow
              label={t('pocoInfo.system')}
              value={systemName}
              className="text-status-info"
            />
            <InfoRow label={t('pocoInfo.region')} value={regionName} />
            <InfoRow label={t('pocoInfo.planet')} value={planetName} />
            <InfoRow label={t('pocoInfo.owner')} value={ownerName} />
          </InfoSection>

          <InfoSection title={t('pocoInfo.taxRates')}>
            <InfoRow
              label={t('pocoInfo.corporationTax')}
              value={formatTaxRate(customsOffice.corporation_tax_rate)}
            />
            {customsOffice.alliance_tax_rate !== undefined && (
              <InfoRow
                label={t('pocoInfo.allianceTax')}
                value={formatTaxRate(customsOffice.alliance_tax_rate)}
              />
            )}
          </InfoSection>

          {customsOffice.allow_access_with_standings && (
            <InfoSection title={t('pocoInfo.standingTaxes')}>
              {customsOffice.excellent_standing_tax_rate !== undefined && (
                <InfoRow
                  label={t('pocoInfo.excellentStanding')}
                  value={formatTaxRate(
                    customsOffice.excellent_standing_tax_rate
                  )}
                />
              )}
              {customsOffice.good_standing_tax_rate !== undefined && (
                <InfoRow
                  label={t('pocoInfo.goodStanding')}
                  value={formatTaxRate(customsOffice.good_standing_tax_rate)}
                />
              )}
              {customsOffice.neutral_standing_tax_rate !== undefined && (
                <InfoRow
                  label={t('pocoInfo.neutralStanding')}
                  value={formatTaxRate(customsOffice.neutral_standing_tax_rate)}
                />
              )}
              {customsOffice.bad_standing_tax_rate !== undefined && (
                <InfoRow
                  label={t('pocoInfo.badStanding')}
                  value={formatTaxRate(customsOffice.bad_standing_tax_rate)}
                />
              )}
              {customsOffice.terrible_standing_tax_rate !== undefined && (
                <InfoRow
                  label={t('pocoInfo.terribleStanding')}
                  value={formatTaxRate(
                    customsOffice.terrible_standing_tax_rate
                  )}
                />
              )}
            </InfoSection>
          )}

          <InfoSection title={t('pocoInfo.accessSettings')}>
            <InfoRow
              label={t('pocoInfo.allowAllianceAccess')}
              value={
                <BooleanBadge
                  value={customsOffice.allow_alliance_access}
                  yesLabel={yesLabel}
                  noLabel={noLabel}
                />
              }
            />
            <InfoRow
              label={t('pocoInfo.allowStandingsAccess')}
              value={
                <BooleanBadge
                  value={customsOffice.allow_access_with_standings}
                  yesLabel={yesLabel}
                  noLabel={noLabel}
                />
              }
            />
            {(() => {
              const standingKey =
                customsOffice.standing_level &&
                STANDING_LABEL_KEYS[customsOffice.standing_level]
              if (!standingKey) return null
              return (
                <InfoRow
                  label={t('pocoInfo.minimumStanding')}
                  value={t(standingKey)}
                />
              )
            })()}
          </InfoSection>

          <InfoSection title={t('pocoInfo.reinforcement')}>
            <InfoRow
              label={t('pocoInfo.reinforceWindow')}
              value={t('pocoInfo.windowFormat', {
                start: customsOffice.reinforce_exit_start,
                end: customsOffice.reinforce_exit_end,
              })}
            />
          </InfoSection>
        </div>
      </DialogContent>
    </Dialog>
  )
}
