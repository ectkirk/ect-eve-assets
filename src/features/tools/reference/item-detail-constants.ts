export const SHIP_CATEGORY_ID = 6
export const STRUCTURE_CATEGORY_ID = 65

export const META_GROUPS: Record<number, { label: string; color: string }> = {
  1: { label: 'Tech I', color: 'bg-surface-tertiary text-content-secondary' },
  2: { label: 'Tech II', color: 'bg-category-amber/20 text-category-amber' },
  3: { label: 'Storyline', color: 'bg-category-cyan/20 text-category-cyan' },
  4: { label: 'Faction', color: 'bg-category-purple/20 text-category-purple' },
  5: { label: 'Officer', color: 'bg-category-pink/20 text-category-pink' },
  6: { label: 'Deadspace', color: 'bg-category-blue/20 text-category-blue' },
  14: { label: 'Tech III', color: 'bg-category-cyan/20 text-category-cyan' },
  15: { label: 'Abyssal', color: 'bg-category-red/20 text-category-red' },
  17: {
    label: 'Structure',
    color: 'bg-category-indigo/20 text-category-indigo',
  },
  19: {
    label: 'Special Edition',
    color: 'bg-category-orange/20 text-category-orange',
  },
  52: {
    label: 'Structure Rig',
    color: 'bg-category-indigo/20 text-category-indigo',
  },
  53: {
    label: 'Structure Rig',
    color: 'bg-category-indigo/20 text-category-indigo',
  },
  54: {
    label: 'Structure Module',
    color: 'bg-category-indigo/20 text-category-indigo',
  },
}

export const AU_IN_METERS = 149_597_870_700

export const ATTRIBUTE_CATEGORY_ORDER = [
  1, 2, 3, 4, 5, 6, 10, 12, 17, 19, 36, 40, 7, 0,
]

export const UNIT_ID_TYPE_REF = 116
