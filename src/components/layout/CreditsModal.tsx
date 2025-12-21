import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

interface CreditsModalProps {
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

interface CreditRowProps {
  name: string
  nameHref?: string
  role: string
  discordHref?: string
  discordTitle?: string
}

function CreditRow({
  name,
  nameHref,
  role,
  discordHref,
  discordTitle,
}: CreditRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div className="w-32">
          {nameHref ? (
            <a
              href={nameHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              {name}
            </a>
          ) : (
            <span className="font-medium text-content">{name}</span>
          )}
        </div>
        <span className="text-content-muted">{role}</span>
      </div>
      {discordHref && (
        <a
          href={discordHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-content-secondary hover:text-[#5865F2] transition-colors"
          title={discordTitle}
        >
          <DiscordIcon className="h-5 w-5" />
        </a>
      )}
    </div>
  )
}

export function CreditsModal({ open, onOpenChange }: CreditsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Credits</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4 text-sm">
            <div className="divide-y divide-border">
              <CreditRow
                name="Kirk"
                nameHref="https://edencom.net"
                role="Author"
                discordHref="https://discord.gg/dexSsJYYbv"
                discordTitle="EC Trade Discord"
              />
              <CreditRow
                name="Ahbazon Prime"
                nameHref="https://ahbazon.com/"
                role="Infrastructure & Emotional Support"
                discordHref="https://discord.gg/q8Q6dN9MDF"
                discordTitle="Ahbazon Prime Discord"
              />
              <CreditRow
                name="Nicolas Kion"
                nameHref="https://mutamarket.com"
                role="Abyssal Module Pricing"
                discordHref="https://discord.gg/FuwdBZ5cXq"
                discordTitle="Abyssal Trading Discord"
              />
              <CreditRow
                name="EVE Online"
                nameHref="https://www.eveonline.com/"
                role="Game & ESI API"
                discordHref="https://discord.com/invite/eveonline"
                discordTitle="EVE Online Discord"
              />
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-medium text-content mb-2">
                Special Mentions
              </h3>
              <p className="text-content-muted mb-2">
                Community contributors that made this project possible:
              </p>
              <div className="divide-y divide-border">
                <CreditRow
                  name="Squizz"
                  nameHref="https://github.com/zKillboard/zKillboard"
                  role="zKillboard"
                  discordHref="https://discord.gg/sV2kkwg8UD"
                  discordTitle="zKillboard Discord"
                />
                <CreditRow
                  name="Kenn"
                  nameHref="https://everef.net/"
                  role="EVE Ref"
                  discordHref="https://discord.com/invite/fZYPAxFyXG"
                  discordTitle="EVE Ref Discord"
                />
                <CreditRow
                  name="Golden Gnu"
                  nameHref="https://eve.nikr.net/jeveasset"
                  role="jEveAssets"
                  discordHref="https://discord.gg/8kYZvbM"
                  discordTitle="jEveAssets Discord"
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-medium text-content mb-2">Data Sources</h3>
              <p className="text-content-muted">
                Character and asset data from{' '}
                <a
                  href="https://developers.eveonline.com/api-explorer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  ESI
                </a>
                . Market prices and reference data from{' '}
                <a
                  href="https://edencom.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  edencom.net
                </a>{' '}
                (ESI +{' '}
                <a
                  href="https://developers.eveonline.com/static-data"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  SDE
                </a>
                ). Abyssal module data from{' '}
                <a
                  href="https://mutamarket.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  mutamarket.com
                </a>{' '}
                (ESI). No other external sources.
              </p>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-medium text-content mb-2">Open Source</h3>
              <p className="text-content-muted">
                This project is open source on{' '}
                <a
                  href="https://github.com/ectkirk/ect-eve-assets"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  GitHub
                </a>
                . Built with Electron, React, TypeScript, Vite, Tailwind CSS,
                shadcn/ui, Radix UI, Zustand, TanStack Table, TanStack Query.
              </p>
            </div>

            <p className="text-xs text-content-muted pt-2">
              EVE Online and the EVE logo are trademarks of{' '}
              <a
                href="https://www.ccpgames.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                CCP hf
              </a>
              . CCP does not endorse this project.
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
