import { LazySection } from './LazySection'
import { SkillTreeNode } from './SkillTreeComponents'
import type { RefTypeSkillsResult } from '../../../../shared/electron-api-types'

interface RequiredSkillsSectionProps {
  typeId: number
}

async function fetchSkills(typeId: number): Promise<RefTypeSkillsResult> {
  if (!window.electronAPI) throw new Error('API not available')
  return window.electronAPI.refTypeSkills(typeId)
}

function hasSkillData(data: RefTypeSkillsResult): boolean {
  return (data.required?.length ?? 0) > 0
}

export function RequiredSkillsSection({ typeId }: RequiredSkillsSectionProps) {
  return (
    <LazySection
      title="Required Skills"
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
