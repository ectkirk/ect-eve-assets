import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertBox } from '@/components/ui/alert-box'
import { Send, Loader2 } from 'lucide-react'

interface BugReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BugReportModal({ open, onOpenChange }: BugReportModalProps) {
  const { t } = useTranslation('dialogs')
  const { t: tc } = useTranslation('common')
  const [characterName, setCharacterName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      const result = await window.electronAPI?.submitBugReport(
        characterName,
        description
      )
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to submit report')
      }
      setSubmitted(true)
      setCharacterName('')
      setDescription('')
    } catch {
      setError(t('bugReport.submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setSubmitted(false)
      setError(null)
    }
    onOpenChange(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('bugReport.title')}</DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-status-positive/30 bg-status-positive/10 p-4 text-center">
              <p className="text-status-positive font-medium">
                {t('bugReport.submitted')}
              </p>
              <p className="text-content-secondary mt-1">
                {t('bugReport.submittedDesc')}
              </p>
            </div>
            <button
              onClick={() => handleClose(false)}
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              {tc('buttons.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-sm">
            <AlertBox
              variant="warning"
              title={t('bugReport.privacyNotice')}
              className="p-3"
            >
              {t('bugReport.privacyDesc')}
            </AlertBox>

            <div>
              <label className="block text-content-secondary mb-1">
                {t('bugReport.characterName')}
              </label>
              <input
                type="text"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder={t('bugReport.characterPlaceholder')}
                className="w-full rounded-lg border border-border bg-surface-tertiary px-3 py-2 text-content placeholder:text-content-muted focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-content-secondary mb-1">
                {t('bugReport.description')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('bugReport.descriptionPlaceholder')}
                rows={5}
                required
                className="w-full rounded-lg border border-border bg-surface-tertiary px-3 py-2 text-content placeholder:text-content-muted focus:border-accent focus:outline-none resize-none"
              />
            </div>

            {error && (
              <AlertBox variant="danger" showIcon={false} className="p-3">
                <p className="text-semantic-danger text-center">{error}</p>
              </AlertBox>
            )}

            <button
              type="submit"
              disabled={submitting || !description.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tc('status.submitting')}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {t('bugReport.submitButton')}
                </>
              )}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
