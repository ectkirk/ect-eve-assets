import { useState, useMemo } from 'react'
import { Loader2, Calculator, Package, Clock, Coins } from 'lucide-react'
import { TypeIcon } from '@/components/ui/type-icon'
import { BlueprintSearch } from '@/components/ui/BlueprintSearch'
import { SystemSearch } from '@/components/ui/SystemSearch'
import { formatNumber } from '@/lib/utils'

const FACILITIES = [
  { id: 0, name: 'NPC Station' },
  { id: 1, name: 'Raitaru' },
  { id: 2, name: 'Azbel' },
  { id: 3, name: 'Sotiyo' },
] as const

const ME_RIGS = [
  { id: 0, name: 'None' },
  { id: 1, name: 'T1 Material Rig' },
  { id: 2, name: 'T2 Material Rig' },
] as const

const SECURITY_STATUS = [
  { id: 'h', name: 'Highsec' },
  { id: 'l', name: 'Lowsec' },
  { id: 'n', name: 'Nullsec/WH' },
] as const

function formatDuration(isoStr: string | undefined): string {
  if (!isoStr) return '-'
  const match = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return isoStr
  const hours = parseInt(match[1] || '0', 10)
  const minutes = parseInt(match[2] || '0', 10)
  const seconds = parseInt(match[3] || '0', 10)
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}

export function ManufacturingTab() {
  const [product, setProduct] = useState<{ id: number; name: string } | null>(null)
  const [system, setSystem] = useState<{ id: number; name: string } | null>(null)
  const [me, setMe] = useState(10)
  const [te, setTe] = useState(20)
  const [runs, setRuns] = useState(1)
  const [facility, setFacility] = useState(0)
  const [meRig, setMeRig] = useState(0)
  const [securityStatus, setSecurityStatus] = useState<'h' | 'l' | 'n'>('h')
  const [facilityTax, setFacilityTax] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ManufacturingCostResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCalculate = async () => {
    if (!product) {
      setError('Please select a product')
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
      const params: ManufacturingCostParams = {
        product_id: product.id,
        system_id: system.id,
        me,
        te,
        runs,
        facility,
        me_rig: meRig,
        security_status: securityStatus,
        facility_tax: facilityTax / 100,
      }

      const res = await window.electronAPI!.refManufacturingCost(params)
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

  const materials = useMemo((): ManufacturingMaterial[] => {
    if (!result?.materials) return []
    return Object.values(result.materials).sort((a, b) => b.cost - a.cost)
  }, [result?.materials])

  return (
    <div className="flex gap-6 h-full">
      <div className="w-80 shrink-0 space-y-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-4">
          <h3 className="font-medium text-slate-200">Manufacturing Calculator</h3>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Product</label>
            <BlueprintSearch
              mode="product"
              value={product}
              onChange={setProduct}
              placeholder="Search products..."
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
            <label className="block text-sm text-slate-400 mb-1">ME Level</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="10"
                value={me}
                onChange={(e) => setMe(parseInt(e.target.value, 10))}
                className="flex-1"
              />
              <span className="w-6 text-sm text-right">{me}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">TE Level</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="20"
                step="2"
                value={te}
                onChange={(e) => setTe(parseInt(e.target.value, 10))}
                className="flex-1"
              />
              <span className="w-6 text-sm text-right">{te}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Runs</label>
            <input
              type="number"
              min="1"
              value={runs}
              onChange={(e) => setRuns(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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

          {facility > 0 && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1">ME Rig</label>
                <select
                  value={meRig}
                  onChange={(e) => setMeRig(parseInt(e.target.value, 10))}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {ME_RIGS.map((r) => (
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

          <button
            onClick={handleCalculate}
            disabled={loading || !product || !system}
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
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <Coins className="h-4 w-4" />
                  <span className="text-sm">Total Cost</span>
                </div>
                <div className="text-xl font-bold text-green-400">
                  {formatNumber(result.totalCost ?? 0)} ISK
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {formatNumber(result.totalCostPerUnit ?? 0)} ISK/unit
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <Package className="h-4 w-4" />
                  <span className="text-sm">Materials</span>
                </div>
                <div className="text-xl font-bold text-amber-400">
                  {formatNumber(result.totalMaterialCost ?? 0)} ISK
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {formatNumber(result.materialsVolume ?? 0)} m³
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <Coins className="h-4 w-4" />
                  <span className="text-sm">Job Cost</span>
                </div>
                <div className="text-xl font-bold text-blue-400">
                  {formatNumber(result.totalJobCost ?? 0)} ISK
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  SCC: {formatNumber(result.sccSurcharge ?? 0)} ISK
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Time</span>
                </div>
                <div className="text-xl font-bold text-purple-400">
                  {formatDuration(result.time)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {formatDuration(result.timePerUnit)}/unit
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3">Job Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Runs</span>
                    <span>{result.runs}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Units</span>
                    <span>{result.units} ({result.unitsPerRun}/run)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">ME/TE</span>
                    <span>{result.me}/{result.te}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Est. Item Value</span>
                    <span>{formatNumber(result.estimatedItemValue ?? 0)} ISK</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3">Cost Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">System Cost Index</span>
                    <span>{formatNumber(result.systemCostIndex ?? 0)} ISK</span>
                  </div>
                  {(result.systemCostBonuses ?? 0) !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">System Bonuses</span>
                      <span className="text-green-400">{formatNumber(result.systemCostBonuses ?? 0)} ISK</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Facility Tax</span>
                    <span>{formatNumber(result.facilityTax ?? 0)} ISK</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">SCC Surcharge</span>
                    <span>{formatNumber(result.sccSurcharge ?? 0)} ISK</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h4 className="text-sm font-medium text-slate-300 mb-3">Materials ({materials.length})</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-2 pr-4">Material</th>
                      <th className="pb-2 pr-4 text-right">Quantity</th>
                      <th className="pb-2 pr-4 text-right">Unit Price</th>
                      <th className="pb-2 pr-4 text-right">Volume</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((mat) => (
                      <tr key={mat.type_id} className="border-b border-slate-700/50">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <TypeIcon typeId={mat.type_id} size="sm" />
                            <span>{mat.type_name}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {mat.quantity.toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-slate-400">
                          {formatNumber(mat.cost_per_unit)} ISK
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-slate-400">
                          {formatNumber(mat.volume)} m³
                        </td>
                        <td className="py-2 text-right tabular-nums text-amber-400">
                          {formatNumber(mat.cost)} ISK
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-medium">
                      <td className="pt-2">Total</td>
                      <td className="pt-2 text-right"></td>
                      <td className="pt-2 text-right"></td>
                      <td className="pt-2 text-right tabular-nums">
                        {formatNumber(result.materialsVolume ?? 0)} m³
                      </td>
                      <td className="pt-2 text-right tabular-nums text-amber-400">
                        {formatNumber(result.totalMaterialCost ?? 0)} ISK
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {!result && !error && (
          <div className="flex items-center justify-center h-64 text-slate-400">
            Enter a Product Type ID and click Calculate to see manufacturing costs
          </div>
        )}
      </div>
    </div>
  )
}
