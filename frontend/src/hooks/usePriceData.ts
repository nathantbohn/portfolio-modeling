import { useState, useEffect } from 'react'
import type { PriceData } from '../types'

export interface PriceDataState {
  data: PriceData | null
  loading: boolean
  error: string | null
}

const API_URL = import.meta.env.VITE_API_URL as string | undefined

/**
 * Fetches all price data on mount and caches it.
 * When VITE_API_URL is set, fetches from the backend API.
 * Otherwise falls back to the static JSON file.
 */
export function usePriceData(): PriceDataState {
  const [state, setState] = useState<PriceDataState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const controller = new AbortController()
    const url = API_URL ? `${API_URL}/prices` : '/data/prices.json'

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load price data: HTTP ${res.status}`)
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
  }, [])

  return state
}
