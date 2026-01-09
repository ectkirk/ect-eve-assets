import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown, Mail } from 'lucide-react'
import { type ESIMailHeader } from '@/api/endpoints/mail'
import { CharacterPortrait } from '@/components/ui/type-icon'
import { formatRelativeTime, cn, matchesSearchLower } from '@/lib/utils'
import { getName } from '@/api/endpoints/universe'
import { type MailFilterType } from '@/context'
import { MS_PER_DAY } from '@/lib/timer-utils'

export const LABEL_INBOX = 1
export const LABEL_SENT = 2
export const NO_SUBJECT = '(No Subject)'

export function matchesMailFilter(
  mail: ESIMailHeader,
  filterType: MailFilterType
): boolean {
  const isInbox = mail.labels?.includes(LABEL_INBOX)
  const isSent = mail.labels?.includes(LABEL_SENT)
  if (filterType === 'inbox') return !!isInbox
  if (filterType === 'sent') return !!isSent
  return true
}

interface MergedMail {
  mail: ESIMailHeader
  characterId: number
  fromName: string
  toNames: string
  isSentMail: boolean
}

interface Conversation {
  id: string
  subject: string
  partnerName: string
  partnerId: number
  mails: MergedMail[]
  latestTimestamp: string
  hasUnread: boolean
}

interface TimeGroup {
  label: string
  conversations: Conversation[]
}

export interface CharacterMailPanelProps {
  characterId: number
  mails: ESIMailHeader[]
  filter: string
  filterType: MailFilterType
  resolvedNames: Map<number, string>
  onSelectMail: (mail: MergedMail) => void
}

function normalizeSubject(subject: string | undefined): string {
  if (!subject) return ''
  return subject
    .replace(/^(Re|Fwd|FW):\s*/gi, '')
    .trim()
    .toLowerCase()
}

function getConversationPartnerId(
  mail: ESIMailHeader,
  characterId: number
): number {
  if (mail.from === characterId) {
    return mail.recipients?.[0]?.recipient_id ?? 0
  }
  return mail.from ?? 0
}

type TimeGroupKey = 'today' | 'yesterday' | 'thisWeek' | 'older'

function getTimeGroupKey(timestamp: string): TimeGroupKey {
  const date = new Date(timestamp)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - MS_PER_DAY)
  const weekAgo = new Date(today.getTime() - 7 * MS_PER_DAY)

  if (date >= today) return 'today'
  if (date >= yesterday) return 'yesterday'
  if (date >= weekAgo) return 'thisWeek'
  return 'older'
}

function formatOlderDate(timestamp: string, locale: string): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

