import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { CharacterPortrait } from '@/components/ui/type-icon'
import { ESIErrorDisplay } from '@/components/ui/esi-error-display'
import { type ESIMailBody } from '@/api/endpoints/mail'
import { useMailStore } from '@/store/mail-store'
import { formatDateTime } from '@/lib/utils'
import { sanitizeMailBody } from '@/features/tools/reference/eve-text-utils'
import { NO_SUBJECT, type MergedMail } from './MailTab'

interface MailDetailModalProps {
  mail: MergedMail
  onClose: () => void
}

export function MailDetailModal({ mail, onClose }: MailDetailModalProps) {
  const getMailBody = useMailStore((s) => s.getMailBody)
  const [result, setResult] = useState<{
    mailId: number
    body?: ESIMailBody
    error?: string
  } | null>(null)

  const loading = !result || result.mailId !== mail.mail.mail_id
  const body = result?.mailId === mail.mail.mail_id ? result.body : undefined
  const error = result?.mailId === mail.mail.mail_id ? result.error : undefined

  useEffect(() => {
    let cancelled = false

    getMailBody(mail.characterId, mail.mail.mail_id)
      .then((data) => {
        if (!cancelled) setResult({ mailId: mail.mail.mail_id, body: data })
      })
      .catch((err) => {
        if (!cancelled)
          setResult({
            mailId: mail.mail.mail_id,
            error: err.message ?? 'Failed to load mail',
          })
      })

    return () => {
      cancelled = true
    }
  }, [mail.characterId, mail.mail.mail_id, getMailBody])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/50 bg-surface-secondary px-4 py-3">
          <div className="flex items-center gap-3">
            <CharacterPortrait
              characterId={mail.mail.from ?? mail.characterId}
              size="lg"
            />
            <div>
              <h2 className="text-lg font-medium text-content">
                {mail.mail.subject || NO_SUBJECT}
              </h2>
              <div className="text-sm text-content-secondary">
                <span>From: {mail.fromName}</span>
                <span className="mx-2 text-content-muted">→</span>
                <span>To: {mail.toNames}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-content-muted hover:bg-surface-tertiary hover:text-content"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-border/50 px-4 py-2 text-sm text-content-secondary">
          {formatDateTime(mail.mail.timestamp)}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-content-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading mail content...
            </div>
          ) : error ? (
            <div className="py-4">
              <ESIErrorDisplay error={error} context="mail content" />
            </div>
          ) : body ? (
            <MailBodyContent body={body.body ?? ''} />
          ) : (
            <div className="py-4 text-content-muted">No content</div>
          )}
        </div>
      </div>
    </div>
  )
}

function MailBodyContent({ body }: { body: string }) {
  return (
    <div
      className="prose prose-sm prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: sanitizeMailBody(body) }}
    />
  )
}
