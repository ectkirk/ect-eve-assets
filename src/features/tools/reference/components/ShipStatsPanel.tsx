import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatNumber, formatDuration, getLocale } from '@/lib/utils'
import { DefenseStats, extractDefenseStats } from './DefenseStats'
import { SHIP_STAT_ATTRS } from './ship-stat-utils'

interface ShipStatsPanelProps {
  attrMap: Map<number, number>
  hideFitting?: boolean
}

function StatRow({
  label,
  value,
  unit,
}: {
  label: string
  value: string | number | undefined
  unit?: string
}) {
  if (value === undefined || value === null) return null
  return (
    <div className="flex justify-between gap-2">
      <span className="text-content-secondary">{label}</span>
      <span className="font-mono text-content">
        {typeof value === 'number' ? formatNumber(value) : value}
        {unit && ` ${unit}`}
      </span>
    </div>
  )
}

function StatSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded border border-border bg-surface-secondary p-3">
      <h4 className="mb-2 text-sm font-semibold text-content">{title}</h4>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  )
}

export function FittingStats({ attrMap }: { attrMap: Map<number, number> }) {
  const { t } = useTranslation('tools')
  const cpu = attrMap.get(SHIP_STAT_ATTRS.cpuOutput)
  const power = attrMap.get(SHIP_STAT_ATTRS.powerOutput)
  const calibration = attrMap.get(SHIP_STAT_ATTRS.calibration)

  if (!cpu && !power && !calibration) return null

  return (
    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
      {cpu !== undefined && (
        <div>
          <div className="text-content-secondary">{t('reference.cpu')}</div>
          <div className="font-mono text-content">{formatNumber(cpu)} tf</div>
        </div>
      )}
      {power !== undefined && (
        <div>
          <div className="text-content-secondary">{t('reference.power')}</div>
          <div className="font-mono text-content">{formatNumber(power)} MW</div>
        </div>
      )}
      {calibration !== undefined && (
        <div>
          <div className="text-content-secondary">
            {t('reference.calibration')}
          </div>
          <div className="font-mono text-content">{calibration}</div>
        </div>
      )}
    </div>
  )
}

