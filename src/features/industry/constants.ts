export const SECURITY_STATUS = [
  { id: 'h', name: 'Highsec' },
  { id: 'l', name: 'Lowsec' },
  { id: 'n', name: 'Nullsec/WH' },
] as const

export const RESEARCH_FACILITIES = [
  { id: 0, name: 'NPC Station' },
  { id: 1, name: 'Raitaru' },
  { id: 2, name: 'Azbel' },
  { id: 3, name: 'Sotiyo' },
  { id: 4, name: 'Other Structures' },
] as const

export const ME_RIGS = [
  { id: 0, name: 'None' },
  { id: 1, name: 'T1 Material Rig' },
  { id: 2, name: 'T2 Material Rig' },
] as const

export const RIGS = [
  { id: 0, name: 'None' },
  { id: 1, name: 'T1 Rig' },
  { id: 2, name: 'T2 Rig' },
] as const

export const IMPLANTS = [
  { id: 1.0, name: 'None' },
  { id: 0.99, name: '1% (BX-801)' },
  { id: 0.97, name: '3% (BX-802)' },
  { id: 0.95, name: '5% (BX-804)' },
] as const
