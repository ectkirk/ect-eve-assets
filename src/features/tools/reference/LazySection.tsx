import { useState, useCallback, useMemo, useRef, ReactNode } from 'react'
import { ChevronRight, ChevronDown, Loader2, CircleAlert } from 'lucide-react'

interface LazySectionProps<T> {
  title: string
  typeId: number
  fetcher: (typeId: number) => Promise<T>
  hasData: (data: T) => boolean
  children: (data: T) => ReactNode
}

interface LazySectionState<T> {
  typeId: number
  isOpen: boolean
  data: T | null
  loading: boolean
  error: string | null
}

export function LazySection<T>({
  title,
  typeId,
  fetcher,
  hasData,
  children,
}: LazySectionProps<T>) {
  const [sectionState, setSectionState] = useState<LazySectionState<T>>({
    typeId,
    isOpen: false,
    data: null,
    loading: false,
    error: null,
  })
  const currentTypeIdRef = useRef(typeId)
  currentTypeIdRef.current = typeId

  const currentState = useMemo(
    () =>
      sectionState.typeId === typeId
        ? sectionState
        : {
            typeId,
            isOpen: false,
            data: null,
            loading: false,
            error: null,
          },
    [sectionState, typeId]
  )
  const { isOpen, data, loading, error } = currentState

  const handleToggle = useCallback(async () => {
    if (isOpen) {
      setSectionState({ ...currentState, isOpen: false })
      return
    }

    setSectionState({ ...currentState, isOpen: true })

    if (data !== null) return

    const fetchTypeId = typeId
    setSectionState({
      ...currentState,
      isOpen: true,
      loading: true,
      error: null,
    })

    try {
      const result = await fetcher(fetchTypeId)
      if (currentTypeIdRef.current !== fetchTypeId) return

      const errorResult = result as { error?: string }
      if (errorResult.error) {
        setSectionState((state) => ({
          ...(state.typeId === fetchTypeId ? state : currentState),
          typeId: fetchTypeId,
          error: errorResult.error ?? null,
          loading: false,
        }))
      } else {
        setSectionState((state) => ({
          ...(state.typeId === fetchTypeId ? state : currentState),
          typeId: fetchTypeId,
          data: result,
          loading: false,
          error: null,
        }))
      }
    } catch (err) {
      if (currentTypeIdRef.current !== fetchTypeId) return
      setSectionState((state) => ({
        ...(state.typeId === fetchTypeId ? state : currentState),
        typeId: fetchTypeId,
        error: String(err),
        loading: false,
      }))
    } finally {
      if (currentTypeIdRef.current === fetchTypeId) {
        setSectionState((state) => ({
          ...(state.typeId === fetchTypeId ? state : currentState),
          typeId: fetchTypeId,
          loading: false,
        }))
      }
    }
  }, [isOpen, data, fetcher, typeId, currentState])

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
              <CircleAlert className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
          {data && !error && children(data)}
        </div>
      )}
    </section>
  )
}