export function ShipStatsPanel({ attrMap, hideFitting }: ShipStatsPanelProps) {
  const { t } = useTranslation('tools')
  const fitting = useMemo(() => {
    const cpu = attrMap.get(SHIP_STAT_ATTRS.cpuOutput)
    const power = attrMap.get(SHIP_STAT_ATTRS.powerOutput)
    const calibration = attrMap.get(SHIP_STAT_ATTRS.calibration)
    if (!cpu && !power && !calibration) return null
    return { cpu, power, calibration }
  }, [attrMap])

  const capacitor = useMemo(() => {
    const capacity = attrMap.get(SHIP_STAT_ATTRS.capacitorCapacity)
    const rechargeMs = attrMap.get(SHIP_STAT_ATTRS.capacitorRechargeTime)
    if (!capacity && !rechargeMs) return null
    return { capacity, rechargeMs }
  }, [attrMap])

  const targeting = useMemo(() => {
    const range = attrMap.get(SHIP_STAT_ATTRS.maxTargetRange)
    const locked = attrMap.get(SHIP_STAT_ATTRS.maxLockedTargets)
    const resolution = attrMap.get(SHIP_STAT_ATTRS.scanResolution)
    const signature = attrMap.get(SHIP_STAT_ATTRS.signatureRadius)
    const radar = attrMap.get(SHIP_STAT_ATTRS.scanRadarStrength)
    const ladar = attrMap.get(SHIP_STAT_ATTRS.scanLadarStrength)
    const magnetometric = attrMap.get(SHIP_STAT_ATTRS.scanMagnetometricStrength)
    const gravimetric = attrMap.get(SHIP_STAT_ATTRS.scanGravimetricStrength)

    let sensorType: string | null = null
    let sensorStrength: number | undefined
    if (radar && radar > 0) {
      sensorType = 'Radar'
      sensorStrength = radar
    } else if (ladar && ladar > 0) {
      sensorType = 'Ladar'
      sensorStrength = ladar
    } else if (magnetometric && magnetometric > 0) {
      sensorType = 'Magnetometric'
      sensorStrength = magnetometric
    } else if (gravimetric && gravimetric > 0) {
      sensorType = 'Gravimetric'
      sensorStrength = gravimetric
    }

    if (!range && !locked && !resolution && !signature && !sensorStrength)
      return null
    return { range, locked, resolution, signature, sensorType, sensorStrength }
  }, [attrMap])

  const navigation = useMemo(() => {
    const velocity = attrMap.get(SHIP_STAT_ATTRS.maxVelocity)
    const agility = attrMap.get(SHIP_STAT_ATTRS.agility)
    const warpSpeed = attrMap.get(SHIP_STAT_ATTRS.warpSpeed)
    if (!velocity && !agility && !warpSpeed) return null
    return { velocity, agility, warpSpeed }
  }, [attrMap])

  const drones = useMemo(() => {
    const capacity = attrMap.get(SHIP_STAT_ATTRS.droneCapacity) ?? 0
    const bandwidth = attrMap.get(SHIP_STAT_ATTRS.droneBandwidth) ?? 0
    if (!capacity && !bandwidth) return null
    return { capacity, bandwidth }
  }, [attrMap])

  const offense = useMemo(() => {
    const turrets = attrMap.get(SHIP_STAT_ATTRS.turretHardpoints)
    const launchers = attrMap.get(SHIP_STAT_ATTRS.launcherHardpoints)
    if (!turrets && !launchers) return null
    return { turrets, launchers }
  }, [attrMap])

  const defenseStats = useMemo(() => extractDefenseStats(attrMap), [attrMap])

  return (
    <div className="flex flex-col gap-3">
      {fitting && !hideFitting && (
        <StatSection title={t('reference.fitting')}>
          <StatRow
            label={t('reference.cpuOutput')}
            value={fitting.cpu}
            unit="tf"
          />
          <StatRow
            label={t('reference.powerGrid')}
            value={fitting.power}
            unit="MW"
          />
          <StatRow
            label={t('reference.calibration')}
            value={fitting.calibration}
          />
        </StatSection>
      )}

      {capacitor && (
        <StatSection title={t('reference.capacitor')}>
          <StatRow
            label={t('reference.capacity')}
            value={capacitor.capacity}
            unit="GJ"
          />
          {capacitor.rechargeMs && (
            <StatRow
              label={t('reference.recharge')}
              value={formatDuration(Math.round(capacitor.rechargeMs / 1000))}
            />
          )}
        </StatSection>
      )}

      {offense && (
        <StatSection title={t('reference.offense')}>
          <StatRow
            label={t('reference.turretHardpoints')}
            value={offense.turrets}
          />
          <StatRow
            label={t('reference.launcherHardpoints')}
            value={offense.launchers}
          />
        </StatSection>
      )}

      {defenseStats && (
        <StatSection title={t('reference.defense')}>
          <DefenseStats stats={defenseStats} />
        </StatSection>
      )}

      {targeting && (
        <StatSection title={t('reference.targeting')}>
          {targeting.range && (
            <StatRow
              label={t('reference.maxRange')}
              value={`${formatNumber(targeting.range / 1000)} km`}
            />
          )}
          <StatRow label={t('reference.maxLocked')} value={targeting.locked} />
          <StatRow
            label={t('reference.scanResolution')}
            value={targeting.resolution}
            unit="mm"
          />
          {targeting.sensorType && targeting.sensorStrength && (
            <StatRow
              label={t('reference.sensorStrength', {
                type: targeting.sensorType,
              })}
              value={targeting.sensorStrength}
            />
          )}
          {targeting.signature && (
            <StatRow
              label={t('reference.signature')}
              value={`${formatNumber(targeting.signature)} m`}
            />
          )}
        </StatSection>
      )}

      {navigation && (
        <StatSection title={t('reference.navigation')}>
          <StatRow
            label={t('reference.maxVelocity')}
            value={navigation.velocity}
            unit="m/s"
          />
          {navigation.agility && (
            <StatRow
              label={t('reference.inertia')}
              value={navigation.agility.toLocaleString(getLocale(), {
                maximumFractionDigits: 3,
              })}
              unit="x"
            />
          )}
          {navigation.warpSpeed && (
            <StatRow
              label={t('reference.warpSpeed')}
              value={navigation.warpSpeed}
              unit="AU/s"
            />
          )}
        </StatSection>
      )}

      {drones && (
        <StatSection title={t('reference.drones')}>
          <StatRow
            label={t('reference.droneBay')}
            value={drones.capacity}
            unit="m³"
          />
          <StatRow
            label={t('reference.bandwidth')}
            value={drones.bandwidth}
            unit="Mbit/s"
          />
        </StatSection>
      )}
    </div>
  )
}
