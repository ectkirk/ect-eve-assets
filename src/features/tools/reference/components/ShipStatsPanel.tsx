import { useMemo } from 'react'
import { formatNumber, formatDuration } from '@/lib/utils'
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
  const cpu = attrMap.get(SHIP_STAT_ATTRS.cpuOutput)
  const power = attrMap.get(SHIP_STAT_ATTRS.powerOutput)
  const calibration = attrMap.get(SHIP_STAT_ATTRS.calibration)

  if (!cpu && !power && !calibration) return null

  return (
    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
      {cpu !== undefined && (
        <div>
          <div className="text-content-secondary">CPU</div>
          <div className="font-mono text-content">{formatNumber(cpu)} tf</div>
        </div>
      )}
      {power !== undefined && (
        <div>
          <div className="text-content-secondary">Power</div>
          <div className="font-mono text-content">{formatNumber(power)} MW</div>
        </div>
      )}
      {calibration !== undefined && (
        <div>
          <div className="text-content-secondary">Calibration</div>
          <div className="font-mono text-content">{calibration}</div>
        </div>
      )}
    </div>
  )
}

export function ShipStatsPanel({ attrMap, hideFitting }: ShipStatsPanelProps) {
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
        <StatSection title="Fitting">
          <StatRow label="CPU Output" value={fitting.cpu} unit="tf" />
          <StatRow label="Power Grid" value={fitting.power} unit="MW" />
          <StatRow label="Calibration" value={fitting.calibration} />
        </StatSection>
      )}

      {capacitor && (
        <StatSection title="Capacitor">
          <StatRow label="Capacity" value={capacitor.capacity} unit="GJ" />
          {capacitor.rechargeMs && (
            <StatRow
              label="Recharge"
              value={formatDuration(Math.round(capacitor.rechargeMs / 1000))}
            />
          )}
        </StatSection>
      )}

      {offense && (
        <StatSection title="Offense">
          <StatRow label="Turret Hardpoints" value={offense.turrets} />
          <StatRow label="Launcher Hardpoints" value={offense.launchers} />
        </StatSection>
      )}

      {defenseStats && (
        <StatSection title="Defense">
          <DefenseStats stats={defenseStats} />
        </StatSection>
      )}

      {targeting && (
        <StatSection title="Targeting">
          {targeting.range && (
            <StatRow
              label="Max Range"
              value={`${formatNumber(targeting.range / 1000)} km`}
            />
          )}
          <StatRow label="Max Locked" value={targeting.locked} />
          <StatRow
            label="Scan Resolution"
            value={targeting.resolution}
            unit="mm"
          />
          {targeting.sensorType && targeting.sensorStrength && (
            <StatRow
              label={`${targeting.sensorType} Strength`}
              value={targeting.sensorStrength}
            />
          )}
          {targeting.signature && (
            <StatRow
              label="Signature"
              value={`${formatNumber(targeting.signature)} m`}
            />
          )}
        </StatSection>
      )}

      {navigation && (
        <StatSection title="Navigation">
          <StatRow
            label="Max Velocity"
            value={navigation.velocity}
            unit="m/s"
          />
          {navigation.agility && (
            <StatRow
              label="Inertia"
              value={navigation.agility.toLocaleString('en-US', {
                maximumFractionDigits: 3,
              })}
              unit="x"
            />
          )}
          {navigation.warpSpeed && (
            <StatRow
              label="Warp Speed"
              value={navigation.warpSpeed}
              unit="AU/s"
            />
          )}
        </StatSection>
      )}

      {drones && (
        <StatSection title="Drones">
          <StatRow label="Drone Bay" value={drones.capacity} unit="m³" />
          <StatRow label="Bandwidth" value={drones.bandwidth} unit="Mbit/s" />
        </StatSection>
      )}
    </div>
  )
}
