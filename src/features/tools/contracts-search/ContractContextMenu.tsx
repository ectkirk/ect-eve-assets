import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { SearchContract } from './types'

interface ContractContextMenuProps {
  x: number
  y: number
  contract: SearchContract
  onViewContract: (contract: SearchContract) => void
  onClose: () => void
}

export function ContractContextMenu({
  x,
  y,
  contract,
  onViewContract,
  onClose,
}: ContractContextMenuProps) {
  const { t } = useTranslation('tools')

  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [onClose])

  return (
    <div
      className="fixed z-50 rounded border border-border bg-surface-secondary py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      <button
        className="w-full px-4 py-1.5 text-left text-sm hover:bg-surface-tertiary"
        onClick={() => {
          onViewContract(contract)
          onClose()
        }}
      >
        {t('contractsSearch.viewContract')}
      </button>
    </div>
  )
}
