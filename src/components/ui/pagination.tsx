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
  return (
    <div className="flex items-center justify-between px-2 py-2 text-sm">
      <span className="text-content-secondary">
        {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalItems)} of{' '}
        {totalItems}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(0)}
          disabled={page === 0}
          className={BTN_CLASS}
        >
          First
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className={BTN_CLASS}
        >
          Prev
        </button>
        <span className="px-2 py-1 text-content-secondary">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className={BTN_CLASS}
        >
          Next
        </button>
        <button
          onClick={() => onPageChange(totalPages - 1)}
          disabled={page >= totalPages - 1}
          className={BTN_CLASS}
        >
          Last
        </button>
      </div>
    </div>
  )
}
