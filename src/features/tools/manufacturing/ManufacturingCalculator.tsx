import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { TypeIcon } from '@/components/ui/type-icon'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { useDebouncedValue } from '@/hooks'
import {
  formatNumber,
  formatFullNumber,
  formatVolume,
  formatPercent,
} from '@/lib/utils'
import {
  JITA_SYSTEM_ID,
  CALCULATE_DEBOUNCE_MS,
  FACILITIES,
  RIGS,
} from '../industry-constants'
import type {
  ManufacturingCostResult,
  ManufacturingMaterial,
} from '../../../../shared/electron-api-types'

interface ManufacturingCalculatorProps {
  typeId: number
  typeName: string
  categoryId: number
}

function parseISODuration(iso: string): number {
  const match = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const days = parseInt(match[1] || '0', 10)
  const hours = parseInt(match[2] || '0', 10)
  const minutes = parseInt(match[3] || '0', 10)
  const seconds = parseInt(match[4] || '0', 10)
  return days * 86400 + hours * 3600 + minutes * 60 + seconds
}

function formatBuildTime(iso: string): string {
  const total = parseISODuration(iso)
  if (total === 0) return '0s'
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 || parts.length === 0) parts.push(`${m}m`)
  return parts.join(' ')
}

export function ManufacturingCalculator({
  typeId,
  typeName,
  categoryId,
}: ManufacturingCalculatorProps) {
  const { t } = useTranslation(['tools'])
  const systems = useReferenceCacheStore((s) => s.systems)

  const [runs, setRuns] = useState(1)
  const [me, setMe] = useState(0)
  const [te, setTe] = useState(0)
  const [systemId, setSystemId] = useState(JITA_SYSTEM_ID)
  const [systemSearch, setSystemSearch] = useState('Jita')
  const [facility, setFacility] = useState(0)
  const [rig, setRig] = useState(0)
  const [facilityTax, setFacilityTax] = useState(0)

  const [result, setResult] = useState<ManufacturingCostResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debouncedRuns = useDebouncedValue(runs, CALCULATE_DEBOUNCE_MS)
  const debouncedMe = useDebouncedValue(me, CALCULATE_DEBOUNCE_MS)
  const debouncedTe = useDebouncedValue(te, CALCULATE_DEBOUNCE_MS)
  const debouncedSystemId = useDebouncedValue(systemId, CALCULATE_DEBOUNCE_MS)
  const debouncedTax = useDebouncedValue(facilityTax, CALCULATE_DEBOUNCE_MS)

  const systemMatches = useMemo(() => {
    if (!systemSearch.trim() || systemSearch.length < 2) return []
    const query = systemSearch.toLowerCase()
    const matches: Array<{ id: number; name: string }> = []
    for (const sys of systems.values()) {
      if (sys.name.toLowerCase().includes(query)) {
        matches.push({ id: sys.id, name: sys.name })
        if (matches.length >= 10) break
      }
    }
    return matches.sort((a, b) => a.name.localeCompare(b.name))
  }, [systems, systemSearch])

  const calculate = useCallback(async () => {
    if (!typeId || !debouncedSystemId || !window.electronAPI) return

    setLoading(true)
    setError(null)

    try {
      const res = await window.electronAPI.refManufacturingCost({
        productId: typeId,
        systemId: debouncedSystemId,
        runs: debouncedRuns,
        me: debouncedMe,
        te: debouncedTe,
        facility,
        meRig: rig,
        facilityTax: debouncedTax / 100,
      })

      if ('error' in res && res.error) {
        setError(res.error)
        setResult(null)
      } else {
        setResult(res as ManufacturingCostResult)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [
    typeId,
    debouncedSystemId,
    debouncedRuns,
    debouncedMe,
    debouncedTe,
    facility,
    rig,
    debouncedTax,
  ])

  useEffect(() => {
    calculate()
  }, [calculate])

  const materials: ManufacturingMaterial[] = result
    ? Object.values(result.materials)
    : []

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      <div className="mb-4 flex items-center gap-3">
        <TypeIcon typeId={typeId} categoryId={categoryId} size="lg" />
        <h2 className="text-lg font-medium">{typeName}</h2>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-content-secondary">
            {t('manufacturing.runs')}
          </span>
          <input
            type="number"
            min={1}
            value={runs}
            onChange={(e) =>
              setRuns(Math.max(1, parseInt(e.target.value) || 1))
            }
            className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-content-secondary">
            {t('manufacturing.me')}
          </span>
          <input
            type="number"
            min={0}
            max={10}
            value={me}
            onChange={(e) =>
              setMe(Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))
            }
            className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-content-secondary">
            {t('manufacturing.te')}
          </span>
          <input
            type="number"
            min={0}
            max={20}
            step={2}
            value={te}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0
              setTe(Math.min(20, Math.max(0, val - (val % 2))))
            }}
            className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-content-secondary">
            {t('manufacturing.facilityTax')}
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={facilityTax}
            onChange={(e) =>
              setFacilityTax(
                Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
              )
            }
            className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm"
          />
        </label>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-content-secondary">
            {t('manufacturing.system')}
          </span>
          <div className="relative">
            <input
              type="text"
              value={systemSearch}
              onChange={(e) => setSystemSearch(e.target.value)}
              className="w-full rounded border border-border bg-surface-tertiary px-2 py-1 text-sm"
            />
            {systemMatches.length > 0 &&
              systemSearch !== systems.get(systemId)?.name && (
                <div className="absolute left-0 right-0 z-10 mt-1 max-h-40 overflow-auto rounded border border-border bg-surface-secondary shadow-lg">
                  {systemMatches.map((sys) => (
                    <button
                      key={sys.id}
                      onClick={() => {
                        setSystemId(sys.id)
                        setSystemSearch(sys.name)
                      }}
                      className="w-full px-2 py-1 text-left text-sm hover:bg-surface-tertiary"
                    >
                      {sys.name}
                    </button>
                  ))}
                </div>
              )}
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-content-secondary">
            {t('manufacturing.structure')}
          </span>
          <select
            value={facility}
            onChange={(e) => {
              const newFacility = parseInt(e.target.value)
              setFacility(newFacility)
              if (newFacility === 0) setRig(0)
            }}
            className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm"
          >
            {FACILITIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-content-secondary">
            {t('manufacturing.rig')}
          </span>
          <select
            value={rig}
            onChange={(e) => setRig(parseInt(e.target.value))}
            disabled={facility === 0}
            className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm disabled:opacity-50"
          >
            {RIGS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      )}

      {error && (
        <div className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {result && !loading && (
        <>
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium text-content-secondary">
              {t('manufacturing.materials')}
            </h3>
            <div className="overflow-hidden rounded border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-tertiary">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">
                      {t('manufacturing.item')}
                    </th>
                    <th className="px-2 py-1 text-right font-medium">
                      {t('manufacturing.quantity')}
                    </th>
                    <th className="px-2 py-1 text-right font-medium">
                      {t('manufacturing.volume')}
                    </th>
                    <th className="px-2 py-1 text-right font-medium">
                      {t('manufacturing.cost')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((mat) => (
                    <tr key={mat.type_id} className="border-t border-border">
                      <td className="px-2 py-1">{mat.type_name}</td>
                      <td className="px-2 py-1 text-right">
                        {formatFullNumber(mat.quantity)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatVolume(mat.volume)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatNumber(mat.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium text-content-secondary">
              {t('manufacturing.jobCosts')}
            </h3>
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-content-secondary">
                  {t('manufacturing.systemIndex')}:{' '}
                </span>
                <span>
                  {formatPercent(
                    (result.systemCostIndex / result.estimatedItemValue) * 100
                  )}
                </span>
              </div>
              <div>
                <span className="text-content-secondary">
                  {t('manufacturing.sccSurcharge')}:{' '}
                </span>
                <span>{formatNumber(result.sccSurcharge)}</span>
              </div>
              <div>
                <span className="text-content-secondary">
                  {t('manufacturing.facilityTaxLabel')}:{' '}
                </span>
                <span>{formatNumber(result.facilityTax)}</span>
              </div>
            </div>
          </div>

          <div className="rounded border border-border bg-surface-tertiary p-3">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div>
                <div className="text-content-secondary">
                  {t('manufacturing.materialCost')}
                </div>
                <div className="font-medium">
                  {formatNumber(result.totalMaterialCost)}
                </div>
              </div>
              <div>
                <div className="text-content-secondary">
                  {t('manufacturing.totalJobCost')}
                </div>
                <div className="font-medium">
                  {formatNumber(result.totalJobCost)}
                </div>
              </div>
              <div>
                <div className="text-content-secondary">
                  {t('manufacturing.totalCost')}
                </div>
                <div className="font-medium">
                  {formatNumber(result.totalCost)}
                </div>
              </div>
              <div>
                <div className="text-content-secondary">
                  {t('manufacturing.costPerUnit')}
                </div>
                <div className="font-medium">
                  {formatNumber(result.totalCostPerUnit)}
                </div>
              </div>
              <div>
                <div className="text-content-secondary">
                  {t('manufacturing.buildTime')}
                </div>
                <div className="font-medium">
                  {formatBuildTime(result.time)}
                </div>
              </div>
              <div>
                <div className="text-content-secondary">
                  {t('manufacturing.units')}
                </div>
                <div className="font-medium">
                  {formatFullNumber(result.units)}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
