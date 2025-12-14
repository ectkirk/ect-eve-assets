import { useState } from 'react'
import { Loader2, Calculator, Copy, AlertTriangle, Coins, Package } from 'lucide-react'
import { BlueprintSearch } from '@/components/ui/BlueprintSearch'
import { SystemSearch } from '@/components/ui/SystemSearch'
import { formatNumber } from '@/lib/utils'

const FACILITIES = [
  { id: 0, name: 'NPC Station' },
  { id: 1, name: 'Raitaru' },
  { id: 2, name: 'Azbel' },
  { id: 3, name: 'Sotiyo' },
  { id: 4, name: 'Other Structures' },
] as const

const RIGS = [
  { id: 0, name: 'None' },
  { id: 1, name: 'T1 Rig' },
  { id: 2, name: 'T2 Rig' },
] as const

const SECURITY_STATUS = [
  { id: 'h', name: 'Highsec' },
  { id: 'l', name: 'Lowsec' },
  { id: 'n', name: 'Nullsec/WH' },
] as const

const IMPLANTS = [
  { id: 1.0, name: 'None' },
  { id: 0.99, name: '1% (BX-801)' },
  { id: 0.97, name: '3% (BX-802)' },
  { id: 0.95, name: '5% (BX-804)' },
] as const

export function CopyingTab() {
  const [blueprint, setBlueprint] = useState<{ id: number; name: string } | null>(null)
  const [system, setSystem] = useState<{ id: number; name: string } | null>(null)
  const [facility, setFacility] = useState(0)
  const [scienceLevel, setScienceLevel] = useState(5)
  const [advancedIndustryLevel, setAdvancedIndustryLevel] = useState(5)
  const [copyRig, setCopyRig] = useState(0)
  const [copyImplant, setCopyImplant] = useState(1.0)
  const [securityStatus, setSecurityStatus] = useState<'h' | 'l' | 'n'>('h')
  const [facilityTax, setFacilityTax] = useState(0)
  const [fwBonus, setFwBonus] = useState(false)
  const [runsPerCopy, setRunsPerCopy] = useState(1)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BlueprintResearchResult | null>(null)
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
        facility_tax: facilityTax / 100,
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
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-4">
          <h3 className="font-medium text-slate-200">Blueprint Copying</h3>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Blueprint</label>
            <BlueprintSearch
              mode="blueprint"
              value={blueprint}
              onChange={setBlueprint}
              placeholder="Search blueprints..."
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">System</label>
            <SystemSearch
              value={system}
              onChange={setSystem}
              placeholder="Search systems..."
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Facility</label>
            <select
              value={facility}
              onChange={(e) => setFacility(parseInt(e.target.value, 10))}
              className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {FACILITIES.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Skills</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-28 text-xs text-slate-400">Science</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={scienceLevel}
                  onChange={(e) => setScienceLevel(parseInt(e.target.value, 10))}
                  className="flex-1"
                />
                <span className="w-4 text-sm text-right">{scienceLevel}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-28 text-xs text-slate-400">Adv. Industry</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={advancedIndustryLevel}
                  onChange={(e) => setAdvancedIndustryLevel(parseInt(e.target.value, 10))}
                  className="flex-1"
                />
                <span className="w-4 text-sm text-right">{advancedIndustryLevel}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Implant</label>
            <select
              value={copyImplant}
              onChange={(e) => setCopyImplant(parseFloat(e.target.value))}
              className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {IMPLANTS.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>

          {facility > 0 && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Rig</label>
                <select
                  value={copyRig}
                  onChange={(e) => setCopyRig(parseInt(e.target.value, 10))}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {RIGS.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Security Status</label>
                <select
                  value={securityStatus}
                  onChange={(e) => setSecurityStatus(e.target.value as 'h' | 'l' | 'n')}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {SECURITY_STATUS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Facility Tax (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={facilityTax}
                  onChange={(e) => setFacilityTax(parseFloat(e.target.value) || 0)}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="fwBonusCopy"
              checked={fwBonus}
              onChange={(e) => setFwBonus(e.target.checked)}
              className="rounded border-slate-600 bg-slate-700"
            />
            <label htmlFor="fwBonusCopy" className="text-sm text-slate-400">
              Faction Warfare Bonus (-50% system cost)
            </label>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Runs per Copy</label>
            <input
              type="number"
              min="1"
              value={runsPerCopy}
              onChange={(e) => setRunsPerCopy(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <button
            onClick={handleCalculate}
            disabled={loading || !blueprint || !system}
            className="w-full flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
            {error}
          </div>
        )}

        {result && !error && result.copying && (
          <div className="space-y-4">
            {result.blueprint && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <h3 className="text-lg font-medium text-slate-200 mb-2">{result.blueprint.name}</h3>
                <div className="text-sm text-slate-400">
                  Facility: {result.facility}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Copy className="h-4 w-4 text-purple-400" />
                <h4 className="text-sm font-medium text-slate-300">Copy Details</h4>
              </div>

              {result.copying.exceeds30DayLimit && (
                <div className="flex items-center gap-2 mb-4 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Copy duration exceeds 30 days - only one copy can be queued at a time</span>
                </div>
              )}

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Duration</div>
                  <div className="text-lg font-medium text-purple-400">{result.copying.durationFormatted}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Runs per Copy</div>
                  <div className="text-lg font-medium">{result.copying.runsPerCopy}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Max Runs</div>
                  <div className="text-lg font-medium">{result.copying.maxRuns}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Copies in 30 days</div>
                  <div className={`text-lg font-medium ${result.copying.exceeds30DayLimit ? 'text-amber-400' : 'text-cyan-400'}`}>
                    {result.copying.copiesIn30Days}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="rounded border border-slate-700 p-3">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Coins className="h-3.5 w-3.5" />
                    <span className="text-xs">Installation Cost</span>
                  </div>
                  <div className="text-sm font-medium text-amber-400">
                    {formatNumber(result.copying.installationCost)} ISK
                  </div>
                </div>
                <div className="rounded border border-slate-700 p-3">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Coins className="h-3.5 w-3.5" />
                    <span className="text-xs">Materials Cost</span>
                  </div>
                  <div className="text-sm font-medium text-amber-400">
                    {formatNumber(result.copying.materialsCost)} ISK
                  </div>
                </div>
                <div className="rounded border border-slate-700 p-3">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Coins className="h-3.5 w-3.5" />
                    <span className="text-xs">Total Cost</span>
                  </div>
                  <div className="text-sm font-medium text-green-400">
                    {formatNumber(result.copying.totalCost)} ISK
                  </div>
                </div>
              </div>

              {result.copying.maxRuns > 1 && result.copying.runsPerCopy < result.copying.maxRuns && (
                <div className="mb-4">
                  <div className="text-xs text-slate-400 mb-2">Max Runs Copy ({result.copying.maxRuns} runs)</div>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-slate-500">Duration</div>
                      <div className="text-slate-300">{result.copying.maxCopyDurationFormatted}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Installation</div>
                      <div className="text-slate-300">{formatNumber(result.copying.maxCopyInstallationCost)} ISK</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Materials</div>
                      <div className="text-slate-300">{formatNumber(result.copying.maxCopyMaterialsCost)} ISK</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Total</div>
                      <div className="text-slate-300">{formatNumber(result.copying.maxCopyTotalCost)} ISK</div>
                    </div>
                  </div>
                </div>
              )}

              {result.copying.materials && result.copying.materials.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <Package className="h-3.5 w-3.5" />
                    <span className="text-xs">Copy Materials</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-700">
                          <th className="pb-2 pr-2">Material</th>
                          <th className="pb-2 pr-2 text-right">Qty</th>
                          <th className="pb-2 pr-2 text-right">Price</th>
                          <th className="pb-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.copying.materials.map((mat) => (
                          <tr key={mat.typeId} className="border-b border-slate-700/50">
                            <td className="py-1.5 pr-2 text-slate-300">{mat.name}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{mat.quantity.toLocaleString()}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-slate-400">{formatNumber(mat.price)} ISK</td>
                            <td className="py-1.5 text-right tabular-nums text-amber-400">{formatNumber(mat.total)} ISK</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {result.costIndices && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3">System Cost Index</h4>
                <div className="text-sm">
                  <div className="text-slate-400">Copying</div>
                  <div className="font-medium">{(result.costIndices.copying * 100).toFixed(4)}%</div>
                </div>
              </div>
            )}
          </div>
        )}

        {!result && !error && (
          <div className="flex items-center justify-center h-64 text-slate-400">
            Select a blueprint and system, then click Calculate to see copy times and costs
          </div>
        )}
      </div>
    </div>
  )
}
