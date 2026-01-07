import { createActionStore } from './create-action-store'

interface ContractsSearchAction {
  typeId: number
  typeName: string
}

export const useContractsSearchActionStore = createActionStore<
  ContractsSearchAction,
  'navigateToContracts',
  [number, string]
>('navigateToContracts', (typeId, typeName) => ({ typeId, typeName }))
