import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check } from 'lucide-react'
import { logger } from '@/lib/logger'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FittingWheel } from '@/components/FittingWheel'
import type { TreeNode } from '@/lib/tree-types'
import {
  extractFitting,
  getShipSlots,
  isStrategicCruiser,
  countFilledSlots,
  HOLD_LABEL_KEYS,
  type ShipSlots,
  type ExtractedFitting,
  type ModuleItem,
  type ShipHolds,
} from '@/lib/fitting-utils'

interface FittingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shipNode: TreeNode | null
}

function ModuleList({
  title,
  modules,
}: {
  title: string
  modules: { type_id: number; type_name: string; quantity: number }[]
}) {
  const filtered = modules.filter((m) => m.type_id > 0)
  if (filtered.length === 0) return null

  return (
    <div>
      <h4 className="text-sm font-medium text-content-secondary mb-1">
        {title}
      </h4>
      <ul className="text-sm text-content-secondary space-y-0.5">
        {filtered.map((m, i) => (
          <li key={i}>
            {m.quantity > 1 ? `${m.quantity}x ` : ''}
            {m.type_name}
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatModulesForEFT(modules: ModuleItem[]): string {
  return modules
    .filter((m) => m.type_id > 0)
    .map((m) => m.type_name)
    .join('\n')
}

function formatItemsForEFT(items: ModuleItem[]): string {
  return items
    .filter((m) => m.type_id > 0)
    .map((m) => `${m.type_name} x${m.quantity}`)
    .join('\n')
}

function generateEFTFitting(fitting: ExtractedFitting): string {
  const sections: string[] = []

  sections.push(`[${fitting.shipTypeName}, ${fitting.shipName}]`)
  sections.push('')

  const low = formatModulesForEFT(fitting.lowSlotModules)
  if (low) sections.push(low)
  sections.push('')

  const mid = formatModulesForEFT(fitting.midSlotModules)
  if (mid) sections.push(mid)
  sections.push('')

  const high = formatModulesForEFT(fitting.highSlotModules)
  if (high) sections.push(high)
  sections.push('')

  const rigs = formatModulesForEFT(fitting.rigModules)
  if (rigs) sections.push(rigs)
  sections.push('')

  const subs = formatModulesForEFT(fitting.subsystemModules)
  if (subs) {
    sections.push(subs)
    sections.push('')
  }

  const drones = formatItemsForEFT(fitting.drones)
  if (drones) {
    sections.push(drones)
    sections.push('')
  }

  const fighters = formatItemsForEFT(fitting.fighterTubes)
  if (fighters) {
    sections.push(fighters)
    sections.push('')
  }

  const fighterBay = formatItemsForEFT(fitting.fighterBay)
  if (fighterBay) {
    sections.push(fighterBay)
    sections.push('')
  }

  const allHolds = Object.values(fitting.holds).flat()
  const holds = formatItemsForEFT(allHolds)
  if (holds) sections.push(holds)

  return sections.join('\n').trim()
}

export function FittingDialog({
  open,
  onOpenChange,
  shipNode,
}: FittingDialogProps) {
  const { t } = useTranslation('dialogs')
  const [copied, setCopied] = useState(false)

  const fitting = useMemo(() => {
    if (!open || !shipNode) return null
    return extractFitting(shipNode)
  }, [open, shipNode])

  const slots = useMemo(
    () => (fitting ? getShipSlots(fitting.shipTypeId) : null),
    [fitting]
  )

  const copyFitting = useCallback(async () => {
    if (!fitting) return
    try {
      const eft = generateEFTFitting(fitting)
      await navigator.clipboard.writeText(eft)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      logger.warn('Failed to copy fitting to clipboard', {
        module: 'Fitting',
        error,
      })
    }
  }, [fitting])

  if (!fitting) return null

  const isT3C = isStrategicCruiser(fitting.shipGroupId)

  const countedSlots: ShipSlots = {
    high: countFilledSlots(fitting.highSlotModules),
    mid: countFilledSlots(fitting.midSlotModules),
    low: countFilledSlots(fitting.lowSlotModules),
    rig: countFilledSlots(fitting.rigModules),
    subsystem: Math.min(4, countFilledSlots(fitting.subsystemModules)),
    launcher: 0,
    turret: 0,
  }

  const displaySlots = isT3C ? countedSlots : (slots ?? countedSlots)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle>{fitting.shipName}</DialogTitle>
            <DialogDescription className="sr-only">
              {t('fitting.title')}
            </DialogDescription>
          </div>
          <button
            onClick={copyFitting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-border hover:bg-surface-secondary transition-colors mr-6"
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied ? t('fitting.copied') : t('fitting.copyFitting')}
          </button>
        </DialogHeader>

        <div className="flex flex-col items-center">
          <FittingWheel
            highSlotModules={fitting.highSlotModules}
            midSlotModules={fitting.midSlotModules}
            lowSlotModules={fitting.lowSlotModules}
            rigModules={fitting.rigModules}
            subsystemModules={fitting.subsystemModules}
            slots={displaySlots}
            shipTypeId={fitting.shipTypeId}
            shipName={fitting.shipName}
          />

          <div className="w-full mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-left max-h-48 overflow-y-auto">
            <ModuleList
              title={t('fitting.highSlots')}
              modules={fitting.highSlotModules}
            />
            <ModuleList
              title={t('fitting.midSlots')}
              modules={fitting.midSlotModules}
            />
            <ModuleList
              title={t('fitting.lowSlots')}
              modules={fitting.lowSlotModules}
            />
            <ModuleList
              title={t('fitting.rigs')}
              modules={fitting.rigModules}
            />
            {fitting.subsystemModules.some((m) => m.type_id > 0) && (
              <ModuleList
                title={t('fitting.subsystems')}
                modules={fitting.subsystemModules}
              />
            )}
            <ModuleList title={t('fitting.drones')} modules={fitting.drones} />
            <ModuleList
              title={t('fitting.fighterTubes')}
              modules={fitting.fighterTubes}
            />
            <ModuleList
              title={t('fitting.fighterBay')}
              modules={fitting.fighterBay}
            />
            {(
              Object.entries(fitting.holds) as [keyof ShipHolds, ModuleItem[]][]
            ).map(
              ([key, items]) =>
                items.length > 0 && (
                  <ModuleList
                    key={key}
                    title={t(HOLD_LABEL_KEYS[key])}
                    modules={items}
                  />
                )
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
