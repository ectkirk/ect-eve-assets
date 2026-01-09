import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('dialogs')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('credits.title')}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4 text-sm">
            <div className="divide-y divide-border">
              <CreditRow
                name="Kirk"
                nameHref="https://edencom.net"
                role={t('credits.author')}
                discordHref="https://discord.gg/dexSsJYYbv"
                discordTitle="EC Trade Discord"
              />
              <CreditRow
                name="Ahbazon Prime"
                nameHref="https://ahbazon.com/"
                role={t('credits.infrastructure')}
                discordHref="https://discord.gg/q8Q6dN9MDF"
                discordTitle="Ahbazon Prime Discord"
              />
              <CreditRow
                name="Nicolas Kion"
                nameHref="https://mutamarket.com"
                role={t('credits.abyssalPricing')}
                discordHref="https://discord.gg/FuwdBZ5cXq"
                discordTitle="Abyssal Trading Discord"
              />
              <CreditRow
                name="EVE Online"
                nameHref="https://www.eveonline.com/"
                role={t('credits.gameApi')}
                discordHref="https://discord.com/invite/eveonline"
                discordTitle="EVE Online Discord"
              />
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-medium text-content mb-2">
                {t('credits.specialMentions')}
              </h3>
              <p className="text-content-muted mb-2">
                {t('credits.specialMentionsDesc')}
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
              <h3 className="font-medium text-content mb-2">
                {t('credits.dataSources')}
              </h3>
              <p className="text-content-muted">
                {t('credits.dataSourcesPrefix')}{' '}
                <a
                  href="https://developers.eveonline.com/api-explorer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  ESI
                </a>
                . {t('credits.dataSourcesMarket')}{' '}
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
                ). {t('credits.dataSourcesAbyssal')}{' '}
                <a
                  href="https://mutamarket.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  mutamarket.com
                </a>{' '}
                (ESI). {t('credits.dataSourcesNoOther')}
              </p>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-medium text-content mb-2">
                {t('credits.openSource')}
              </h3>
              <p className="text-content-muted">
                {t('credits.openSourcePrefix')}{' '}
                <a
                  href="https://github.com/ectkirk/ect-eve-assets"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  GitHub
                </a>
                . {t('credits.openSourceBuiltWith')}
              </p>
            </div>

            <p className="text-xs text-content-muted pt-2">
              {t('credits.legalPrefix')}{' '}
              <a
                href="https://www.ccpgames.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                CCP hf
              </a>
              . {t('credits.legalSuffix')}
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
