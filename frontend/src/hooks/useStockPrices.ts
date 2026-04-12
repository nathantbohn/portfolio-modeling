import { useState, useEffect, useRef } from 'react'
import type { PricePoint } from '../types'

const API_URL = import.meta.env.VITE_API_URL as string | undefined

/**
 * Fetches individual stock price data on demand for custom fund constituents.
 * Caches results and only fetches new tickers as they appear.
 */
export function useStockPrices(tickers: string[]): {
  data: Record<string, PricePoint[]>
  loading: boolean
} {
  const [data, setData] = useState<Record<string, PricePoint[]>>({})
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef<Set<string>>(new Set())
  const inFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!API_URL) return

    const toFetch = tickers.filter(
      (t) => !fetchedRef.current.has(t) && !inFlightRef.current.has(t),
    )
    if (toFetch.length === 0) return

    setLoading(true)
    for (const t of toFetch) inFlightRef.current.add(t)

    Promise.all(
      toFetch.map((ticker) =>
        fetch(`${API_URL}/prices/${ticker}`)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json() as Promise<PricePoint[]>
          })
          .then((points) => ({ ticker, points, ok: true as const }))
          .catch(() => ({ ticker, points: [] as PricePoint[], ok: false as const })),
      ),
    ).then((results) => {
      const newData: Record<string, PricePoint[]> = {}
      for (const r of results) {
        inFlightRef.current.delete(r.ticker)
        if (r.ok && r.points.length > 0) {
          fetchedRef.current.add(r.ticker)
          newData[r.ticker] = r.points
        }
      }
      if (Object.keys(newData).length > 0) {
        setData((prev) => ({ ...prev, ...newData }))
      }
      setLoading(false)
    })
  }, [tickers])

  return { data, loading }
}
