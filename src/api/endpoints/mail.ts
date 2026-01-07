import { esi } from '../esi'
import { ESIMailHeaderSchema, ESIMailBodySchema } from '../schemas'
import { z } from 'zod'

export type ESIMailHeader = z.infer<typeof ESIMailHeaderSchema>
export type ESIMailBody = z.infer<typeof ESIMailBodySchema>

export async function getCharacterMail(
  characterId: number,
  lastMailId?: number
): Promise<ESIMailHeader[]> {
  const params = lastMailId ? `?last_mail_id=${lastMailId}` : ''
  return esi.fetch<ESIMailHeader[]>(
    `/characters/${characterId}/mail${params}`,
    {
      characterId,
      schema: z.array(ESIMailHeaderSchema),
    }
  )
}
