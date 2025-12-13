import type { ReactElement } from 'react'
import { Loader2 } from 'lucide-react'

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
        <p className="text-slate-400">
          No characters logged in. Add a character to view {dataType}.
        </p>
      </div>
    )
  }

  if (customEmptyCheck?.condition) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">{customEmptyCheck.message}</p>
      </div>
    )
  }

  if (!initialized || (isUpdating && !hasData)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
          <p className="mt-2 text-slate-400">Loading {dataType}...</p>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {updateError ? (
            <>
              <p className="text-red-500">Failed to load {dataType}</p>
              <p className="text-sm text-slate-400 mb-4">{updateError}</p>
            </>
          ) : (
            <p className="text-slate-400">
              No {dataType} loaded. Use the Update button in the header to fetch from ESI.
            </p>
          )}
        </div>
      </div>
    )
  }

  return null
}
