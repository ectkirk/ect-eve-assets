import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { getPublicContractBids } from '@/api/endpoints'
import { logger } from '@/lib/logger'
import { createLRUCache } from '@/lib/lru-cache'

export interface ContractBid {
  amount: number
  bidId: number
  dateBid: string
}

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_SIZE = 100

const bidsCache = createLRUCache<number, ContractBid[]>(
  CACHE_TTL_MS,
  MAX_CACHE_SIZE
)

async function fetchBidsForContract(
  contractId: number
): Promise<ContractBid[]> {
  const cached = bidsCache.get(contractId)
  if (cached) return cached

  logger.debug('Fetching contract bids', { module: 'ESI', contractId })
  const esiBids = await getPublicContractBids(contractId)
  const resolved: ContractBid[] = esiBids.map((bid) => ({
    amount: bid.amount,
    bidId: bid.bid_id,
    dateBid: bid.date_bid,
  }))
  resolved.sort((a, b) => b.amount - a.amount)
  bidsCache.set(contractId, resolved)
  logger.debug('Fetched contract bids', {
    module: 'ESI',
    contractId,
    bidCount: resolved.length,
  })
  return resolved
}

export function useContractBids() {
  const [bids, setBids] = useState<ContractBid[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBids = useCallback(async (contractId: number) => {
    const cached = bidsCache.get(contractId)
    if (cached) {
      setBids(cached)
      return cached
    }

    setLoading(true)
    setError(null)

    try {
      const resolved = await fetchBidsForContract(contractId)
      setBids(resolved)
      return resolved
    } catch (err) {
      setError(getErrorMessage(err))
      setBids(null)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setBids(null)
    setError(null)
    setLoading(false)
  }, [])

  return { bids, loading, error, fetchBids, reset }
}

export function useAuctionBids(auctionContractIds: number[]) {
  const [state, setState] = useState<{
    key: string
    data: Map<number, number>
    loading: boolean
  }>({ key: '', data: new Map(), loading: false })
  const fetchedRef = useRef<Set<number>>(new Set())
  const abortRef = useRef<AbortController | null>(null)

  const idsKey = useMemo(
    () => auctionContractIds.slice().sort().join(','),
    [auctionContractIds]
  )

  const highestBids = useMemo(() => {
    if (state.key !== idsKey) {
      return new Map<number, number>()
    }
    return state.data
  }, [state, idsKey])

  useEffect(() => {
    if (auctionContractIds.length === 0) return

    if (state.key !== idsKey) {
      fetchedRef.current.clear()
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const fetchAll = async () => {
      const cachedResults: { contractId: number; highestBid: number }[] = []
      const toFetch: number[] = []

      for (const id of auctionContractIds) {
        if (fetchedRef.current.has(id)) continue
        const cached = bidsCache.get(id)
        if (cached) {
          const highestBid = cached[0]?.amount
          if (highestBid != null) {
            cachedResults.push({ contractId: id, highestBid })
          }
          fetchedRef.current.add(id)
        } else {
          toFetch.push(id)
        }
      }

      if (controller.signal.aborted) return

      if (cachedResults.length > 0 && toFetch.length === 0) {
        setState((prev) => {
          const next = new Map(prev.key === idsKey ? prev.data : new Map())
          for (const { contractId, highestBid } of cachedResults) {
            next.set(contractId, highestBid)
          }
          return { key: idsKey, data: next, loading: false }
        })
        return
      }

      if (toFetch.length === 0) return

      logger.debug('Fetching bids for auctions', {
        module: 'ESI',
        count: toFetch.length,
      })

      setState((prev) => ({ ...prev, loading: true }))

      const results = await Promise.all(
        toFetch.map(async (contractId) => {
          try {
            const bids = await fetchBidsForContract(contractId)
            return { contractId, highestBid: bids[0]?.amount ?? null }
          } catch {
            return { contractId, highestBid: null }
          }
        })
      )

      if (controller.signal.aborted) return

      setState((prev) => {
        const next = new Map(prev.key === idsKey ? prev.data : new Map())
        for (const { contractId, highestBid } of [
          ...cachedResults,
          ...results,
        ]) {
          if (highestBid != null) {
            next.set(contractId, highestBid)
          }
          fetchedRef.current.add(contractId)
        }
        return { key: idsKey, data: next, loading: false }
      })
    }

    fetchAll().catch((err) => {
      if (!controller.signal.aborted) {
        logger.error('Failed to fetch auction bids', err, {
          module: 'useContractBids',
        })
      }
    })

    return () => {
      controller.abort()
    }
  }, [idsKey, auctionContractIds, state.key])

  return { highestBids, loading: state.loading }
}
