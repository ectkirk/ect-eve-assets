import { type NotificationType, useNotificationStore } from '@/store/toast-store'
import type { ESICorporationStructure } from '@/store/structures-store'
import type { ESIStarbase } from '@/store/starbases-store'
import type { ESIStarbaseDetail } from '@/api/endpoints/starbases'
import { getTypeName } from '@/store/reference-cache'
import { calculateFuelHours } from '@/store/starbase-details-store'
import { logger } from '@/lib/logger'

interface StructureAlert {
  type: NotificationType
  title: string
  message: string
  eventKey: string
  entityId: number
}

let notifiedKeys: Set<string> | null = null

function getNotifiedKeys(): Set<string> {
  if (!notifiedKeys) {
    notifiedKeys = useNotificationStore.getState().getNotifiedKeys()
  }
  return notifiedKeys
}

const ARMOR_REINFORCED = 'armor_reinforce'
const HULL_REINFORCED = 'hull_reinforce'
const REINFORCED_STATES = new Set([ARMOR_REINFORCED, HULL_REINFORCED])

const ARMOR_VULNERABLE = 'armor_vulnerable'
const HULL_VULNERABLE = 'hull_vulnerable'
const VULNERABLE_STATES = new Set([ARMOR_VULNERABLE, HULL_VULNERABLE])
const LOW_FUEL_THRESHOLD_HOURS = 72

function createLowFuelAlert(
  fuelHours: number,
  name: string,
  title: string,
  entityId: number
): StructureAlert | null {
  if (fuelHours <= 0 || fuelHours >= LOW_FUEL_THRESHOLD_HOURS) return null
  const dayBucket = Math.floor(fuelHours / 24)
  const daysLeft = (fuelHours / 24).toFixed(1)
  return {
    type: 'structure-low-fuel',
    title,
    message: `${name} has ${daysLeft} days of fuel remaining`,
    eventKey: `low-fuel:${dayBucket}`,
    entityId,
  }
}

function hasBeenNotified(entityId: number, eventKey: string): boolean {
  return getNotifiedKeys().has(`${entityId}:${eventKey}`)
}

function markNotified(entityId: number, eventKey: string): void {
  getNotifiedKeys().add(`${entityId}:${eventKey}`)
}

function detectUpwellChanges(
  previous: ESICorporationStructure[],
  current: ESICorporationStructure[]
): StructureAlert[] {
  const alerts: StructureAlert[] = []
  const prevMap = new Map(previous.map((s) => [s.structure_id, s]))

  for (const structure of current) {
    const prev = prevMap.get(structure.structure_id)
    const name = structure.name ?? `Structure ${structure.structure_id}`

    if (prev && !REINFORCED_STATES.has(prev.state) && REINFORCED_STATES.has(structure.state)) {
      const eventKey = `reinforced:${structure.state_timer_end ?? 'unknown'}`
      const isArmor = structure.state === ARMOR_REINFORCED
      alerts.push({
        type: 'structure-reinforced',
        title: isArmor ? 'Armor Reinforced' : 'Structure Reinforced',
        message: `${name} entered ${isArmor ? 'armor' : 'hull'} reinforce`,
        eventKey,
        entityId: structure.structure_id,
      })
    }

    if (
      prev &&
      !VULNERABLE_STATES.has(prev.state) &&
      VULNERABLE_STATES.has(structure.state) &&
      structure.state_timer_end
    ) {
      const eventKey = `vulnerable:${structure.state_timer_end}`
      const isArmor = structure.state === ARMOR_VULNERABLE
      alerts.push({
        type: 'structure-vulnerable',
        title: isArmor ? 'Armor Vulnerable' : 'Structure Vulnerable',
        message: `${name} is now ${isArmor ? 'armor' : 'hull'} vulnerable`,
        eventKey,
        entityId: structure.structure_id,
      })
    }

    if (structure.fuel_expires) {
      const expiresAt = new Date(structure.fuel_expires).getTime()
      const remainingHours = (expiresAt - Date.now()) / (60 * 60 * 1000)
      const fuelAlert = createLowFuelAlert(remainingHours, name, 'Low Fuel Warning', structure.structure_id)
      if (fuelAlert) alerts.push(fuelAlert)
    }

    if (prev && prev.state !== 'anchoring' && structure.state === 'anchoring') {
      const eventKey = `anchoring:${structure.state_timer_end ?? 'start'}`
      alerts.push({
        type: 'structure-anchoring',
        title: 'Structure Anchoring',
        message: `${name} is anchoring`,
        eventKey,
        entityId: structure.structure_id,
      })
    }

    if (!prev?.unanchors_at && structure.unanchors_at) {
      const eventKey = `unanchoring:${structure.unanchors_at}`
      alerts.push({
        type: 'structure-anchoring',
        title: 'Structure Unanchoring',
        message: `${name} is unanchoring`,
        eventKey,
        entityId: structure.structure_id,
      })
    }

    if (prev?.services && structure.services) {
      const prevServices = new Map(prev.services.map((s) => [s.name, s.state]))
      for (const service of structure.services) {
        if (prevServices.get(service.name) === 'online' && service.state === 'offline') {
          const eventKey = `service-offline:${service.name}`
          alerts.push({
            type: 'structure-service-offline',
            title: 'Service Offline',
            message: `${service.name} went offline on ${name}`,
            eventKey,
            entityId: structure.structure_id,
          })
        }
      }
    }
  }

  return alerts
}

