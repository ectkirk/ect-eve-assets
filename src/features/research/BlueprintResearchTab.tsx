import { useState } from 'react'
import { Loader2, Calculator, Clock, BookOpen } from 'lucide-react'
import { BlueprintSearch } from '@/components/ui/BlueprintSearch'
import { SystemSearch } from '@/components/ui/SystemSearch'
import { formatNumber } from '@/lib/utils'
import {
  RESEARCH_FACILITIES as FACILITIES,
  RIGS,
  SECURITY_STATUS,
  IMPLANTS,
} from '@/features/industry/constants'

export function BlueprintResearchTab() {
  const [blueprint, setBlueprint] = useState<{ id: number; name: string } | null>(null)
  const [system, setSystem] = useState<{ id: number; name: string } | null>(null)
  const [facility, setFacility] = useState(0)
  const [metallurgyLevel, setMetallurgyLevel] = useState(5)
  const [researchLevel, setResearchLevel] = useState(5)
  const [advancedIndustryLevel, setAdvancedIndustryLevel] = useState(5)
  const [meRig, setMeRig] = useState(0)
  const [teRig, setTeRig] = useState(0)
  const [meImplant, setMeImplant] = useState(1.0)
  const [teImplant, setTeImplant] = useState(1.0)
  const [securityStatus, setSecurityStatus] = useState<'h' | 'l' | 'n'>('h')
  const [facilityTax, setFacilityTax] = useState(0)
  const [fwBonus, setFwBonus] = useState(false)
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
        advanced_industry_level: advancedIndustryLevel,
        me_implant: meImplant,
        te_implant: teImplant,
        me_rig: meRig,
        te_rig: teRig,
        security_status: securityStatus,
        facility_tax: facilityTax / 100,
        faction_warfare_bonus: fwBonus,
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
          <h3 className="font-medium text-content">Blueprint Research</h3>

          <div>
            <label className="block text-sm text-content-secondary mb-1">Blueprint</label>
            <BlueprintSearch
              mode="blueprint"
              value={blueprint}
              onChange={setBlueprint}
              placeholder="Search blueprints..."
            />
          </div>

          <div>
            <label className="block text-sm text-content-secondary mb-1">System</label>
            <SystemSearch
              value={system}
              onChange={setSystem}
              placeholder="Search systems..."
            />
          </div>

          <div>
            <label className="block text-sm text-content-secondary mb-1">Facility</label>
            <select
              value={facility}
              onChange={(e) => setFacility(parseInt(e.target.value, 10))}
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
                <span className="w-28 text-xs text-content-secondary">Metallurgy</span>
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
                <span className="w-28 text-xs text-content-secondary">Research</span>
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
                <span className="w-28 text-xs text-content-secondary">Adv. Industry</span>
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
            <label className="block text-sm text-content-secondary mb-2">Implants</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-20 text-xs text-content-secondary">ME</span>
                <select
                  value={meImplant}
                  onChange={(e) => setMeImplant(parseFloat(e.target.value))}
                  className="flex-1 rounded border border-border bg-surface-tertiary px-2 py-1 text-sm focus:border-accent focus:outline-none"
                >
                  {IMPLANTS.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-xs text-content-secondary">TE</span>
                <select
                  value={teImplant}
                  onChange={(e) => setTeImplant(parseFloat(e.target.value))}
                  className="flex-1 rounded border border-border bg-surface-tertiary px-2 py-1 text-sm focus:border-accent focus:outline-none"
                >
                  {IMPLANTS.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {facility > 0 && (
            <>
              <div>
                <label className="block text-sm text-content-secondary mb-2">Rigs</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-xs text-content-secondary">ME Rig</span>
                    <select
                      value={meRig}
                      onChange={(e) => setMeRig(parseInt(e.target.value, 10))}
                      className="flex-1 rounded border border-border bg-surface-tertiary px-2 py-1 text-sm focus:border-accent focus:outline-none"
                    >
                      {RIGS.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-xs text-content-secondary">TE Rig</span>
                    <select
                      value={teRig}
                      onChange={(e) => setTeRig(parseInt(e.target.value, 10))}
                      className="flex-1 rounded border border-border bg-surface-tertiary px-2 py-1 text-sm focus:border-accent focus:outline-none"
                    >
                      {RIGS.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm text-content-secondary mb-1">Security Status</label>
                <select
                  value={securityStatus}
                  onChange={(e) => setSecurityStatus(e.target.value as 'h' | 'l' | 'n')}
                  className="w-full rounded border border-border bg-surface-tertiary px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  {SECURITY_STATUS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
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
                  onChange={(e) => setFacilityTax(parseFloat(e.target.value) || 0)}
                  className="w-full rounded border border-border bg-surface-tertiary px-3 py-2 text-sm focus:border-accent focus:outline-none"
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
              className="rounded border-border bg-surface-tertiary"
            />
            <label htmlFor="fwBonus" className="text-sm text-content-secondary">
              Faction Warfare Bonus (-50% system cost)
            </label>
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

        {result && !error && (
          <div className="space-y-4">
            {result.blueprint && (
              <div className="rounded-lg border border-border bg-surface-secondary/50 p-4">
                <h3 className="text-lg font-medium text-content mb-2">{result.blueprint.name}</h3>
                <div className="text-sm text-content-secondary">
                  Facility: {result.facility}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {result.meResearch && result.meResearch.length > 0 && (
                <div className="rounded-lg border border-border bg-surface-secondary/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="h-4 w-4 text-status-info" />
                    <h4 className="text-sm font-medium text-content-secondary">ME Research</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-content-secondary border-b border-border">
                          <th className="pb-2 pr-2">Level</th>
                          <th className="pb-2 pr-2">Time</th>
                          <th className="pb-2 pr-2">Cost</th>
                          <th className="pb-2 pr-2">Total Time</th>
                          <th className="pb-2">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.meResearch.map((row) => (
                          <tr key={row.level} className="border-b border-border/50">
                            <td className="py-1.5 pr-2 text-status-info">{row.level}</td>
                            <td className="py-1.5 pr-2 text-content-secondary">{row.durationFormatted}</td>
                            <td className="py-1.5 pr-2 tabular-nums">{formatNumber(row.cost)} ISK</td>
                            <td className="py-1.5 pr-2 text-content-secondary">{row.cumulativeDurationFormatted}</td>
                            <td className="py-1.5 tabular-nums text-status-highlight">{formatNumber(row.cumulativeCost)} ISK</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {result.teResearch && result.teResearch.length > 0 && (
                <div className="rounded-lg border border-border bg-surface-secondary/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-status-positive" />
                    <h4 className="text-sm font-medium text-content-secondary">TE Research</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-content-secondary border-b border-border">
                          <th className="pb-2 pr-2">Level</th>
                          <th className="pb-2 pr-2">Time</th>
                          <th className="pb-2 pr-2">Cost</th>
                          <th className="pb-2 pr-2">Total Time</th>
                          <th className="pb-2">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.teResearch.map((row) => (
                          <tr key={row.level} className="border-b border-border/50">
                            <td className="py-1.5 pr-2 text-status-positive">{row.level}</td>
                            <td className="py-1.5 pr-2 text-content-secondary">{row.durationFormatted}</td>
                            <td className="py-1.5 pr-2 tabular-nums">{formatNumber(row.cost)} ISK</td>
                            <td className="py-1.5 pr-2 text-content-secondary">{row.cumulativeDurationFormatted}</td>
                            <td className="py-1.5 tabular-nums text-status-highlight">{formatNumber(row.cumulativeCost)} ISK</td>
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
                <h4 className="text-sm font-medium text-content-secondary mb-3">System Cost Indices</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-content-secondary">ME Research</div>
                    <div className="font-medium">{(result.costIndices.researching_material_efficiency * 100).toFixed(4)}%</div>
                  </div>
                  <div>
                    <div className="text-content-secondary">TE Research</div>
                    <div className="font-medium">{(result.costIndices.researching_time_efficiency * 100).toFixed(4)}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!result && !error && (
          <div className="flex items-center justify-center h-64 text-content-secondary">
            Select a blueprint and system, then click Calculate to see ME/TE research times and costs
          </div>
        )}
      </div>
    </div>
  )
}
