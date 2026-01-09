import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  text: string
  label?: string
  className?: string
  showValue?: boolean
}

export function CopyButton({
  text,
  label,
  className,
  showValue = false,
}: CopyButtonProps) {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const Icon = copied ? Check : Copy
  const iconClass = copied ? 'text-status-positive' : ''

  if (showValue) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          'inline-flex items-center gap-1 font-semibold hover:opacity-80',
          className
        )}
        title={t('accessibility.clickToCopy')}
      >
        {text}
        <Icon className={cn('h-3.5 w-3.5', iconClass)} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/20',
        className
      )}
      title={`Copy "${text}"`}
    >
      <Icon className={cn('h-4 w-4', iconClass)} />
      {copied ? t('buttons.copied') : label}
    </button>
  )
}
