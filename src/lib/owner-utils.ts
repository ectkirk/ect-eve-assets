import type { Owner } from '@/store/auth-store'

export function ownerEndpoint(owner: Owner, resource: string): string {
  return owner.type === 'corporation'
    ? `/corporations/${owner.id}/${resource}`
    : `/characters/${owner.characterId}/${resource}`
}
