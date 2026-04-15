import { useState, useEffect, useRef, useCallback } from 'react'
import type { PricePoint } from '../types'

const API_URL = import.meta.env.VITE_API_URL as string | undefined
const TIMEOUT_MS = 45_000

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

/**
 * Fetches individual stock price data on demand for custom fund constituents.
 * Caches results and only fetches new tickers as they appear.
 * Tracks error state per-ticker with retry capability.
 */
export function useStockPrices(tickers: string[]): {
  data: Record<string, PricePoint[]>
  loading: boolean
  errors: Record<string, string>
  retry: () => void
} {
  const [data, setData] = useState<Record<string, PricePoint[]>>({})
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fetchedRef = useRef<Set<string>>(new Set())
  const inFlightRef = useRef<Set<string>>(new Set())
  const retryTick = useRef(0)
  const [, setTick] = useState(0)

  const doFetch = useCallback((tickersToFetch: string[]) => {
    if (!API_URL) return
    const toFetch = tickersToFetch.filter(
      (t) => !fetchedRef.current.has(t) && !inFlightRef.current.has(t),
    )
    if (toFetch.length === 0) return

    setLoading(true)
    // Clear errors for tickers we're about to retry
    setErrors((prev) => {
      const next = { ...prev }
      for (const t of toFetch) delete next[t]
      return next
    })
    for (const t of toFetch) inFlightRef.current.add(t)

    Promise.all(
      toFetch.map((ticker) =>
        fetchWithTimeout(`${API_URL}/prices/${ticker}`, TIMEOUT_MS)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json() as Promise<PricePoint[]>
          })
          .then((points) => ({ ticker, points, ok: true as const, error: '' }))
          .catch((err) => {
            const isTimeout = err instanceof DOMException && err.name === 'AbortError'
            const msg = isTimeout
              ? 'Request timed out — server may be starting up'
              : `Failed to load — ${err.message || 'network error'}`
            return { ticker, points: [] as PricePoint[], ok: false as const, error: msg }
          }),
      ),
    ).then((results) => {
      const newData: Record<string, PricePoint[]> = {}
      const newErrors: Record<string, string> = {}
      for (const r of results) {
        inFlightRef.current.delete(r.ticker)
        if (r.ok && r.points.length > 0) {
          fetchedRef.current.add(r.ticker)
          newData[r.ticker] = r.points
        } else if (!r.ok) {
          newErrors[r.ticker] = r.error
        }
      }
      if (Object.keys(newData).length > 0) {
        setData((prev) => ({ ...prev, ...newData }))
      }
      if (Object.keys(newErrors).length > 0) {
        setErrors((prev) => ({ ...prev, ...newErrors }))
      }
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    doFetch(tickers)
  }, [tickers, doFetch])

  const retry = useCallback(() => {
    // Clear failed tickers so they can be re-fetched
    setErrors((prev) => {
      const failedTickers = Object.keys(prev)
      for (const t of failedTickers) {
        fetchedRef.current.delete(t)
        inFlightRef.current.delete(t)
      }
      return {}
    })
    retryTick.current += 1
    // Force a re-render so the effect re-runs
    setTick((t) => t + 1)
  }, [])

  // Re-fetch when retry is triggered
  useEffect(() => {
    if (retryTick.current > 0) {
      doFetch(tickers)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick.current, doFetch])

  return { data, loading, errors, retry }
}
