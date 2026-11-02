import { useTranslation } from 'react-i18next'
import { ResizeHandle } from './resize-handle'

export const MIN_COLUMN_WIDTH = 40

interface ColumnResizeHandleProps {
  onResizeStart: () => number
  onResize: (width: number) => void
  onResizeEnd: () => void
  onReset: () => void
}

export function ColumnResizeHandle(props: ColumnResizeHandleProps) {
  const { t } = useTranslation('common')
  return (
    <ResizeHandle
      {...props}
      minWidth={MIN_COLUMN_WIDTH}
      label={t('accessibility.resizeColumn')}
    />
  )
}
