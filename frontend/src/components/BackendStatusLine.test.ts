import { describe, test, expect, vi, afterEach } from 'vitest'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BackendStatusLine, { SLOW_SERVER_MESSAGE } from './BackendStatusLine'
import {
  REQUEST_TIMEOUT_MS,
  SLOW_REQUEST_MS,
  createPriceStore,
  trackRequest,
  type RequestPhase,
} from '../utils/dataAccess'

/*
 * No DOM test environment is installed (and no new dependencies are allowed),
 * so this drives a real price-store request through trackRequest with fake
 * timers — exactly how CustomFundBuilder wires a constituent row — and renders
 * the status line with react-dom/server at each phase. Retry is exercised by
 * invoking the rendered button's onClick from the element tree.
 */

const API = 'http://api.test'
const LABEL = 'Loading prices…'
const NVDA = [{ date: '2020-01-01', adjusted_close: 5, close: 5 }]

function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }),
  )
}

/** A constituent row's status: track a request and re-render on every phase. */
function row(request: () => Promise<unknown>, onRetry = () => {}) {
  let phase: RequestPhase | null = null
  const start = () => trackRequest(request(), (p) => { phase = p })
  start()
  const props = () => ({ phase: phase!, loadingLabel: LABEL, onRetry })
  return {
    html: () => renderToStaticMarkup(createElement(BackendStatusLine, props())),
    tree: () => BackendStatusLine(props()),
    phase: () => phase,
    retry: start,
  }
}

function findButton(node: ReactNode): ReactElement<{ onClick: () => void; children: ReactNode }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findButton(child)
      if (hit) return hit
    }
    return null
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  if (node.type === 'button') return node as ReactElement<{ onClick: () => void; children: ReactNode }>
  return findButton(node.props.children)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('BackendStatusLine on a constituent row', () => {
  test('renders the loading label while the request is pending', () => {
    vi.useFakeTimers()
    const store = createPriceStore({ apiUrl: API, fetchImpl: hangingFetch() as unknown as typeof fetch })
    const r = row(() => store.getPrices('NVDA'))

    const html = r.html()
    expect(html).toContain(LABEL)
    expect(html).toContain('role="status"')
    expect(html).not.toContain(SLOW_SERVER_MESSAGE)
    expect(html).not.toContain('Retry')
  })

  test('switches to the slow-server message after 5 s', async () => {
    vi.useFakeTimers()
    const store = createPriceStore({ apiUrl: API, fetchImpl: hangingFetch() as unknown as typeof fetch })
    const r = row(() => store.getPrices('NVDA'))

    await vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS - 1)
    expect(r.html()).toContain(LABEL)

    await vi.advanceTimersByTimeAsync(1)
    const html = r.html()
    expect(html).toContain(SLOW_SERVER_MESSAGE)
    expect(html).not.toContain(LABEL)
  })

  test('renders an inline error with Retry after the 75 s timeout', async () => {
    vi.useFakeTimers()
    const store = createPriceStore({ apiUrl: API, fetchImpl: hangingFetch() as unknown as typeof fetch })
    const r = row(() => store.getPrices('NVDA'))

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    const html = r.html()
    expect(html).toContain('role="alert"')
    expect(html).toContain('respond in time')
    expect(html).toContain('>Retry</button>')
    expect(html).not.toContain(SLOW_SERVER_MESSAGE)
  })

  test('network failure renders error + Retry; Retry refetches and the line clears on success', async () => {
    let attempt = 0
    const fetchImpl = vi.fn(async () => {
      if (++attempt === 1) throw new TypeError('Failed to fetch')
      return new Response(JSON.stringify(NVDA), { status: 200 })
    })
    const store = createPriceStore({ apiUrl: API, fetchImpl: fetchImpl as unknown as typeof fetch })
    const onRetry = vi.fn()
    const r = row(() => store.getPrices('NVDA'), onRetry)

    await vi.waitFor(() => expect(r.phase()?.status).toBe('error'))
    expect(r.html()).toContain('reach the data server')

    const button = findButton(r.tree())
    expect(button).not.toBeNull()
    button!.props.onClick()
    expect(onRetry).toHaveBeenCalledTimes(1)

    // The builder's Retry handler re-runs the tracked store request
    r.retry()
    await vi.waitFor(() => expect(r.phase()?.status).toBe('ready'))
    expect(r.html()).toBe('')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
