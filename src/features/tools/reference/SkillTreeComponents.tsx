import { TypeIcon } from '@/components/ui/type-icon'
export { Section } from './Section'

export type SkillNode = {
  skillId: number
  skillName: string
  level: number
  children: SkillNode[]
}

const SKILL_LEVEL_BOXES = [0, 1, 2, 3, 4] as const

function SkillLevelBars({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {SKILL_LEVEL_BOXES.map((i) => (
        <div
          key={i}
          className={`h-4 w-1.5 rounded-sm ${
            i < level ? 'bg-accent' : 'bg-surface-tertiary'
          }`}
        />
      ))}
    </div>
  )
}

export function SkillTreeNode({
  node,
  depth = 0,
}: {
  node: SkillNode
  depth?: number
}) {
  const hasChildren = node.children.length > 0

  return (
    <div className="space-y-1">
      <div
        className="flex items-center gap-3 rounded bg-surface-tertiary p-2"
        style={{ marginLeft: depth * 20 }}
      >
        <TypeIcon typeId={node.skillId} size="md" />
        <span className="flex-1 text-sm text-content">{node.skillName}</span>
        <SkillLevelBars level={node.level} />
      </div>
      {hasChildren &&
        node.children.map((child, idx) => (
          <SkillTreeNode
            key={`${child.skillId}-${idx}`}
            node={child}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}
