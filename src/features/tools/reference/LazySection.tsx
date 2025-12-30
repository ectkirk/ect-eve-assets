import { useState, useCallback, useEffect, useRef, ReactNode } from 'react'
import { ChevronRight, ChevronDown, Loader2, AlertCircle } from 'lucide-react'

interface LazySectionProps<T> {
  title: string
  typeId: number
  fetcher: (typeId: number) => Promise<T>
  hasData: (data: T) => boolean
  children: (data: T) => ReactNode
}

export function LazySection<T>({
  title,
  typeId,
  fetcher,
  hasData,
  children,
}: LazySectionProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentTypeIdRef = useRef(typeId)

  useEffect(() => {
    currentTypeIdRef.current = typeId
    setIsOpen(false)
    setData(null)
    setLoading(false)
    setError(null)
  }, [typeId])

  const handleToggle = useCallback(async () => {
    if (isOpen) {
      setIsOpen(false)
      return
    }

    setIsOpen(true)

    if (data !== null) return

    const fetchTypeId = typeId
    setLoading(true)
    setError(null)

    try {
      const result = await fetcher(fetchTypeId)
      if (currentTypeIdRef.current !== fetchTypeId) return

      const errorResult = result as { error?: string }
      if (errorResult.error) {
        setError(errorResult.error)
      } else {
        setData(result)
      }
    } catch (err) {
      if (currentTypeIdRef.current !== fetchTypeId) return
      setError(String(err))
    } finally {
      if (currentTypeIdRef.current === fetchTypeId) {
        setLoading(false)
      }
    }
  }, [isOpen, data, fetcher, typeId])

  if (data !== null && !hasData(data)) {
    return null
  }

  return (
    <section className="rounded-lg border border-border bg-surface-secondary">
      <button
        onClick={handleToggle}
        className="flex w-full items-center gap-2 p-4 text-left transition-colors hover:bg-surface-tertiary"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-content-secondary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-content-secondary" />
        )}
        <h3 className="font-semibold text-content">{title}</h3>
        {loading && (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-accent" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-border p-4">
          {loading && !data && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-status-error">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
          {data && !error && children(data)}
        </div>
      )}
    </section>
  )
}
