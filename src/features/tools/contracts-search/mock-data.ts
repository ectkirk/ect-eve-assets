import type { SearchContract, ContractSearchFilters } from './types'

const MOCK_CONTRACTS: SearchContract[] = [
  {
    contractId: 1001,
    type: 'item_exchange',
    price: 150000000,
    issuerName: 'Trader Joe',
    issuerId: 12345,
    regionName: 'The Forge',
    regionId: 10000002,
    systemName: 'Jita',
    systemId: 30000142,
    securityStatus: 0.9,
    dateIssued: '2025-01-15T10:30:00Z',
    dateExpired: '2025-01-29T10:30:00Z',
    title: 'Fitted Raven Navy Issue',
    itemCount: 15,
  },
  {
    contractId: 1002,
    type: 'item_exchange',
    price: 25000000,
    issuerName: 'Mining Corp',
    issuerId: 12346,
    regionName: 'Domain',
    regionId: 10000043,
    systemName: 'Amarr',
    systemId: 30002187,
    securityStatus: 1.0,
    dateIssued: '2025-01-14T08:00:00Z',
    dateExpired: '2025-01-28T08:00:00Z',
    title: 'Ore Package - 500k m3',
    itemCount: 8,
  },
  {
    contractId: 1003,
    type: 'auction',
    price: 500000000,
    buyout: 750000000,
    issuerName: 'Collector',
    issuerId: 12347,
    regionName: 'The Forge',
    regionId: 10000002,
    systemName: 'Perimeter',
    systemId: 30000144,
    securityStatus: 0.9,
    dateIssued: '2025-01-13T15:00:00Z',
    dateExpired: '2025-01-20T15:00:00Z',
    title: 'Rare BPO Collection',
    itemCount: 3,
  },
  {
    contractId: 1004,
    type: 'courier',
    price: 0,
    reward: 15000000,
    collateral: 1000000000,
    volume: 60000,
    issuerName: 'Logistics Inc',
    issuerId: 12348,
    regionName: 'Sinq Laison',
    regionId: 10000032,
    systemName: 'Dodixie',
    systemId: 30002659,
    securityStatus: 0.9,
    dateIssued: '2025-01-15T12:00:00Z',
    dateExpired: '2025-01-22T12:00:00Z',
    title: 'Dodixie to Jita - 60k m3',
    itemCount: 1,
  },
  {
    contractId: 1005,
    type: 'item_exchange',
    price: 85000000,
    issuerName: 'Module Trader',
    issuerId: 12349,
    regionName: 'Metropolis',
    regionId: 10000042,
    systemName: 'Hek',
    systemId: 30002053,
    securityStatus: 0.5,
    dateIssued: '2025-01-14T20:00:00Z',
    dateExpired: '2025-01-28T20:00:00Z',
    title: 'Deadspace Module Pack',
    itemCount: 12,
  },
]

export function getMockContracts(filters: ContractSearchFilters): {
  contracts: SearchContract[]
  total: number
} {
  let results = [...MOCK_CONTRACTS]

  if (filters.mode === 'courier') {
    results = results.filter((c) => c.type === 'courier')
  } else {
    results = results.filter((c) => c.type !== 'courier')

    switch (filters.contractType) {
      case 'want_to_sell':
        results = results.filter((c) => c.type === 'item_exchange')
        break
      case 'want_to_buy':
        results = results.filter((c) => c.type === 'item_exchange')
        break
      case 'auction':
        results = results.filter((c) => c.type === 'auction')
        break
      case 'exclude_want_to_buy':
        break
    }
  }

  if (filters.searchText) {
    const search = filters.searchText.toLowerCase()
    results = results.filter(
      (c) =>
        c.title.toLowerCase().includes(search) ||
        c.issuerName.toLowerCase().includes(search)
    )
  }

  if (filters.regionId) {
    results = results.filter((c) => c.regionId === filters.regionId)
  }

  if (filters.issuer) {
    const issuerSearch = filters.issuer.toLowerCase()
    results = results.filter((c) =>
      c.issuerName.toLowerCase().includes(issuerSearch)
    )
  }

  const priceMin = filters.priceMin ? parseFloat(filters.priceMin) * 1000000 : 0
  const priceMax = filters.priceMax
    ? parseFloat(filters.priceMax) * 1000000
    : Infinity

  results = results.filter((c) => {
    const price = c.type === 'courier' ? (c.reward ?? 0) : c.price
    return price >= priceMin && price <= priceMax
  })

  if (!filters.securityHigh) {
    results = results.filter((c) => c.securityStatus < 0.5)
  }
  if (!filters.securityLow) {
    results = results.filter(
      (c) => !(c.securityStatus >= 0.0 && c.securityStatus < 0.5)
    )
  }
  if (!filters.securityNull) {
    results = results.filter((c) => c.securityStatus >= 0.0)
  }

  return { contracts: results, total: results.length }
}
