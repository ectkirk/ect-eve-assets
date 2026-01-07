import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ESIErrorDisplayProps {
  error: string | null
  context?: string
  className?: string
}

export function ESIErrorDisplay({
  error,
  context,
  className,
}: ESIErrorDisplayProps) {
  if (!error) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn('flex items-start gap-3', className)}
    >
      <AlertCircle
        className="h-5 w-5 shrink-0 text-semantic-danger"
        aria-hidden="true"
      />
      <div>
        <p className="font-medium text-semantic-danger">
          {context ? `Failed to load ${context}` : 'An error occurred'}
        </p>
        <p className="mt-1 text-sm text-content-secondary">{error}</p>
      </div>
    </div>
  )
}
