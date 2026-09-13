import { describe, test, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import StatsPanel from './StatsPanel'
import { computePortfolio, RISK_FREE_RATE } from '../utils/calculations'
import type { PriceData } from '../types'

// A volatile, rising path so IRR and time-weighted CAGR diverge under contributions.
const PRICES = [100, 92, 104, 97, 111, 103, 118, 109, 124, 115, 131, 122, 138]
const DATES = PRICES.map((_, i) => {
  const y = 2020 + Math.floor(i / 12)
  const m = (i % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
})
const DATA: PriceData = {
  VOO: DATES.map((date, i) => ({ date, adjusted_close: PRICES[i], close: PRICES[i] })),
}

function run(monthlyContribution: number) {
  return computePortfolio([{ ticker: 'VOO', weight: 100 }], DATA, {
    rebalanceFrequency: 'none',
    useTotalReturn: true,
    monthlyContribution,
  })
}

/** Text lines of each stat card, in render order. */
function render(result: ReturnType<typeof run>) {
  const html = renderToStaticMarkup(createElement(StatsPanel, { result, principal: 10_000 }))
  const cards = [...html.matchAll(/<div class="rounded-lg[^"]*">([\s\S]*?)<\/div>/g)].map((m) =>
    [...m[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((p) => p[1].replace(/<[^>]+>/g, '')),
  )
  return { html, cards }
}

const pct = (n: number) => (n * 100).toFixed(2) + '%'

describe('StatsPanel CAGR card', () => {
  test('contributions OFF: single CAGR figure, no IRR line', () => {
    const r = run(0)
    const { html, cards } = render(r)

    expect(cards[0][0]).toBe('CAGR')
    expect(cards[0][1]).toBe(pct(r.timeWeightedCagr))
    expect(cards[0]).toHaveLength(3) // label, value, ending-balance sub-line
    expect(html).not.toContain('IRR')
  })

  test('contributions ON: time-weighted CAGR headline with IRR as secondary line', () => {
    const r = run(500)
    expect(r.useIRR).toBe(true)
    // Guard the fixture: the two figures must differ or the test proves nothing.
    expect(pct(r.cagr)).not.toBe(pct(r.timeWeightedCagr))

    const { cards } = render(r)

    expect(cards[0][0]).toBe('CAGR')
    expect(cards[0][1]).toBe(pct(r.timeWeightedCagr))
    expect(cards[0][2]).toBe(`IRR (money-weighted) ${pct(r.cagr)}`)
  })

  test.each([0, 500])('Sharpe is reproducible from displayed CAGR and volatility (contribution %i)', (c) => {
    const r = run(c)
    const { cards } = render(r)

    const shownCagr = parseFloat(cards[0][1]) / 100
    const shownVol = parseFloat(cards[1][1]) / 100
    const shownSharpe = parseFloat(cards[3][1])

    expect(cards[3][0]).toBe('Sharpe Ratio')
    expect(cards[3][1]).toBe(((r.timeWeightedCagr - RISK_FREE_RATE) / r.annualizedVolatility).toFixed(2))
    // Recomputing from the 2-dp figures on screen lands within rounding of the shown Sharpe.
    expect(Math.abs((shownCagr - RISK_FREE_RATE) / shownVol - shownSharpe)).toBeLessThan(0.01)
  })
})
