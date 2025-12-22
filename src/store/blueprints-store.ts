import { type Owner } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESIBlueprintSchema } from '@/api/schemas'
import { z } from 'zod'

export type ESIBlueprint = z.infer<typeof ESIBlueprintSchema>

export interface OwnerBlueprints {
  owner: Owner
  blueprints: ESIBlueprint[]
}

export interface BlueprintInfo {
  materialEfficiency: number
  timeEfficiency: number
  runs: number
  isCopy: boolean
}

interface BlueprintsExtraState {
  blueprintsByItemId: Map<number, BlueprintInfo>
}

function buildBlueprintMap(
  blueprintsByOwner: OwnerBlueprints[]
): Map<number, BlueprintInfo> {
  const map = new Map<number, BlueprintInfo>()
  for (const { blueprints } of blueprintsByOwner) {
    for (const bp of blueprints) {
      map.set(bp.item_id, {
        materialEfficiency: bp.material_efficiency,
        timeEfficiency: bp.time_efficiency,
        runs: bp.runs,
        isCopy: bp.quantity === -2,
      })
    }
  }
  return map
}

export const useBlueprintsStore = createOwnerStore<
  ESIBlueprint[],
  OwnerBlueprints,
  BlueprintsExtraState
>({
  name: 'blueprints',
  moduleName: 'BlueprintsStore',
  endpointPattern: '/blueprints/',
  dbConfig: {
    dbName: 'ecteveassets-blueprints',
    storeName: 'blueprints',
    dataKey: 'blueprints',
    metaStoreName: 'meta',
  },
  getEndpoint: (owner) =>
    owner.type === 'corporation'
      ? `/corporations/${owner.id}/blueprints/`
      : `/characters/${owner.id}/blueprints/`,
  fetchData: async (owner) => {
    const endpoint =
      owner.type === 'corporation'
        ? `/corporations/${owner.id}/blueprints/`
        : `/characters/${owner.id}/blueprints/`
    const result = await esi.fetchPaginatedWithMeta<ESIBlueprint>(endpoint, {
      characterId: owner.characterId,
      schema: ESIBlueprintSchema,
    })
    return { data: result.data, expiresAt: result.expiresAt, etag: result.etag }
  },
  toOwnerData: (owner, data) => ({ owner, blueprints: data }),
  extraState: { blueprintsByItemId: new Map() },
  rebuildExtraState: (dataByOwner) => ({
    blueprintsByItemId: buildBlueprintMap(dataByOwner),
  }),
})

export function getBlueprintInfo(itemId: number): BlueprintInfo | undefined {
  return useBlueprintsStore.getState().blueprintsByItemId.get(itemId)
}

export function formatBlueprintName(baseName: string, itemId: number): string {
  const info = getBlueprintInfo(itemId)
  if (!info) return baseName

  if (info.isCopy) {
    return `${baseName} (ME${info.materialEfficiency} TE${info.timeEfficiency} R${info.runs})`
  }
  return `${baseName} (ME${info.materialEfficiency} TE${info.timeEfficiency})`
}
