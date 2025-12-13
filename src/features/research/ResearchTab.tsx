import { useState } from 'react'
import { Loader2, Calculator, Clock, Coins, BookOpen, Copy } from 'lucide-react'
import { BlueprintSearch } from '@/components/ui/BlueprintSearch'
import { SystemSearch } from '@/components/ui/SystemSearch'
import { formatNumber } from '@/lib/utils'

const FACILITIES = [
  { id: 0, name: 'NPC Station' },
  { id: 1, name: 'Raitaru' },
  { id: 2, name: 'Azbel' },
  { id: 3, name: 'Sotiyo' },
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

export function ResearchTab() {
  const [blueprint, setBlueprint] = useState<{ id: number; name: string } | null>(null)
  const [system, setSystem] = useState<{ id: number; name: string } | null>(null)
  const [facility, setFacility] = useState(0)
  const [metallurgyLevel, setMetallurgyLevel] = useState(5)
  const [researchLevel, setResearchLevel] = useState(5)
  const [scienceLevel, setScienceLevel] = useState(5)
  const [advancedIndustryLevel, setAdvancedIndustryLevel] = useState(5)
  const [meRig, setMeRig] = useState(0)
  const [teRig, setTeRig] = useState(0)
  const [copyRig, setCopyRig] = useState(0)
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
        metallurgy_level: metallurgyLevel,
        research_level: researchLevel,
        science_level: scienceLevel,
        advanced_industry_level: advancedIndustryLevel,
        me_rig: meRig,
        te_rig: teRig,
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
          <h3 className="font-medium text-slate-200">Blueprint Research Calculator</h3>

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
                <span className="w-28 text-xs text-slate-400">Metallurgy</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={metallurgyLevel}
                  onChange={(e) => setMetallurgyLevel(parseInt(e.target.value, 10))}
                  className="flex-1"
                />
                <span className="w-4 text-sm text-right">{metallurgyLevel}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-28 text-xs text-slate-400">Research</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={researchLevel}
                  onChange={(e) => setResearchLevel(parseInt(e.target.value, 10))}
                  className="flex-1"
                />
                <span className="w-4 text-sm text-right">{researchLevel}</span>
              </div>
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

          {facility > 0 && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Rigs</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-xs text-slate-400">ME Rig</span>
                    <select
                      value={meRig}
                      onChange={(e) => setMeRig(parseInt(e.target.value, 10))}
                      className="flex-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      {RIGS.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-xs text-slate-400">TE Rig</span>
                    <select
                      value={teRig}
                      onChange={(e) => setTeRig(parseInt(e.target.value, 10))}
                      className="flex-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      {RIGS.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-xs text-slate-400">Copy Rig</span>
                    <select
                      value={copyRig}
                      onChange={(e) => setCopyRig(parseInt(e.target.value, 10))}
                      className="flex-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      {RIGS.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
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
              id="fwBonus"
              checked={fwBonus}
              onChange={(e) => setFwBonus(e.target.checked)}
              className="rounded border-slate-600 bg-slate-700"
            />
            <label htmlFor="fwBonus" className="text-sm text-slate-400">
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

        {result && !error && (
          <div className="space-y-4">
            {result.blueprint && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <h3 className="text-lg font-medium text-slate-200 mb-2">{result.blueprint.name}</h3>
                <div className="text-sm text-slate-400">
                  Facility: {result.facility}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {result.meResearch && result.meResearch.length > 0 && (
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="h-4 w-4 text-blue-400" />
                    <h4 className="text-sm font-medium text-slate-300">ME Research</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-700">
                          <th className="pb-2 pr-2">Level</th>
                          <th className="pb-2 pr-2">Time</th>
                          <th className="pb-2 pr-2">Cost</th>
                          <th className="pb-2 pr-2">Total Time</th>
                          <th className="pb-2">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.meResearch.map((row) => (
                          <tr key={row.level} className="border-b border-slate-700/50">
                            <td className="py-1.5 pr-2 text-blue-400">{row.level}</td>
                            <td className="py-1.5 pr-2 text-slate-300">{row.durationFormatted}</td>
                            <td className="py-1.5 pr-2 tabular-nums">{formatNumber(row.cost)} ISK</td>
                            <td className="py-1.5 pr-2 text-slate-400">{row.cumulativeDurationFormatted}</td>
                            <td className="py-1.5 tabular-nums text-amber-400">{formatNumber(row.cumulativeCost)} ISK</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {result.teResearch && result.teResearch.length > 0 && (
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-green-400" />
                    <h4 className="text-sm font-medium text-slate-300">TE Research</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-700">
                          <th className="pb-2 pr-2">Level</th>
                          <th className="pb-2 pr-2">Time</th>
                          <th className="pb-2 pr-2">Cost</th>
                          <th className="pb-2 pr-2">Total Time</th>
                          <th className="pb-2">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.teResearch.map((row) => (
                          <tr key={row.level} className="border-b border-slate-700/50">
                            <td className="py-1.5 pr-2 text-green-400">{row.level}</td>
                            <td className="py-1.5 pr-2 text-slate-300">{row.durationFormatted}</td>
                            <td className="py-1.5 pr-2 tabular-nums">{formatNumber(row.cost)} ISK</td>
                            <td className="py-1.5 pr-2 text-slate-400">{row.cumulativeDurationFormatted}</td>
                            <td className="py-1.5 tabular-nums text-amber-400">{formatNumber(row.cumulativeCost)} ISK</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {result.copying && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Copy className="h-4 w-4 text-purple-400" />
                  <h4 className="text-sm font-medium text-slate-300">Copying</h4>
                </div>
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
                    <div className="text-lg font-medium text-cyan-400">{result.copying.copiesIn30Days}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
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
              </div>
            )}

            {result.costIndices && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3">System Cost Indices</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-slate-400">ME Research</div>
                    <div className="font-medium">{(result.costIndices.researching_material_efficiency * 100).toFixed(4)}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400">TE Research</div>
                    <div className="font-medium">{(result.costIndices.researching_time_efficiency * 100).toFixed(4)}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Copying</div>
                    <div className="font-medium">{(result.costIndices.copying * 100).toFixed(4)}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!result && !error && (
          <div className="flex items-center justify-center h-64 text-slate-400">
            Enter a Blueprint Type ID and click Calculate to see research times and costs
          </div>
        )}
      </div>
    </div>
  )
}
