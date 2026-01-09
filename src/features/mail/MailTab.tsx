import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useMailStore } from '@/store/mail-store'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { CharacterPanel } from '@/components/ui/character-panel'
import { useTabControls, type MailFilterType } from '@/context'
import { getName, resolveNames } from '@/api/endpoints/universe'
import { type ESIMailHeader } from '@/api/endpoints/mail'
import {
  CharacterMailPanel,
  matchesMailFilter,
  type MergedMail,
} from './CharacterMailPanel'
import { MailDetailModal } from './MailDetailModal'

function countFilteredMails(
  mails: ESIMailHeader[],
  filterType: MailFilterType
): number {
  return mails.filter((mail) => matchesMailFilter(mail, filterType)).length
}

export function MailTab() {
  const { t } = useTranslation('common')
  const ownersRecord = useAuthStore((s) => s.owners)
  const characters = useMemo(
    () => Object.values(ownersRecord).filter((o) => o.type === 'character'),
    [ownersRecord]
  )
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const mailByOwner = useMailStore((s) => s.dataByOwner)
  const isUpdating = useMailStore((s) => s.isUpdating)
  const updateError = useMailStore((s) => s.updateError)
  const init = useMailStore((s) => s.init)
  const update = useMailStore((s) => s.update)
  const initialized = useMailStore((s) => s.initialized)

  const { search, setSearchPlaceholder, setRefreshAction, setMailFilter } =
    useTabControls()

  const [selectedMail, setSelectedMail] = useState<MergedMail | null>(null)
  const [filterType, setFilterType] = useState<MailFilterType>('inbox')
  const [resolvedNames, setResolvedNames] = useState<Map<number, string>>(
    new Map()
  )

  useEffect(() => {
    init().then(() => update())
  }, [init, update])

  const handleRefresh = useCallback(() => {
    update(true)
  }, [update])

  useEffect(() => {
    setSearchPlaceholder(t('search.placeholder'))
    return () => setSearchPlaceholder(null)
  }, [setSearchPlaceholder, t])

  useEffect(() => {
    setRefreshAction({ onRefresh: handleRefresh, isRefreshing: isUpdating })
    return () => setRefreshAction(null)
  }, [setRefreshAction, handleRefresh, isUpdating])

  useEffect(() => {
    setMailFilter({ value: filterType, onChange: setFilterType })
    return () => setMailFilter(null)
  }, [setMailFilter, filterType])

  useEffect(() => {
    const idsToResolve = new Set<number>()
    for (const { mails } of mailByOwner) {
      for (const mail of mails) {
        if (mail.from && !getName(mail.from)) idsToResolve.add(mail.from)
        for (const r of mail.recipients ?? []) {
          if (!getName(r.recipient_id)) idsToResolve.add(r.recipient_id)
        }
      }
    }
    if (idsToResolve.size > 0) {
      resolveNames(Array.from(idsToResolve)).then((resolved) => {
        const newNames = new Map<number, string>()
        for (const [id, data] of resolved) {
          newNames.set(id, data.name)
        }
        setResolvedNames((prev) => new Map([...prev, ...newNames]))
      })
    }
  }, [mailByOwner])

  const filteredMailByOwner = useMemo(
    () =>
      mailByOwner.filter((data) =>
        selectedSet.has(ownerKey(data.owner.type, data.owner.characterId))
      ),
    [mailByOwner, selectedSet]
  )

  const loadingState = TabLoadingState({
    dataType: 'mail',
    initialized,
    isUpdating,
    hasData: mailByOwner.length > 0,
    hasOwners: characters.length > 0,
    updateError,
  })

  if (loadingState) return loadingState

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 gap-4 overflow-x-auto p-1">
        {filteredMailByOwner.map((charData) => (
          <CharacterPanel
            key={charData.owner.characterId}
            characterId={charData.owner.characterId}
            characterName={charData.owner.name}
            subtitle={t('mail.messageCount', {
              count: countFilteredMails(charData.mails, filterType),
            })}
          >
            <CharacterMailPanel
              characterId={charData.owner.characterId}
              mails={charData.mails}
              filter={search}
              filterType={filterType}
              resolvedNames={resolvedNames}
              onSelectMail={setSelectedMail}
            />
          </CharacterPanel>
        ))}
      </div>

      {selectedMail && (
        <MailDetailModal
          mail={selectedMail}
          onClose={() => setSelectedMail(null)}
        />
      )}
    </div>
  )
}

export { NO_SUBJECT } from './CharacterMailPanel'
export type { MergedMail } from './CharacterMailPanel'
