import { describe, test, expect, vi, afterEach } from 'vitest'
import {
  BackendError,
  REQUEST_TIMEOUT_MS,
  SLOW_REQUEST_MS,
  createPriceStore,
  fetchBackendJson,
  trackRequest,
  type RequestPhase,
} from './dataAccess'
import type { PricePoint } from '../types'

const API = 'http://api.test'
const VOO: PricePoint[] = [{ date: '2020-01-01', adjusted_close: 100, close: 100 }]
const NVDA: PricePoint[] = [{ date: '2020-01-01', adjusted_close: 5, close: 5 }]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** A fetch that serves prices.json and records every URL it was asked for. */
function fakeFetch(routes: Record<string, () => Promise<Response>>) {
  return vi.fn((url: string) => {
    const route = routes[url]
    return route ? route() : Promise.reject(new TypeError(`unexpected fetch ${url}`))
  })
}

const asFetch = (fn: unknown) => fn as typeof fetch
const backendCalls = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.filter(([url]) => String(url).startsWith(API))

afterEach(() => {
  vi.useRealTimers()
})

describe('price store', () => {
  test('static ticker → served from prices.json, no backend request', async () => {
    const fetchImpl = fakeFetch({ '/data/prices.json': async () => json({ VOO }) })
    const store = createPriceStore({ apiUrl: API, fetchImpl: asFetch(fetchImpl) })

    await store.loadStatic()
    expect(await store.getPrices('VOO')).toEqual(VOO)
    expect(store.peek('VOO')).toEqual(VOO)
    expect(backendCalls(fetchImpl)).toHaveLength(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('static ticker requested before prices.json lands waits for it instead of hitting the backend', async () => {
    const staticFile = deferred<Response>()
    const fetchImpl = fakeFetch({ '/data/prices.json': () => staticFile.promise })
    const store = createPriceStore({ apiUrl: API, fetchImpl: asFetch(fetchImpl) })

    void store.loadStatic()
    const pending = store.getPrices('VOO')
    staticFile.resolve(json({ VOO }))

    expect(await pending).toEqual(VOO)
    expect(backendCalls(fetchImpl)).toHaveLength(0)
  })

  test('loadStatic is memoized (StrictMode double-mount issues one request)', async () => {
    const fetchImpl = fakeFetch({ '/data/prices.json': async () => json({ VOO }) })
    const store = createPriceStore({ apiUrl: API, fetchImpl: asFetch(fetchImpl) })

    await Promise.all([store.loadStatic(), store.loadStatic()])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('unknown ticker → exactly one backend fetch; later calls are cached', async () => {
    const fetchImpl = fakeFetch({
      '/data/prices.json': async () => json({ VOO }),
      [`${API}/prices/NVDA`]: async () => json(NVDA),
    })
    const store = createPriceStore({ apiUrl: API, fetchImpl: asFetch(fetchImpl) })
    await store.loadStatic()

    expect(await store.getPrices('NVDA')).toEqual(NVDA)
    expect(await store.getPrices('NVDA')).toEqual(NVDA)
    expect(store.peek('NVDA')).toEqual(NVDA)
    expect(backendCalls(fetchImpl)).toHaveLength(1)
  })

  test('concurrent requests for the same ticker share one fetch', async () => {
    const fetchImpl = fakeFetch({ [`${API}/prices/NVDA`]: async () => json(NVDA) })
    const store = createPriceStore({ apiUrl: API, fetchImpl: asFetch(fetchImpl) })

    const [a, b] = await Promise.all([store.getPrices('NVDA'), store.getPrices('NVDA')])
    expect(a).toEqual(NVDA)
    expect(b).toEqual(NVDA)
    expect(backendCalls(fetchImpl)).toHaveLength(1)
  })

  test('HTTP failure rejects with BackendError(http) and is not cached — retry refetches', async () => {
    let attempt = 0
    const fetchImpl = fakeFetch({
      [`${API}/prices/NVDA`]: async () => (++attempt === 1 ? json({ detail: 'boom' }, 500) : json(NVDA)),
    })
    const store = createPriceStore({ apiUrl: API, fetchImpl: asFetch(fetchImpl) })

    const failure = await store.getPrices('NVDA').catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(BackendError)
    expect(failure).toMatchObject({ kind: 'http', status: 500 })
    expect(store.peek('NVDA')).toBeUndefined()

    expect(await store.getPrices('NVDA')).toEqual(NVDA)
    expect(backendCalls(fetchImpl)).toHaveLength(2)
  })

  test('unknown ticker on the backend (404) → BackendError(http, 404)', async () => {
    const fetchImpl = fakeFetch({ [`${API}/prices/ZZZZ`]: async () => json({ detail: 'nope' }, 404) })
    const store = createPriceStore({ apiUrl: API, fetchImpl: asFetch(fetchImpl) })

    await expect(store.getPrices('ZZZZ')).rejects.toMatchObject({ name: 'BackendError', kind: 'http', status: 404 })
  })

  test('network failure rejects with BackendError(network)', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    const store = createPriceStore({ apiUrl: API, fetchImpl: asFetch(fetchImpl) })

    const failure = await store.getPrices('NVDA').catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(BackendError)
    expect(failure).toMatchObject({ kind: 'network' })
  })

  test('timeout at 75 s rejects with BackendError(timeout)', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
    )
    const store = createPriceStore({ apiUrl: API, fetchImpl: asFetch(fetchImpl) })

    let settled = false
    const request = store.getPrices('NVDA')
    request.catch(() => undefined).finally(() => { settled = true })

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    const failure = await request.catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(BackendError)
    expect(failure).toMatchObject({ kind: 'timeout' })
  })

  test('no VITE_API_URL → BackendError(unconfigured) without calling fetch', async () => {
    const fetchImpl = vi.fn()
    const store = createPriceStore({ fetchImpl: asFetch(fetchImpl) })

    await expect(store.getPrices('NVDA')).rejects.toMatchObject({ kind: 'unconfigured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('fetchBackendJson', () => {
  test("an abort from the caller's signal is rethrown as AbortError, not reported as a failure", async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
    )
    const controller = new AbortController()
    const request = fetchBackendJson('/search?q=a', { apiUrl: API, fetchImpl: asFetch(fetchImpl), signal: controller.signal })
    controller.abort()

    const failure = await request.catch((e: unknown) => e)
    expect(failure).not.toBeInstanceOf(BackendError)
    expect(failure).toMatchObject({ name: 'AbortError' })
  })
})

describe('trackRequest', () => {
  test('loading → slow after 5 s → ready', async () => {
    vi.useFakeTimers()
    const phases: RequestPhase['status'][] = []
    const request = deferred<void>()
    trackRequest(request.promise, (p) => phases.push(p.status))

    expect(phases).toEqual(['loading'])
    await vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS - 1)
    expect(phases).toEqual(['loading'])
    await vi.advanceTimersByTimeAsync(1)
    expect(phases).toEqual(['loading', 'slow'])

    request.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(phases).toEqual(['loading', 'slow', 'ready'])
  })

  test('fast success never reports slow', async () => {
    vi.useFakeTimers()
    const phases: RequestPhase['status'][] = []
    trackRequest(Promise.resolve(), (p) => phases.push(p.status))

    await vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS * 2)
    expect(phases).toEqual(['loading', 'ready'])
  })

  test('failure reports the typed error', async () => {
    const phases: RequestPhase[] = []
    const error = new BackendError('timeout', "The data server didn't respond in time")
    trackRequest(Promise.reject(error), (p) => phases.push(p))
    await Promise.resolve()
    await Promise.resolve()

    expect(phases.at(-1)).toEqual({ status: 'error', error })
  })

  test('cancel stops further reports', async () => {
    vi.useFakeTimers()
    const phases: RequestPhase['status'][] = []
    const request = deferred<void>()
    const cancel = trackRequest(request.promise, (p) => phases.push(p.status))

    cancel()
    await vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS)
    request.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(phases).toEqual(['loading'])
  })
})
