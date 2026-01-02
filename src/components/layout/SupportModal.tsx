import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DiscordIcon } from '@/components/ui/icons'
import { CopyButton } from '@/components/ui/copy-button'

interface SupportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
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
            ECT EVE Assets is free and open source. Here's how you can support
            the project:
          </p>

          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-tertiary/30 p-3">
              <h3 className="font-medium text-content mb-1">Spread the Word</h3>
              <p className="text-content-muted">
                Tell your corp mates and friends about ECT EVE Assets!
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface-tertiary/30 p-3">
              <h3 className="font-medium text-content mb-1">
                Join Our Community
              </h3>
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
              <CopyButton
                text="ECTrade"
                showValue
                className="rounded bg-surface-tertiary px-2 py-1 font-mono text-accent hover:bg-surface-tertiary/70 transition-colors"
              />
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
