import { useState, useEffect } from 'react'
import type { PriceData } from '../types'

export interface PriceDataState {
  data: PriceData | null
  loading: boolean
  error: string | null
}

/**
 * Fetches all price data from the FastAPI backend on mount and caches it.
 * The data shape is: Record<ticker, {date, adjusted_close, close}[]>
 * Sorted chronologically by the backend.
 */
export function usePriceData(): PriceDataState {
  const [state, setState] = useState<PriceDataState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/prices', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: HTTP ${res.status}`)
        return res.json() as Promise<PriceData>
      })
      .then((data) => {
        setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setState({ data: null, loading: false, error: String(err) })
      })

    return () => controller.abort()
  }, []) // fetch once on mount; price data is stable for the session

  return state
}