export function CharacterMailPanel({
  characterId,
  mails,
  filter,
  filterType,
  resolvedNames,
  onSelectMail,
}: CharacterMailPanelProps) {
  const { t, i18n } = useTranslation('common')
  const [expandedConversations, setExpandedConversations] = useState<
    Set<string>
  >(new Set())

  const toggleConversation = useCallback((id: string) => {
    setExpandedConversations((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const resolveName = useCallback(
    (id: number): string =>
      resolvedNames.get(id) ?? getName(id)?.name ?? t('mail.unknownId', { id }),
    [resolvedNames, t]
  )

  const timeGroups = useMemo((): TimeGroup[] => {
    let filteredMails: MergedMail[] = []

    for (const mail of mails) {
      if (!matchesMailFilter(mail, filterType)) continue

      const isSentMail = mail.from === characterId
      const fromName = mail.from ? resolveName(mail.from) : t('mail.unknown')
      const toNames = isSentMail
        ? (mail.recipients ?? [])
            .map((r) => resolveName(r.recipient_id))
            .join(', ') || t('mail.unknown')
        : ''

      filteredMails.push({
        mail,
        characterId,
        fromName,
        toNames,
        isSentMail,
      })
    }

    if (filter) {
      const filterLower = filter.toLowerCase()
      filteredMails = filteredMails.filter((m) =>
        matchesSearchLower(filterLower, m.mail.subject, m.fromName, m.toNames)
      )
    }

    const conversationMap = new Map<string, Conversation>()

    for (const merged of filteredMails) {
      const partnerId = getConversationPartnerId(merged.mail, characterId)
      const normalizedSubject = normalizeSubject(merged.mail.subject)
      const convKey = `${partnerId}-${normalizedSubject}`

      let conv = conversationMap.get(convKey)
      if (!conv) {
        conv = {
          id: convKey,
          subject: merged.mail.subject || NO_SUBJECT,
          partnerName: resolveName(partnerId),
          partnerId,
          mails: [],
          latestTimestamp: merged.mail.timestamp,
          hasUnread: false,
        }
        conversationMap.set(convKey, conv)
      }

      conv.mails.push(merged)
      if (merged.mail.is_read === false) conv.hasUnread = true
      if (new Date(merged.mail.timestamp) > new Date(conv.latestTimestamp)) {
        conv.latestTimestamp = merged.mail.timestamp
        conv.subject = merged.mail.subject || NO_SUBJECT
      }
    }

    for (const conv of conversationMap.values()) {
      conv.mails.sort(
        (a, b) =>
          new Date(b.mail.timestamp).getTime() -
          new Date(a.mail.timestamp).getTime()
      )
    }

    const conversations = Array.from(conversationMap.values()).sort(
      (a, b) =>
        new Date(b.latestTimestamp).getTime() -
        new Date(a.latestTimestamp).getTime()
    )

    const groupMap = new Map<string, Conversation[]>()
    const groupOrder: string[] = []

    for (const conv of conversations) {
      const groupKey = getTimeGroupKey(conv.latestTimestamp)
      const label =
        groupKey === 'older'
          ? formatOlderDate(conv.latestTimestamp, i18n.language)
          : t(`mail.timeGroup.${groupKey}`)
      if (!groupMap.has(label)) {
        groupMap.set(label, [])
        groupOrder.push(label)
      }
      groupMap.get(label)!.push(conv)
    }

    return groupOrder.map((label) => ({
      label,
      conversations: groupMap.get(label)!,
    }))
  }, [mails, characterId, filter, filterType, resolveName, t, i18n.language])

  if (timeGroups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-content-muted">
        {filter ? t('mail.noMatches') : t('mail.empty')}
      </div>
    )
  }

  return (
    <div className="space-y-2 p-2">
      {timeGroups.map((group) => (
        <div key={group.label}>
          <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-content-muted">
            {group.label}
          </div>
          <div className="space-y-1">
            {group.conversations.map((conv) => {
              const isExpanded = expandedConversations.has(conv.id) || !!filter
              const isSingleMail = conv.mails.length === 1
              const latestMail = conv.mails[0]

              return (
                <div key={conv.id}>
                  <button
                    onClick={() => {
                      if (isSingleMail && latestMail) {
                        onSelectMail(latestMail)
                      } else {
                        toggleConversation(conv.id)
                      }
                    }}
                    className="flex w-full items-center gap-2 rounded bg-surface-tertiary px-2 py-1.5 text-left hover:bg-surface-tertiary/70"
                  >
                    {!isSingleMail && (
                      <ConversationChevron isExpanded={isExpanded} />
                    )}
                    {isSingleMail && (
                      <Mail className="h-4 w-4 shrink-0 text-content-muted" />
                    )}
                    {conv.partnerId > 0 && (
                      <CharacterPortrait
                        characterId={conv.partnerId}
                        size="sm"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            'truncate text-sm',
                            conv.hasUnread && 'font-medium'
                          )}
                        >
                          {conv.subject}
                        </span>
                        {conv.hasUnread && <UnreadDot />}
                        {!isSingleMail && (
                          <span className="shrink-0 text-xs text-content-muted">
                            ({conv.mails.length})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-content-secondary">
                        {conv.partnerName}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-content-muted">
                      {formatRelativeTime(conv.latestTimestamp)}
                    </span>
                  </button>

                  {isExpanded && !isSingleMail && (
                    <div className="mt-1 space-y-1 pl-4">
                      {conv.mails.map((item) => (
                        <button
                          key={item.mail.mail_id}
                          onClick={() => onSelectMail(item)}
                          className="flex w-full items-center gap-2 rounded bg-surface-tertiary/50 px-2 py-1.5 text-left hover:bg-surface-tertiary"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 text-sm">
                              <span
                                className={cn(
                                  'truncate',
                                  item.mail.is_read === false && 'font-medium'
                                )}
                              >
                                {item.mail.subject || NO_SUBJECT}
                              </span>
                              {item.mail.is_read === false && <UnreadDot />}
                            </div>
                            <div className="text-xs text-content-secondary">
                              {item.isSentMail
                                ? t('mail.to', { name: item.toNames })
                                : t('mail.from', { name: item.fromName })}
                            </div>
                          </div>
                          <span className="shrink-0 text-xs text-content-muted">
                            {formatRelativeTime(item.mail.timestamp)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function ConversationChevron({ isExpanded }: { isExpanded: boolean }) {
  const Icon = isExpanded ? ChevronDown : ChevronRight
  return <Icon className="h-4 w-4 shrink-0 text-content-secondary" />
}

function UnreadDot() {
  return <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
}

export type { MergedMail }
