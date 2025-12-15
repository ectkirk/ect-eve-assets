import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Check, Copy } from 'lucide-react'

interface SupportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded bg-surface-tertiary px-2 py-1 font-mono text-accent hover:bg-surface-tertiary/70 transition-colors"
    >
      {text}
      {copied ? <Check className="h-3.5 w-3.5 text-semantic-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export function SupportModal({ open, onOpenChange }: SupportModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Support Us</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-content-secondary">
            ECT EVE Assets is free and open source. Here's how you can support the project:
          </p>

          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-tertiary/30 p-3">
              <h3 className="font-medium text-content mb-1">Spread the Word</h3>
              <p className="text-content-muted">
                Tell your corp mates and friends about ECT EVE Assets!
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface-tertiary/30 p-3">
              <h3 className="font-medium text-content mb-1">Join Our Community</h3>
              <a
                href="https://discord.gg/dexSsJYYbv"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-content-muted hover:text-[#5865F2] transition-colors"
              >
                <DiscordIcon className="h-5 w-5" />
                EC Trade Discord
              </a>
            </div>

            <div className="rounded-lg border border-border bg-surface-tertiary/30 p-3">
              <h3 className="font-medium text-content mb-1">Send ISK</h3>
              <p className="text-content-muted mb-2">
                In-game donations are always appreciated:
              </p>
              <CopyButton text="ECTrade" />
            </div>

            <div className="rounded-lg border border-border bg-surface-tertiary/30 p-3">
              <h3 className="font-medium text-content mb-1">Express Delivery</h3>
              <p className="text-content-muted">
                Load a shuttle with Large Skill Injectors and autopilot through Ahbazon when <CopyButton text="EnatKinu" /> is online. We'll take care of the rest. Don't forget to fill out the{' '}
                <a
                  href="https://edencom.net/survey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  survey
                </a>{' '}
                once done.
              </p>
            </div>
          </div>

          <p className="text-center text-content-muted pt-2">
            Thank you for using ECT EVE Assets! o7
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
