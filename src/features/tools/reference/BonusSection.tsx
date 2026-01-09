import { useTranslation } from 'react-i18next'
import { getTypeName } from '@/store/reference-cache'
import { getLocalizedText, type LocalizedText } from '@/store/settings-store'
import { processEveLinks } from './eve-text-utils'
import { Section } from './Section'

interface Bonus {
  bonus?: number | null
  unitID?: number | null
  bonusText: LocalizedText
}

interface BonusType {
  _key: number
  _value: Bonus[]
}

interface BonusSectionProps {
  bonuses: {
    roleBonuses?: Bonus[]
    types?: BonusType[]
  }
  onNavigate?: (typeId: number) => void
}

function formatBonusValue(
  bonus: number | null | undefined,
  unitID?: number | null
): string {
  if (bonus == null) return ''
  if (unitID === 104) return `${bonus}x `
  if (unitID === 139) return `+${bonus} `
  return `+${bonus}% `
}

function BonusList({
  bonuses,
  onNavigate,
}: {
  bonuses: Bonus[]
  onNavigate?: (typeId: number) => void
}) {
  return (
    <ul className="list-inside list-disc space-y-1 text-sm text-content-secondary">
      {bonuses.map((bonus, i) => (
        <li key={i}>
          {bonus.bonus != null && bonus.bonus !== 0 && (
            <span className="font-semibold text-content">
              {formatBonusValue(bonus.bonus, bonus.unitID)}
            </span>
          )}
          {processEveLinks(getLocalizedText(bonus.bonusText), onNavigate)}
        </li>
      ))}
    </ul>
  )
}

export function BonusSection({ bonuses, onNavigate }: BonusSectionProps) {
  const { t } = useTranslation('tools')
  const hasRoleBonuses = bonuses.roleBonuses && bonuses.roleBonuses.length > 0
  const hasTypeBonuses = bonuses.types && bonuses.types.length > 0

  if (!hasRoleBonuses && !hasTypeBonuses) return null

  return (
    <Section title={t('reference.itemBonuses')}>
      {hasRoleBonuses && (
        <div className="mb-3">
          <div className="mb-1 text-sm font-medium text-content">
            {t('reference.roleBonuses')}
          </div>
          <BonusList bonuses={bonuses.roleBonuses!} onNavigate={onNavigate} />
        </div>
      )}
      {bonuses.types?.map((skillType) => (
        <div key={skillType._key} className="mb-3">
          <div className="mb-1 text-sm font-medium text-content">
            {t('reference.bonusesPerLevel', {
              skill: getTypeName(skillType._key),
            })}
          </div>
          <BonusList bonuses={skillType._value} onNavigate={onNavigate} />
        </div>
      ))}
    </Section>
  )
}