interface StarbaseMetadata {
  towerSize: number
  fuelTier: number
}

function detectStarbaseChanges(
  previous: ESIStarbase[],
  current: ESIStarbase[],
  details: Map<number, ESIStarbaseDetail>,
  metadata: Map<number, StarbaseMetadata>
): StructureAlert[] {
  const alerts: StructureAlert[] = []
  const prevMap = new Map(previous.map((s) => [s.starbase_id, s]))

  for (const starbase of current) {
    const prev = prevMap.get(starbase.starbase_id)
    const typeName = getTypeName(starbase.type_id)

    if (prev?.state !== 'reinforced' && starbase.state === 'reinforced') {
      const eventKey = `reinforced:${starbase.reinforced_until ?? 'unknown'}`
      alerts.push({
        type: 'structure-reinforced',
        title: 'POS Reinforced',
        message: `${typeName} entered reinforced mode`,
        eventKey,
        entityId: starbase.starbase_id,
      })
    }

    if (prev?.state !== 'onlining' && starbase.state === 'onlining') {
      const eventKey = `onlining:${starbase.onlined_since ?? 'start'}`
      alerts.push({
        type: 'structure-anchoring',
        title: 'POS Onlining',
        message: `${typeName} is coming online`,
        eventKey,
        entityId: starbase.starbase_id,
      })
    }

    if (prev?.state !== 'unanchoring' && starbase.state === 'unanchoring') {
      const eventKey = `unanchoring:${starbase.unanchor_at ?? 'start'}`
      alerts.push({
        type: 'structure-anchoring',
        title: 'POS Unanchoring',
        message: `${typeName} is unanchoring`,
        eventKey,
        entityId: starbase.starbase_id,
      })
    }

    const detail = details.get(starbase.starbase_id)
    const meta = metadata.get(starbase.starbase_id)
    if (detail && meta) {
      const fuelHours = calculateFuelHours(detail, meta.towerSize, meta.fuelTier)
      if (fuelHours !== null) {
        const fuelAlert = createLowFuelAlert(fuelHours, typeName, 'POS Low Fuel', starbase.starbase_id)
        if (fuelAlert) alerts.push(fuelAlert)
      }
    }
  }

  return alerts
}

export function processUpwellNotifications(
  previous: ESICorporationStructure[],
  current: ESICorporationStructure[]
): void {
  if (!previous.length) return

  const alerts = detectUpwellChanges(previous, current)
  const store = useNotificationStore.getState()

  for (const alert of alerts) {
    if (hasBeenNotified(alert.entityId, alert.eventKey)) continue

    store.addNotification(alert.type, alert.title, alert.message, alert.entityId, alert.eventKey)
    markNotified(alert.entityId, alert.eventKey)

    logger.info('Structure notification sent', {
      module: 'StructureNotifications',
      type: alert.type,
      title: alert.title,
    })
  }
}

export function processStarbaseNotifications(
  previous: ESIStarbase[],
  current: ESIStarbase[],
  details: Map<number, ESIStarbaseDetail>,
  metadata: Map<number, StarbaseMetadata>
): void {
  if (!previous.length) return

  const alerts = detectStarbaseChanges(previous, current, details, metadata)
  const store = useNotificationStore.getState()

  for (const alert of alerts) {
    if (hasBeenNotified(alert.entityId, alert.eventKey)) continue

    store.addNotification(alert.type, alert.title, alert.message, alert.entityId, alert.eventKey)
    markNotified(alert.entityId, alert.eventKey)

    logger.info('Starbase notification sent', {
      module: 'StructureNotifications',
      type: alert.type,
      title: alert.title,
    })
  }
}
