import { useState } from 'react'
import { Loader2, Calculator, Copy, AlertTriangle, Coins, Package } from 'lucide-react'
import { BlueprintSearch } from '@/components/ui/BlueprintSearch'
import { SystemSearch } from '@/components/ui/SystemSearch'
import { formatNumber } from '@/lib/utils'
import { useToolsStore } from '@/store/tools-store'
import {
  RESEARCH_FACILITIES as FACILITIES,
  RIGS,
  IMPLANTS,
} from '@/features/industry/constants'

export function CopyingTab() {
  const inputs = useToolsStore((s) => s.copying)
  const setInputs = useToolsStore((s) => s.setCopying)
  const result = useToolsStore((s) => s.copyingResult)
  const setResult = useToolsStore((s) => s.setCopyingResult)
  const {
    blueprint, system, facility, scienceLevel, advancedIndustryLevel,
    copyRig, copyImplant, securityStatus, facilityTax, fwBonus, runsPerCopy,
  } = inputs

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCalculate = async () => {
    if (!blueprint) {
      setError('Please select a blueprint')
      return
    }
    if (!system) {
      setError('Please select a system')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const params: BlueprintResearchParams = {
        blueprint_id: blueprint.id,
        system_id: system.id,
        facility,
        science_level: scienceLevel,
        advanced_industry_level: advancedIndustryLevel,
        copy_implant: copyImplant,
        copy_rig: copyRig,
        security_status: securityStatus,
        facility_tax: facility === 0 ? 0.0025 : facilityTax / 100,
        faction_warfare_bonus: fwBonus,
        runs_per_copy: runsPerCopy,
      }

      const res = await window.electronAPI!.refBlueprintResearch(params)
      if (res.error) {
        setError(res.error)
      } else {
        setResult(res)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex gap-6 h-full">
      <div className="w-80 shrink-0 space-y-4 overflow-y-auto">
        <div className="rounded-lg border border-border bg-surface-secondary/50 p-4 space-y-4">
          <h3 className="font-medium text-content">Blueprint Copying</h3>

          <div>
            <label className="block text-sm text-content-secondary mb-1">Blueprint</label>
            <BlueprintSearch
              mode="blueprint"
              value={blueprint}
              onChange={(v) => setInputs({ blueprint: v })}
              placeholder="Search blueprints..."
            />
          </div>

          <div>
            <label className="block text-sm text-content-secondary mb-1">System</label>
            <SystemSearch
              value={system}
              onChange={(v) => {
                const sec = v?.security
                const secStatus = sec === undefined ? 'h' : sec >= 0.5 ? 'h' : sec > 0 ? 'l' : 'n'
                setInputs({ system: v, securityStatus: secStatus })
              }}
              placeholder="Search systems..."
            />
          </div>

          <div>
            <label className="block text-sm text-content-secondary mb-1">Facility</label>
            <select
              value={facility}
              onChange={(e) => setInputs({ facility: parseInt(e.target.value, 10) })}
              className="w-full rounded border border-border bg-surface-tertiary px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {FACILITIES.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-content-secondary mb-2">Skills</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-28 text-xs text-content-secondary">Science</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={scienceLevel}
                  onChange={(e) => setInputs({ scienceLevel: parseInt(e.target.value, 10) })}
                  className="flex-1"
                />
                <span className="w-4 text-sm text-right">{scienceLevel}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-28 text-xs text-content-secondary">Adv. Industry</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={advancedIndustryLevel}
                  onChange={(e) => setInputs({ advancedIndustryLevel: parseInt(e.target.value, 10) })}
                  className="flex-1"
                />
                <span className="w-4 text-sm text-right">{advancedIndustryLevel}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-content-secondary mb-2">Implant</label>
            <select
              value={copyImplant}
              onChange={(e) => setInputs({ copyImplant: parseFloat(e.target.value) })}
              className="w-full rounded border border-border bg-surface-tertiary px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {IMPLANTS.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>

          {facility > 0 && (
            <>
              <div>
                <label className="block text-sm text-content-secondary mb-2">Rig</label>
                <select
                  value={copyRig}
                  onChange={(e) => setInputs({ copyRig: parseInt(e.target.value, 10) })}
                  className="w-full rounded border border-border bg-surface-tertiary px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  {RIGS.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-content-secondary mb-1">Facility Tax (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={facilityTax}
                  onChange={(e) => setInputs({ facilityTax: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded border border-border bg-surface-tertiary px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="fwBonusCopy"
              checked={fwBonus}
              onChange={(e) => setInputs({ fwBonus: e.target.checked })}
              className="rounded border-border bg-surface-tertiary"
            />
            <label htmlFor="fwBonusCopy" className="text-sm text-content-secondary">
              Faction Warfare Bonus (-50% system cost)
            </label>
          </div>

          <div>
            <label className="block text-sm text-content-secondary mb-1">Runs per Copy</label>
            <input
              type="number"
              min="1"
              value={runsPerCopy}
              onChange={(e) => setInputs({ runsPerCopy: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              className="w-full rounded border border-border bg-surface-tertiary px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <button
            onClick={handleCalculate}
            disabled={loading || !blueprint || !system}
            className="w-full flex items-center justify-center gap-2 rounded bg-action px-4 py-2 text-sm font-medium hover:bg-action-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Calculator className="h-4 w-4" />
            )}
            Calculate
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {error && (
          <div className="rounded-lg border border-semantic-danger/50 bg-semantic-danger/10 p-4 text-status-negative">
            {error}
          </div>
        )}

        {result && !error && result.copying && (
          <div className="space-y-4">
            {result.blueprint && (
              <div className="rounded-lg border border-border bg-surface-secondary/50 p-4">
                <h3 className="text-lg font-medium text-content mb-2">{result.blueprint.name}</h3>
                <div className="text-sm text-content-secondary">
                  Facility: {result.facility}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border bg-surface-secondary/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Copy className="h-4 w-4 text-status-time" />
                <h4 className="text-sm font-medium text-content-secondary">Copy Details</h4>
              </div>

              {result.copying.exceeds30DayLimit && (
                <div className="flex items-center gap-2 mb-4 p-2 rounded bg-semantic-warning/10 border border-semantic-warning/30 text-status-highlight text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Copy duration exceeds 30 days - only one copy can be queued at a time</span>
                </div>
              )}

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-xs text-content-secondary mb-1">Duration</div>
                  <div className="text-lg font-medium text-accent">{result.copying.durationFormatted}</div>
                </div>
                <div>
                  <div className="text-xs text-content-secondary mb-1">Runs per Copy</div>
                  <div className="text-lg font-medium">{result.copying.runsPerCopy}</div>
                </div>
                <div>
                  <div className="text-xs text-content-secondary mb-1">Max Runs</div>
                  <div className="text-lg font-medium">{result.copying.maxRuns}</div>
                </div>
                <div>
                  <div className="text-xs text-content-secondary mb-1">Copies in 30 days</div>
                  <div className={`text-lg font-medium ${result.copying.exceeds30DayLimit ? 'text-status-highlight' : 'text-status-special'}`}>
                    {result.copying.copiesIn30Days}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="rounded border border-border p-3">
                  <div className="flex items-center gap-2 text-content-secondary mb-1">
                    <Coins className="h-3.5 w-3.5" />
                    <span className="text-xs">Installation Cost</span>
                  </div>
                  <div className="text-sm font-medium text-status-highlight">
                    {formatNumber(result.copying.installationCost)} ISK
                  </div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="flex items-center gap-2 text-content-secondary mb-1">
                    <Coins className="h-3.5 w-3.5" />
                    <span className="text-xs">Materials Cost</span>
                  </div>
                  <div className="text-sm font-medium text-status-highlight">
                    {formatNumber(result.copying.materialsCost)} ISK
                  </div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="flex items-center gap-2 text-content-secondary mb-1">
                    <Coins className="h-3.5 w-3.5" />
                    <span className="text-xs">Total Cost</span>
                  </div>
                  <div className="text-sm font-medium text-status-positive">
                    {formatNumber(result.copying.totalCost)} ISK
                  </div>
                </div>
              </div>

              {result.copying.maxRuns > 1 && result.copying.runsPerCopy < result.copying.maxRuns && (
                <div className="mb-4">
                  <div className="text-xs text-content-secondary mb-2">Max Runs Copy ({result.copying.maxRuns} runs)</div>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-content-muted">Duration</div>
                      <div className="text-content-secondary">{result.copying.maxCopyDurationFormatted}</div>
                    </div>
                    <div>
                      <div className="text-content-muted">Installation</div>
                      <div className="text-content-secondary">{formatNumber(result.copying.maxCopyInstallationCost)} ISK</div>
                    </div>
                    <div>
                      <div className="text-content-muted">Materials</div>
                      <div className="text-content-secondary">{formatNumber(result.copying.maxCopyMaterialsCost)} ISK</div>
                    </div>
                    <div>
                      <div className="text-content-muted">Total</div>
                      <div className="text-content-secondary">{formatNumber(result.copying.maxCopyTotalCost)} ISK</div>
                    </div>
                  </div>
                </div>
              )}

              {result.copying.materials && result.copying.materials.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-content-secondary mb-2">
                    <Package className="h-3.5 w-3.5" />
                    <span className="text-xs">Copy Materials</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-content-secondary border-b border-border">
                          <th className="pb-2 pr-2">Material</th>
                          <th className="pb-2 pr-2 text-right">Qty</th>
                          <th className="pb-2 pr-2 text-right">Price</th>
                          <th className="pb-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.copying.materials.map((mat) => (
                          <tr key={mat.typeId} className="border-b border-border/50">
                            <td className="py-1.5 pr-2 text-content-secondary">{mat.name}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{mat.quantity.toLocaleString()}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-content-secondary">{formatNumber(mat.price)} ISK</td>
                            <td className="py-1.5 text-right tabular-nums text-status-highlight">{formatNumber(mat.total)} ISK</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {result.costIndices && (
              <div className="rounded-lg border border-border bg-surface-secondary/50 p-4">
                <h4 className="text-sm font-medium text-content-secondary mb-3">System Cost Index</h4>
                <div className="text-sm">
                  <div className="text-content-secondary">Copying</div>
                  <div className="font-medium">{(result.costIndices.copying * 100).toFixed(4)}%</div>
                </div>
              </div>
            )}
          </div>
        )}

        {!result && !error && (
          <div className="flex items-center justify-center h-64 text-content-secondary">
            Select a blueprint and system, then click Calculate to see copy times and costs
          </div>
        )}
      </div>
    </div>
  )
}
