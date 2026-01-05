import type { ReactElement } from 'react'
import { Loader2 } from 'lucide-react'
import { ESIErrorDisplay } from './esi-error-display'

interface TabLoadingStateProps {
  dataType: string
  initialized: boolean
  isUpdating: boolean
  hasData: boolean
  hasOwners: boolean
  updateError: string | null
  customEmptyCheck?: { condition: boolean; message: string }
}

export function TabLoadingState({
  dataType,
  initialized,
  isUpdating,
  hasData,
  hasOwners,
  updateError,
  customEmptyCheck,
}: TabLoadingStateProps): ReactElement | null {
  if (!hasOwners) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-content-secondary">
          No characters logged in. Add a character to view {dataType}.
        </p>
      </div>
    )
  }

  if (customEmptyCheck?.condition) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-content-secondary">{customEmptyCheck.message}</p>
      </div>
    )
  }

  if (!initialized || (isUpdating && !hasData)) {
    return (
      <div
        className="flex items-center justify-center h-64"
        role="status"
        aria-live="polite"
      >
        <div className="text-center">
          <Loader2
            className="h-8 w-8 animate-spin text-accent mx-auto"
            aria-hidden="true"
          />
          <p className="mt-2 text-content-secondary">Loading {dataType}...</p>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {updateError ? (
            <ESIErrorDisplay error={updateError} context={dataType} />
          ) : (
            <p className="text-content-secondary">No {dataType} found.</p>
          )}
        </div>
      </div>
    )
  }

  return null
}
