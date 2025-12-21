import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, Send, Loader2 } from 'lucide-react'

interface BugReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BugReportModal({ open, onOpenChange }: BugReportModalProps) {
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
      setError(
        'Failed to submit bug report. Please try again or report on Discord directly.'
      )
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
          <DialogTitle>Report A Bug</DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-status-positive/30 bg-status-positive/10 p-4 text-center">
              <p className="text-status-positive font-medium">
                Bug report submitted!
              </p>
              <p className="text-content-secondary mt-1">
                Thank you for helping improve ECT EVE Assets.
              </p>
            </div>
            <button
              onClick={() => handleClose(false)}
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-sm">
            <div className="rounded-lg border border-semantic-warning/30 bg-semantic-warning/10 p-3">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-semantic-warning shrink-0 mt-0.5" />
                <div className="text-content-secondary">
                  <p className="font-medium text-content mb-1">
                    Privacy Notice
                  </p>
                  <p>
                    This report will be posted to our Discord server. Please
                    avoid including personal information you don't want shared
                    publicly.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-content-secondary mb-1">
                Character Name{' '}
                <span className="text-content-muted">
                  (optional, for follow-up)
                </span>
              </label>
              <input
                type="text"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="Your EVE character name"
                className="w-full rounded-lg border border-border bg-surface-tertiary px-3 py-2 text-content placeholder:text-content-muted focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-content-secondary mb-1">
                Bug Description <span className="text-semantic-danger">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please describe what happened, what you expected, and steps to reproduce..."
                rows={5}
                required
                className="w-full rounded-lg border border-border bg-surface-tertiary px-3 py-2 text-content placeholder:text-content-muted focus:border-accent focus:outline-none resize-none"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-semantic-danger/30 bg-semantic-danger/10 p-3 text-semantic-danger text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !description.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Report
                </>
              )}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
