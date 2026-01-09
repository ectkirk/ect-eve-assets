import { useTranslation } from 'react-i18next'

const BTN_CLASS =
  'px-2 py-1 rounded hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed'

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const { t } = useTranslation('common')
  const start = page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between px-2 py-2 text-sm">
      <span className="text-content-secondary">
        {t('pagination.range', { start, end, total: totalItems })}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(0)}
          disabled={page === 0}
          className={BTN_CLASS}
        >
          {t('pagination.first')}
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className={BTN_CLASS}
        >
          {t('pagination.prev')}
        </button>
        <span className="px-2 py-1 text-content-secondary">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className={BTN_CLASS}
        >
          {t('pagination.next')}
        </button>
        <button
          onClick={() => onPageChange(totalPages - 1)}
          disabled={page >= totalPages - 1}
          className={BTN_CLASS}
        >
          {t('pagination.last')}
        </button>
      </div>
    </div>
  )
}
