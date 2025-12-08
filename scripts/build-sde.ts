import * as fs from 'fs'
import * as readline from 'readline'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SDE_PATH = path.resolve(__dirname, '../../eve-data')
const OUTPUT_PATH = path.resolve(__dirname, '../public/sde')

interface RawType {
  _key: number
  groupID: number
  name: { en: string }
  volume?: number
  packagedVolume?: number
  mass?: number
  marketGroupID?: number
  published?: boolean
}

interface RawGroup {
  _key: number
  categoryID: number
}

interface RawStation {
  _key: number
  solarSystemID: number
  typeID: number
  ownerID: number
  operationID?: number
  useOperationName?: boolean
  orbitID?: number
  celestialIndex?: number
  orbitIndex?: number
}

interface RawSolarSystem {
  _key: number
  name: { en: string }
  constellationID: number
  regionID: number
  securityStatus: number
}

interface RawRegion {
  _key: number
  name: { en: string }
}

interface RawCorporation {
  _key: number
  name: { en: string }
}

interface RawStationOperation {
  _key: number
  operationName?: { en: string }
}

async function readJsonl<T>(filename: string): Promise<T[]> {
  const filepath = path.join(SDE_PATH, filename)
  const items: T[] = []

  const fileStream = fs.createReadStream(filepath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })

  for await (const line of rl) {
    if (line.trim()) {
      items.push(JSON.parse(line) as T)
    }
  }

  return items
}

async function buildTypes(): Promise<void> {
  console.log('Building types...')

  const groups = await readJsonl<RawGroup>('groups.jsonl')
  const groupToCategory = new Map<number, number>()
  for (const group of groups) {
    groupToCategory.set(group._key, group.categoryID)
  }

  const rawTypes = await readJsonl<RawType>('types.jsonl')
  const types = rawTypes
    .filter(t => t.published !== false && t.name?.en)
    .map(t => ({
      typeId: t._key,
      name: t.name.en,
      groupId: t.groupID,
      categoryId: groupToCategory.get(t.groupID) ?? 0,
      volume: t.volume ?? 0,
      packagedVolume: t.packagedVolume,
      marketGroupId: t.marketGroupID,
      published: t.published ?? true
    }))

  fs.writeFileSync(
    path.join(OUTPUT_PATH, 'types.json'),
    JSON.stringify(types)
  )
  console.log(`  Wrote ${types.length} types`)
}

async function buildStations(): Promise<void> {
  console.log('Building stations...')

  const corps = await readJsonl<RawCorporation>('npcCorporations.jsonl')
  const corpNames = new Map<number, string>()
  for (const corp of corps) {
    corpNames.set(corp._key, corp.name?.en ?? `Corp ${corp._key}`)
  }

  const operations = await readJsonl<RawStationOperation>('stationOperations.jsonl')
  const operationNames = new Map<number, string>()
  for (const op of operations) {
    operationNames.set(op._key, op.operationName?.en ?? '')
  }

  const systems = await readJsonl<RawSolarSystem>('mapSolarSystems.jsonl')
  const systemNames = new Map<number, string>()
  const systemRegions = new Map<number, number>()
  for (const sys of systems) {
    systemNames.set(sys._key, sys.name?.en ?? `System ${sys._key}`)
    systemRegions.set(sys._key, sys.regionID)
  }

  const rawStations = await readJsonl<RawStation>('npcStations.jsonl')
  const stations = rawStations.map(s => {
    const systemName = systemNames.get(s.solarSystemID) ?? 'Unknown'
    const corpName = corpNames.get(s.ownerID) ?? 'Unknown'
    const opName = s.operationID ? operationNames.get(s.operationID) : undefined

    let orbitName = systemName
    if (s.celestialIndex !== undefined) {
      const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
        'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']
      orbitName = `${systemName} ${romanNumerals[s.celestialIndex] ?? s.celestialIndex}`
      if (s.orbitIndex !== undefined) {
        orbitName += ` - Moon ${s.orbitIndex}`
      }
    }

    let name: string
    if (s.useOperationName && opName) {
      name = `${orbitName} - ${corpName} ${opName}`
    } else {
      name = `${orbitName} - ${corpName}`
    }

    return {
      stationId: s._key,
      name,
      solarSystemId: s.solarSystemID,
      regionId: systemRegions.get(s.solarSystemID) ?? 0,
      typeId: s.typeID
    }
  })

  fs.writeFileSync(
    path.join(OUTPUT_PATH, 'stations.json'),
    JSON.stringify(stations)
  )
  console.log(`  Wrote ${stations.length} stations`)
}

async function buildSolarSystems(): Promise<void> {
  console.log('Building solar systems...')

  const rawSystems = await readJsonl<RawSolarSystem>('mapSolarSystems.jsonl')
  const systems = rawSystems
    .filter(s => s.name?.en)
    .map(s => ({
      solarSystemId: s._key,
      name: s.name.en,
      constellationId: s.constellationID,
      regionId: s.regionID,
      security: Math.round(s.securityStatus * 10) / 10
    }))

  fs.writeFileSync(
    path.join(OUTPUT_PATH, 'solarSystems.json'),
    JSON.stringify(systems)
  )
  console.log(`  Wrote ${systems.length} solar systems`)
}

async function buildRegions(): Promise<void> {
  console.log('Building regions...')

  const rawRegions = await readJsonl<RawRegion>('mapRegions.jsonl')
  const regions = rawRegions
    .filter(r => r.name?.en)
    .map(r => ({
      regionId: r._key,
      name: r.name.en
    }))

  fs.writeFileSync(
    path.join(OUTPUT_PATH, 'regions.json'),
    JSON.stringify(regions)
  )
  console.log(`  Wrote ${regions.length} regions`)
}

async function main(): Promise<void> {
  console.log('Building SDE data...')
  console.log(`Source: ${SDE_PATH}`)
  console.log(`Output: ${OUTPUT_PATH}`)

  if (!fs.existsSync(SDE_PATH)) {
    console.error(`SDE path not found: ${SDE_PATH}`)
    process.exit(1)
  }

  if (!fs.existsSync(OUTPUT_PATH)) {
    fs.mkdirSync(OUTPUT_PATH, { recursive: true })
  }

  await buildTypes()
  await buildStations()
  await buildSolarSystems()
  await buildRegions()

  console.log('Done!')
}

main().catch(console.error)
