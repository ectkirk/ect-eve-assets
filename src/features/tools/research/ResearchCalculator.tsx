import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { TypeIcon } from '@/components/ui/type-icon'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { useDebouncedValue } from '@/hooks'
import { formatNumber, formatFullNumber } from '@/lib/utils'
import {
  JITA_SYSTEM_ID,
  CALCULATE_DEBOUNCE_MS,
  FACILITIES,
  RIGS,
} from '../industry-constants'
import type {
  BlueprintResearchResult,
  BlueprintResearchLevel,
  BlueprintCopyMaterial,
} from '../../../../shared/electron-api-types'

const BLUEPRINT_CATEGORY_ID = 9

interface ResearchCalculatorProps {
  typeId: number
  typeName: string
}

export function ResearchCalculator({
  typeId,
  typeName,
}: ResearchCalculatorProps) {
  const { t } = useTranslation(['tools'])
  const systems = useReferenceCacheStore((s) => s.systems)

  const [systemId, setSystemId] = useState(JITA_SYSTEM_ID)
  const [systemSearch, setSystemSearch] = useState('Jita')
  const [facility, setFacility] = useState(0)
  const [rig, setRig] = useState(0)

  const [result, setResult] = useState<BlueprintResearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debouncedSystemId = useDebouncedValue(systemId, CALCULATE_DEBOUNCE_MS)

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
      const res = await window.electronAPI.refBlueprintResearch({
        blueprintId: typeId,
        systemId: debouncedSystemId,
        facility,
        rig,
      })

      if ('error' in res && res.error) {
        setError(res.error)
        setResult(null)
      } else {
        setResult(res as BlueprintResearchResult)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [typeId, debouncedSystemId, facility, rig])

  useEffect(() => {
    calculate()
  }, [calculate])

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      <div className="mb-4 flex items-center gap-3">
        <TypeIcon
          typeId={typeId}
          categoryId={BLUEPRINT_CATEGORY_ID}
          size="lg"
        />
        <h2 className="text-lg font-medium">{typeName}</h2>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-content-secondary">
            {t('research.system')}
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
            {t('research.structure')}
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
            {t('research.rig')}
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
        <div className="space-y-6">
          <ResearchTable
            title={t('research.meResearch')}
            levels={result.meResearch}
          />
          <ResearchTable
            title={t('research.teResearch')}
            levels={result.teResearch}
          />
          <CopyingSection copying={result.copying} />
        </div>
      )}
    </div>
  )
}

function ResearchTable({
  title,
  levels,
}: {
  title: string
  levels: BlueprintResearchLevel[]
}) {
  const { t } = useTranslation(['tools'])

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-content-secondary">
        {title}
      </h3>
      <div className="overflow-hidden rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-tertiary">
            <tr>
              <th className="px-2 py-1 text-left font-medium">
                {t('research.level')}
              </th>
              <th className="px-2 py-1 text-right font-medium">
                {t('research.duration')}
              </th>
              <th className="px-2 py-1 text-right font-medium">
                {t('research.cost')}
              </th>
              <th className="px-2 py-1 text-right font-medium">
                {t('research.cumDuration')}
              </th>
              <th className="px-2 py-1 text-right font-medium">
                {t('research.cumCost')}
              </th>
            </tr>
          </thead>
          <tbody>
            {levels.map((lvl) => (
              <tr key={lvl.level} className="border-t border-border">
                <td className="px-2 py-1">{lvl.level}</td>
                <td className="px-2 py-1 text-right">
                  {lvl.durationFormatted}
                </td>
                <td className="px-2 py-1 text-right">
                  {formatNumber(lvl.cost)}
                </td>
                <td className="px-2 py-1 text-right">
                  {lvl.cumulativeDurationFormatted}
                </td>
                <td className="px-2 py-1 text-right">
                  {formatNumber(lvl.cumulativeCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CopyingSection({
  copying,
}: {
  copying: BlueprintResearchResult['copying']
}) {
  const { t } = useTranslation(['tools'])

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-content-secondary">
        {t('research.copying')}
      </h3>

      <div className="mb-3 rounded border border-border bg-surface-tertiary p-3">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-content-secondary">
              {t('research.duration')}
            </div>
            <div className="font-medium">{copying.durationFormatted}</div>
          </div>
          <div>
            <div className="text-content-secondary">
              {t('research.runsPerCopy')}
            </div>
            <div className="font-medium">
              {formatFullNumber(copying.runsPerCopy)}
            </div>
          </div>
          <div>
            <div className="text-content-secondary">
              {t('research.maxRuns')}
            </div>
            <div className="font-medium">
              {formatFullNumber(copying.maxRuns)}
            </div>
          </div>
          <div>
            <div className="text-content-secondary">
              {t('research.copiesIn30Days')}
            </div>
            <div className="font-medium">
              {formatFullNumber(copying.copiesIn30Days)}
            </div>
          </div>
        </div>
      </div>

      {copying.materials.length > 0 && (
        <div className="mb-3 overflow-hidden rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-tertiary">
              <tr>
                <th className="px-2 py-1 text-left font-medium">
                  {t('research.material')}
                </th>
                <th className="px-2 py-1 text-right font-medium">
                  {t('research.quantity')}
                </th>
                <th className="px-2 py-1 text-right font-medium">
                  {t('research.price')}
                </th>
                <th className="px-2 py-1 text-right font-medium">
                  {t('research.total')}
                </th>
              </tr>
            </thead>
            <tbody>
              {copying.materials.map((mat: BlueprintCopyMaterial) => (
                <tr key={mat.typeId} className="border-t border-border">
                  <td className="px-2 py-1">{mat.name}</td>
                  <td className="px-2 py-1 text-right">
                    {formatFullNumber(mat.quantity)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(mat.price)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(mat.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded border border-border bg-surface-tertiary p-3">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div>
            <div className="text-content-secondary">
              {t('research.installCost')}
            </div>
            <div className="font-medium">
              {formatNumber(copying.installationCost)}
            </div>
          </div>
          <div>
            <div className="text-content-secondary">
              {t('research.materialsCost')}
            </div>
            <div className="font-medium">
              {formatNumber(copying.materialsCost)}
            </div>
          </div>
          <div>
            <div className="text-content-secondary">
              {t('research.totalCost')}
            </div>
            <div className="font-medium">{formatNumber(copying.totalCost)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
