import { useState } from 'react'
import { BuybackForm } from '../buyback/BuybackForm'
import { Calculator } from '../buyback/Calculator'

export function CalculatorTab() {
  const [result, setResult] = useState<BuybackCalculatorResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (text: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await window.electronAPI!.refBuybackCalculator(text)
      if (res.error) {
        setError(res.error)
        setResult(null)
      } else {
        setResult(res)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setResult(null)
    setError(null)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="mb-2 text-2xl font-bold text-white">Price Calculator</h1>
        <p className="text-slate-400">
          Look up Jita buy and sell prices for any EVE items.
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
          <BuybackForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            hasQuote={!!result}
            onReset={handleReset}
            submitLabel="Calculate"
            resetLabel="New calculation"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
            {error}
          </div>
        )}

        {!error && result && <Calculator result={result} />}
      </div>
    </div>
  )
}
