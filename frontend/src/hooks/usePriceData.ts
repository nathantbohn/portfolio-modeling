import { useState, useEffect } from 'react'
import type { PriceData } from '../types'
import { priceStore } from '../utils/dataAccess'

export interface PriceDataState {
  data: PriceData | null
  loading: boolean
  error: string | null
}

/**
 * Loads base price data (ETFs, mutual funds, DIA, McMerica 25 and its
 * constituents) from the static prices.json served with the frontend.
 * Never contacts the backend: individual stocks are fetched on demand through
 * the price store when a user adds them to a custom fund.
 */
export function usePriceData(): PriceDataState {
  const [state, setState] = useState<PriceDataState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let active = true
    priceStore.loadStatic().then(
      (data) => {
        if (active) setState({ data, loading: false, error: null })
      },
      (err: unknown) => {
        if (active) setState({ data: null, loading: false, error: String(err) })
      },
    )
    return () => {
      active = false
    }
  }, [])

  return state
}
