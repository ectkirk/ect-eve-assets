import { ESICustomsOfficeSchema } from '../schemas'
import { z } from 'zod'

export type ESICustomsOffice = z.infer<typeof ESICustomsOfficeSchema>
