import { useTranslation } from 'react-i18next'
import { LazySection } from './LazySection'
import { SkillTreeNode } from './SkillTreeComponents'
import { getLanguage } from '@/store/settings-store'
import type { RefTypeSkillsResult } from '../../../../shared/electron-api-types'

interface RequiredSkillsSectionProps {
  typeId: number
}

async function fetchSkills(typeId: number): Promise<RefTypeSkillsResult> {
  if (!window.electronAPI) throw new Error('API not available')
  return window.electronAPI.refTypeSkills(typeId, { language: getLanguage() })
}

function hasSkillData(data: RefTypeSkillsResult): boolean {
  return (data.required?.length ?? 0) > 0
}

export function RequiredSkillsSection({ typeId }: RequiredSkillsSectionProps) {
  const { t } = useTranslation('tools')
  return (
    <LazySection
      title={t('reference.requiredSkills')}
      typeId={typeId}
      fetcher={fetchSkills}
      hasData={hasSkillData}
    >
      {(data) => (
        <div className="space-y-1">
          {data.required?.map((skill, idx) => (
            <SkillTreeNode key={`${skill.skillId}-${idx}`} node={skill} />
          ))}
        </div>
      )}
    </LazySection>
  )
}
