import { useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { TypeIcon } from '@/components/ui/type-icon'
import { SkillLevelBars } from '@/features/tools/reference/SkillTreeComponents'
import { getType, getGroupsByCategory } from '@/store/cache/getters'
import { CategoryIds } from '@/store/cache/constants'
import { getLocale } from '@/lib/utils'
import type { CharacterSkillsData } from '@/store/skills-store'

interface SkillGroupData {
  id: number
  name: string
  skills: { id: number; name: string; level: number }[]
}

function buildCharacterSkillGroups(
  data: CharacterSkillsData,
  filter: string
): SkillGroupData[] {
  const filterLower = filter.toLowerCase()
  const groupMap = new Map<number, SkillGroupData>()

  const skillGroups = getGroupsByCategory(CategoryIds.SKILL, true)
  for (const group of skillGroups) {
    groupMap.set(group.id, { id: group.id, name: group.name, skills: [] })
  }

  for (const skill of data.skills.skills) {
    const typeInfo = getType(skill.skill_id)
    if (!typeInfo) continue

    if (filter && !typeInfo.name.toLowerCase().includes(filterLower)) {
      continue
    }

    const group = groupMap.get(typeInfo.groupId)
    if (group) {
      group.skills.push({
        id: skill.skill_id,
        name: typeInfo.name,
        level: skill.trained_skill_level,
      })
    }
  }

  const locale = getLocale()
  return Array.from(groupMap.values())
    .filter((g) => g.skills.length > 0)
    .map((g) => {
      g.skills.sort((a, b) => a.name.localeCompare(b.name, locale))
      return g
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale))
}

interface CharacterSkillsPanelProps {
  data: CharacterSkillsData
  filter: string
}

export function CharacterSkillsPanel({
  data,
  filter,
}: CharacterSkillsPanelProps) {
  const { t } = useTranslation('common')
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())

  const groups = useMemo(
    () => buildCharacterSkillGroups(data, filter),
    [data, filter]
  )

  const toggleGroup = useCallback((groupId: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }, [])

  if (groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-content-muted text-sm">
        {filter ? t('skills.noMatches') : t('skills.empty')}
      </div>
    )
  }

  return (
    <div className="space-y-1 p-2">
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.id) || !!filter
        const ChevronIcon = isExpanded ? ChevronDown : ChevronRight

        return (
          <div key={group.id}>
            <button
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center gap-2 rounded bg-surface-tertiary px-2 py-1.5 text-left hover:bg-surface-tertiary/70"
            >
              <ChevronIcon className="h-4 w-4 shrink-0 text-content-secondary" />
              <span className="flex-1 truncate text-sm font-medium">
                {group.name}
              </span>
              <span className="text-xs text-content-muted">
                {group.skills.length}
              </span>
            </button>

            {isExpanded && (
              <div className="mt-1 space-y-1 pl-4">
                {group.skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center gap-2 rounded bg-surface-tertiary/50 p-2"
                  >
                    <TypeIcon typeId={skill.id} size="sm" />
                    <span className="flex-1 truncate text-sm">
                      {skill.name}
                    </span>
                    <SkillLevelBars level={skill.level} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
