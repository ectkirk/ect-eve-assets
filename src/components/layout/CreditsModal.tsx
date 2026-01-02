import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DiscordIcon } from '@/components/ui/icons'

interface CreditsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
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
