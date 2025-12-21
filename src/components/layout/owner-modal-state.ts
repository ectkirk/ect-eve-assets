import type { Owner } from '@/store/auth-store'

export type OwnerModalState = {
  authFlow: 'idle' | 'character' | 'corporation'
  isUpdatingData: boolean
  searchQuery: string
  error: string | null
  ownerToRemove: Owner | null
  showLogoutAllConfirm: boolean
  refreshingRolesOwner: string | null
}

export type OwnerModalAction =
  | { type: 'START_AUTH'; flow: 'character' | 'corporation' }
  | { type: 'END_AUTH' }
  | { type: 'SET_UPDATING'; value: boolean }
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'CONFIRM_REMOVE'; owner: Owner }
  | { type: 'CANCEL_REMOVE' }
  | { type: 'SHOW_LOGOUT_ALL' }
  | { type: 'HIDE_LOGOUT_ALL' }
  | { type: 'SET_REFRESHING_ROLES'; ownerKey: string | null }

export const initialOwnerModalState: OwnerModalState = {
  authFlow: 'idle',
  isUpdatingData: false,
  searchQuery: '',
  error: null,
  ownerToRemove: null,
  showLogoutAllConfirm: false,
  refreshingRolesOwner: null,
}

export function ownerModalReducer(
  state: OwnerModalState,
  action: OwnerModalAction
): OwnerModalState {
  switch (action.type) {
    case 'START_AUTH':
      return { ...state, authFlow: action.flow, error: null }
    case 'END_AUTH':
      return { ...state, authFlow: 'idle' }
    case 'SET_UPDATING':
      return { ...state, isUpdatingData: action.value }
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query }
    case 'SET_ERROR':
      return { ...state, error: action.error }
    case 'CONFIRM_REMOVE':
      return { ...state, ownerToRemove: action.owner }
    case 'CANCEL_REMOVE':
      return { ...state, ownerToRemove: null }
    case 'SHOW_LOGOUT_ALL':
      return { ...state, showLogoutAllConfirm: true }
    case 'HIDE_LOGOUT_ALL':
      return { ...state, showLogoutAllConfirm: false }
    case 'SET_REFRESHING_ROLES':
      return { ...state, refreshingRolesOwner: action.ownerKey }
    default:
      return state
  }
}
