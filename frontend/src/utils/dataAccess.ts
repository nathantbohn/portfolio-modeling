import type { PriceData, PricePoint } from '../types'

/**
 * Data access for price data.
 *
 * Base data (ETFs, mutual funds, DIA, McMerica 25 and its constituents) comes
 * from the static prices.json served with the frontend. The backend is only
 * contacted for tickers that file doesn't have, one ticker at a time, when a
 * user action needs them. Results are cached for the session.
 */

export const API_URL = import.meta.env.VITE_API_URL as string | undefined

/** After this long, a pending request is reported as "slow" (Render cold start). */
export const SLOW_REQUEST_MS = 5_000
/** Render's free tier can take 30–60 s to wake; give it headroom. */
export const REQUEST_TIMEOUT_MS = 75_000

const STATIC_PRICES_URL = '/data/prices.json'

// ─── Errors ───────────────────────────────────────────────────────────────────

export type BackendErrorKind = 'unconfigured' | 'timeout' | 'network' | 'http'

export class BackendError extends Error {
  readonly kind: BackendErrorKind
  readonly status?: number

  constructor(kind: BackendErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'BackendError'
    this.kind = kind
    this.status = status
  }
}

export interface BackendOptions {
  apiUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * GET a JSON path from the backend with a timeout. Failures reject with a
 * BackendError; an abort requested by the caller's own signal rejects with the
 * underlying AbortError so superseded requests aren't reported as failures.
 */
export async function fetchBackendJson<T>(
  path: string,
  { apiUrl, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS, signal }: BackendOptions & { signal?: AbortSignal } = {},
): Promise<T> {
  if (!apiUrl) throw new BackendError('unconfigured', 'No data server is configured')

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', forwardAbort)

  try {
    const res = await fetchImpl(`${apiUrl}${path}`, { signal: controller.signal })
    if (!res.ok) {
      throw new BackendError(
        'http',
        res.status === 404 ? 'No price data for this ticker' : `Data server error (HTTP ${res.status})`,
        res.status,
      )
    }
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof BackendError) throw err
    if (timedOut) throw new BackendError('timeout', "The data server didn't respond in time")
    if (signal?.aborted) throw err
    throw new BackendError('network', "Couldn't reach the data server")
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

// ─── Price store ──────────────────────────────────────────────────────────────

export interface PriceStore {
  /** Fetch and seed the static prices.json. Memoized: repeated calls share one request. */
  loadStatic(url?: string): Promise<PriceData>
  /** Synchronous read of a ticker already in memory (static or fetched). */
  peek(ticker: string): PricePoint[] | undefined
  /** Prices for one ticker: from memory if present, otherwise one backend request (cached on success). */
  getPrices(ticker: string): Promise<PricePoint[]>
}

export function createPriceStore(options: BackendOptions = {}): PriceStore {
  const prices = new Map<string, PricePoint[]>()
  const inFlight = new Map<string, Promise<PricePoint[]>>()
  let staticLoad: Promise<PriceData> | null = null

  function loadStatic(url = STATIC_PRICES_URL): Promise<PriceData> {
    if (!staticLoad) {
      const request = (options.fetchImpl ?? fetch)(url)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to load price data: HTTP ${res.status}`)
          return res.json() as Promise<PriceData>
        })
        .then((data) => {
          for (const [ticker, points] of Object.entries(data)) prices.set(ticker, points)
          return data
        })
      // A failed load may be retried by a later call
      request.catch(() => {
        if (staticLoad === request) staticLoad = null
      })
      staticLoad = request
    }
    return staticLoad
  }

  async function getPrices(ticker: string): Promise<PricePoint[]> {
    // Don't send a static ticker to the backend just because prices.json hasn't landed yet
    if (staticLoad) await staticLoad.catch(() => undefined)

    const cached = prices.get(ticker)
    if (cached) return cached

    let request = inFlight.get(ticker)
    if (!request) {
      request = fetchBackendJson<PricePoint[]>(`/prices/${encodeURIComponent(ticker)}`, options)
        .then((points) => {
          prices.set(ticker, points)
          return points
        })
        .finally(() => inFlight.delete(ticker))
      inFlight.set(ticker, request)
    }
    return request
  }

  return { loadStatic, peek: (ticker) => prices.get(ticker), getPrices }
}

/** App-wide store bound to VITE_API_URL. */
export const priceStore = createPriceStore({ apiUrl: API_URL })

// ─── Stock search ─────────────────────────────────────────────────────────────

export interface StockSearchResult {
  ticker: string
  name: string
  sector: string
}

export function searchStocks(
  query: string,
  signal?: AbortSignal,
  options: BackendOptions = { apiUrl: API_URL },
): Promise<StockSearchResult[]> {
  return fetchBackendJson<StockSearchResult[]>(`/search?q=${encodeURIComponent(query)}`, { ...options, signal })
}

// ─── Request phase tracking (drives loading / slow / error UI) ────────────────

export type RequestPhase =
  | { status: 'loading' }
  | { status: 'slow' }
  | { status: 'ready' }
  | { status: 'error'; error: BackendError }

/**
 * Report a request's progress: `loading` immediately, `slow` once it has been
 * pending for `slowMs`, then `ready` or `error`. Returns a cancel function that
 * stops further reports (the request itself keeps running).
 */
export function trackRequest(
  request: Promise<unknown>,
  onPhase: (phase: RequestPhase) => void,
  slowMs: number = SLOW_REQUEST_MS,
): () => void {
  let active = true
  onPhase({ status: 'loading' })
  const timer = setTimeout(() => {
    if (active) onPhase({ status: 'slow' })
  }, slowMs)

  request.then(
    () => {
      clearTimeout(timer)
      if (active) onPhase({ status: 'ready' })
    },
    (err: unknown) => {
      clearTimeout(timer)
      if (!active) return
      const error = err instanceof BackendError
        ? err
        : new BackendError('network', "Couldn't reach the data server")
      onPhase({ status: 'error', error })
    },
  )

  return () => {
    active = false
    clearTimeout(timer)
  }
}
