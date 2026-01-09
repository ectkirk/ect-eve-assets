import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('common')

  if (!hasOwners) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-content-secondary">
          {t('tab.noCharacters', { dataType })}
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
          <p className="mt-2 text-content-secondary">
            {t('tab.loading', { dataType })}
          </p>
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
            <p className="text-content-secondary">
              {t('tab.noData', { dataType })}
            </p>
          )}
        </div>
      </div>
    )
  }

  return null
}
