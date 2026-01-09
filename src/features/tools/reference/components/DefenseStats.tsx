import { useTranslation } from 'react-i18next'
import { formatNumber, formatDuration, formatPercent } from '@/lib/utils'

export const DAMAGE_COLORS = {
  em: { label: 'text-blue-400', bar: 'bg-blue-500' },
  thermal: { label: 'text-red-400', bar: 'bg-red-500' },
  kinetic: { label: 'text-gray-400', bar: 'bg-gray-300' },
  explosive: { label: 'text-orange-400', bar: 'bg-orange-500' },
} as const

export const RESISTANCE_ATTR_IDS = {
  shield: { em: 271, thermal: 274, kinetic: 273, explosive: 272 },
  armor: { em: 267, thermal: 270, kinetic: 269, explosive: 268 },
  hull: { em: 113, thermal: 110, kinetic: 109, explosive: 111 },
}

export const HP_ATTR_IDS = { shield: 263, armor: 265, hull: 9 }
export const SHIELD_RECHARGE_ATTR_ID = 479

function ResistanceBar({
  label,
  resonance,
  type,
}: {
  label: string
  resonance: number
  type: 'em' | 'thermal' | 'kinetic' | 'explosive'
}) {
  const { t } = useTranslation('tools')
  const resistance = (1 - resonance) * 100
  const colors = DAMAGE_COLORS[type]

  const damageTypeLabels: Record<string, string> = {
    em: t('reference.em'),
    thermal: t('reference.thermal'),
    kinetic: t('reference.kinetic'),
    explosive: t('reference.explosive'),
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className={`${colors.label} font-medium`}>
          {damageTypeLabels[type] || label}
        </span>
        <span className="font-mono text-content">
          {formatPercent(resistance)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-tertiary">
        <div
          className={`h-full ${colors.bar} transition-all`}
          style={{ width: `${resistance}%` }}
        />
      </div>
    </div>
  )
}

export interface DefenseLayerProps {
  title: string
  hp?: number
  rechargeMs?: number
  resistances: {
    em?: number
    thermal?: number
    kinetic?: number
    explosive?: number
  }
}

export function DefenseLayer({
  title,
  hp,
  rechargeMs,
  resistances,
}: DefenseLayerProps) {
  const { t } = useTranslation('tools')
  const validResistances = Object.values(resistances).filter(
    (v): v is number => v !== undefined
  )
  if (!validResistances.length) return null

  const avgResonance =
    validResistances.reduce((sum, v) => sum + v, 0) / validResistances.length
  const ehp = hp && avgResonance > 0 ? hp / avgResonance : undefined

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-medium text-content">{title}</h4>
        <div className="flex gap-4 text-xs">
          {hp !== undefined && hp > 0 && (
            <span>
              <span className="text-content-secondary">
                {t('reference.hp')}:{' '}
              </span>
              <span className="font-mono text-content">{formatNumber(hp)}</span>
            </span>
          )}
          {rechargeMs !== undefined && rechargeMs > 0 && (
            <span>
              <span className="text-content-secondary">
                {t('reference.recharge')}:{' '}
              </span>
              <span className="font-mono text-content">
                {formatDuration(Math.round(rechargeMs / 1000))}
              </span>
            </span>
          )}
          {ehp !== undefined && (
            <span>
              <span className="text-content-secondary">
                {t('reference.ehp')}:{' '}
              </span>
              <span className="font-mono text-content">
                {formatNumber(Math.round(ehp))}
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {resistances.em !== undefined && (
          <ResistanceBar label="EM" resonance={resistances.em} type="em" />
        )}
        {resistances.thermal !== undefined && (
          <ResistanceBar
            label="Thermal"
            resonance={resistances.thermal}
            type="thermal"
          />
        )}
        {resistances.kinetic !== undefined && (
          <ResistanceBar
            label="Kinetic"
            resonance={resistances.kinetic}
            type="kinetic"
          />
        )}
        {resistances.explosive !== undefined && (
          <ResistanceBar
            label="Explosive"
            resonance={resistances.explosive}
            type="explosive"
          />
        )}
      </div>
    </div>
  )
}

export interface DefenseStatsData {
  shield: {
    hp?: number
    rechargeMs?: number
    resistances: {
      em?: number
      thermal?: number
      kinetic?: number
      explosive?: number
    }
  } | null
  armor: {
    hp?: number
    resistances: {
      em?: number
      thermal?: number
      kinetic?: number
      explosive?: number
    }
  } | null
  hull: {
    hp?: number
    resistances: {
      em?: number
      thermal?: number
      kinetic?: number
      explosive?: number
    }
  } | null
}

export function extractDefenseStats(
  attrMap: Map<number, number>
): DefenseStatsData | null {
  const shieldRes = {
    em: attrMap.get(RESISTANCE_ATTR_IDS.shield.em),
    thermal: attrMap.get(RESISTANCE_ATTR_IDS.shield.thermal),
    kinetic: attrMap.get(RESISTANCE_ATTR_IDS.shield.kinetic),
    explosive: attrMap.get(RESISTANCE_ATTR_IDS.shield.explosive),
  }
  const armorRes = {
    em: attrMap.get(RESISTANCE_ATTR_IDS.armor.em),
    thermal: attrMap.get(RESISTANCE_ATTR_IDS.armor.thermal),
    kinetic: attrMap.get(RESISTANCE_ATTR_IDS.armor.kinetic),
    explosive: attrMap.get(RESISTANCE_ATTR_IDS.armor.explosive),
  }
  const hullRes = {
    em: attrMap.get(RESISTANCE_ATTR_IDS.hull.em),
    thermal: attrMap.get(RESISTANCE_ATTR_IDS.hull.thermal),
    kinetic: attrMap.get(RESISTANCE_ATTR_IDS.hull.kinetic),
    explosive: attrMap.get(RESISTANCE_ATTR_IDS.hull.explosive),
  }

  const hasShield = Object.values(shieldRes).some((v) => v !== undefined)
  const hasArmor = Object.values(armorRes).some((v) => v !== undefined)
  const hasHull = Object.values(hullRes).some((v) => v !== undefined)

  if (!hasShield && !hasArmor && !hasHull) return null

  return {
    shield: hasShield
      ? {
          hp: attrMap.get(HP_ATTR_IDS.shield),
          rechargeMs: attrMap.get(SHIELD_RECHARGE_ATTR_ID),
          resistances: shieldRes,
        }
      : null,
    armor: hasArmor
      ? { hp: attrMap.get(HP_ATTR_IDS.armor), resistances: armorRes }
      : null,
    hull: hasHull
      ? { hp: attrMap.get(HP_ATTR_IDS.hull), resistances: hullRes }
      : null,
  }
}

export function DefenseStats({ stats }: { stats: DefenseStatsData }) {
  const { t } = useTranslation('tools')
  return (
    <div className="space-y-4">
      {stats.shield && (
        <DefenseLayer
          title={t('reference.shield')}
          hp={stats.shield.hp}
          rechargeMs={stats.shield.rechargeMs}
          resistances={stats.shield.resistances}
        />
      )}
      {stats.armor && (
        <DefenseLayer
          title={t('reference.armor')}
          hp={stats.armor.hp}
          resistances={stats.armor.resistances}
        />
      )}
      {stats.hull && (
        <DefenseLayer
          title={t('reference.structure')}
          hp={stats.hull.hp}
          resistances={stats.hull.resistances}
        />
      )}
    </div>
  )
}
