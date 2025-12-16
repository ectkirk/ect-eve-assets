import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ExternalLink } from 'lucide-react'
import changelogData from '@/data/changelog.json'

interface ChangelogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TYPE_STYLES: Record<string, { label: string; color: string }> = {
  feat: { label: 'Feature', color: 'bg-semantic-positive/20 text-semantic-positive' },
  fix: { label: 'Fix', color: 'bg-semantic-danger/20 text-semantic-danger' },
  refactor: { label: 'Refactor', color: 'bg-status-info/20 text-status-info' },
  perf: { label: 'Performance', color: 'bg-semantic-warning/20 text-semantic-warning' },
  docs: { label: 'Docs', color: 'bg-status-special/20 text-status-special' },
  chore: { label: 'Chore', color: 'bg-content-muted/20 text-content-muted' },
}

const DEFAULT_STYLE = { label: 'Change', color: 'bg-content-muted/20 text-content-muted' }

export function ChangelogModal({ open, onOpenChange }: ChangelogModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Changelog
            <span className="text-sm font-normal text-content-secondary">v{changelogData.version}</span>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4 text-sm">
            <div className="flex items-center justify-between text-content-secondary">
              <span>Released {changelogData.date}</span>
            </div>

            <ul className="space-y-2">
              {changelogData.changes.map((change, idx) => {
                const style = TYPE_STYLES[change.type] ?? DEFAULT_STYLE
                return (
                  <li key={idx} className="flex items-start gap-2">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${style.color}`}>
                      {style.label}
                    </span>
                    <span className="text-content-secondary">
                      <span className="text-content-muted">[{change.scope}]</span>{' '}
                      {change.description}
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="border-t border-border pt-4">
              <a
                href="https://edencom.net/ecteveassets/changelog"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-accent hover:underline"
              >
                View full changelog
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
