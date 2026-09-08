/**
 * Phase 3 audit tests — custom fund synthesis (two-layer calculation).
 * Expected values computed by hand in comments; never derived from the code
 * under test.
 *
 * Behavioral note documented here: synthesizePriceData chains the WEIGHTED
 * AVERAGE of monthly price ratios, which models an index rebalanced back to
 * target weights every month (not buy-and-hold of the constituents).
 */
import { describe, test, expect } from 'vitest'
import { synthesizePriceData } from './synthesize'
import { computePortfolio } from './calculations'
import type { CustomFund, PricePoint, PriceData } from '../types'

function pts(dates: string[], prices: number[], adj?: number[]): PricePoint[] {
  return dates.map((date, i) => ({
    date,
    adjusted_close: adj ? adj[i] : prices[i],
    close: prices[i],
  }))
}

const D3 = ['2020-01-01', '2020-02-01', '2020-03-01']

function fund(stocks: { ticker: string; weight: number }[], weightMode: 'equal' | 'manual'): CustomFund {
  return {
    id: 'CUSTOM-test',
    name: 'Test Fund',
    color: '#000000',
    weightMode,
    stocks: stocks.map((s) => ({ ...s, name: s.ticker })),
  }
}

describe('synthesizePriceData', () => {
  test('equal weight of two stocks equals the average of their monthly ratios', () => {
    // Month 1: A +10%, B −10% → fund ratio = (1.1 + 0.9)/2 = 1.0 → 100
    // Month 2: A +10%, B +10% → ratio 1.1 → 110
    const prices = {
      A: pts(D3, [100, 110, 121]),
      B: pts(D3, [200, 180, 198]), // −10% then +10%
    }
    const s = synthesizePriceData(fund([{ ticker: 'A', weight: 0 }, { ticker: 'B', weight: 0 }], 'equal'), prices)
    expect(s.map((p) => p.date)).toEqual(D3)
    expect(s[0].adjusted_close).toBe(100)
    expect(s[1].adjusted_close).toBeCloseTo(100, 10)
    expect(s[2].adjusted_close).toBeCloseTo(110, 10)
  })

  test('manual weights that do not sum to 100 are normalized (UI allows ±0.5 tolerance)', () => {
    // Weights 50 and 25 normalize to 2/3 and 1/3.
    // Month 1: A +30%, B flat → ratio = 2/3×1.3 + 1/3×1.0 = 1.2 → 120
    const prices = {
      A: pts(D3.slice(0, 2), [100, 130]),
      B: pts(D3.slice(0, 2), [100, 100]),
    }
    const s = synthesizePriceData(fund([{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 25 }], 'manual'), prices)
    expect(s[1].adjusted_close).toBeCloseTo(120, 10)
  })

  test('a single-stock fund reproduces that stock rebased to 100', () => {
    // A: 50 → 55 → 66 ⇒ ratios 1.1, 1.2 ⇒ fund: 100, 110, 132
    const prices = { A: pts(D3, [50, 55, 66]) }
    const s = synthesizePriceData(fund([{ ticker: 'A', weight: 100 }], 'manual'), prices)
    expect(s[0].close).toBe(100)
    expect(s[1].close).toBeCloseTo(110, 10)
    expect(s[2].close).toBeCloseTo(132, 10)
  })

  test('constituents with no price data are skipped and weights renormalized', () => {
    // C has no data. Equal weight over remaining A and B.
    // Month 1: A +20%, B flat → (1.2 + 1.0)/2 = 1.1 → 110
    const prices = {
      A: pts(D3.slice(0, 2), [100, 120]),
      B: pts(D3.slice(0, 2), [100, 100]),
    }
    const f = fund(
      [{ ticker: 'A', weight: 0 }, { ticker: 'B', weight: 0 }, { ticker: 'C', weight: 0 }],
      'equal',
    )
    const s = synthesizePriceData(f, prices)
    expect(s[1].adjusted_close).toBeCloseTo(110, 10)
  })

  test('only the intersection of constituent dates is used', () => {
    // A covers Jan–Mar, B only Feb–Mar → fund starts at Feb.
    const prices = {
      A: pts(D3, [100, 110, 121]),
      B: pts(D3.slice(1), [100, 105]),
    }
    const s = synthesizePriceData(fund([{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }], 'manual'), prices)
    expect(s.map((p) => p.date)).toEqual(['2020-02-01', '2020-03-01'])
    // Feb→Mar: A +10%, B +5% → 0.5×1.1 + 0.5×1.05 = 1.075 → 107.5
    expect(s[1].adjusted_close).toBeCloseTo(107.5, 10)
  })

  test('adjusted and close series are chained independently', () => {
    // close flat (ratio 1.0), adjusted +2%/month.
    const prices = {
      A: pts(D3, [100, 100, 100], [100, 102, 104.04]),
    }
    const s = synthesizePriceData(fund([{ ticker: 'A', weight: 100 }], 'manual'), prices)
    expect(s.map((p) => p.close)).toEqual([100, 100, 100])
    expect(s[1].adjusted_close).toBeCloseTo(102, 10)
    expect(s[2].adjusted_close).toBeCloseTo(104.04, 10)
  })

  test('empty fund or fully-missing data returns an empty series', () => {
    expect(synthesizePriceData(fund([], 'equal'), {})).toHaveLength(0)
    expect(synthesizePriceData(fund([{ ticker: 'A', weight: 100 }], 'equal'), {})).toHaveLength(0)
  })
})

describe('two-layer: custom fund inside the portfolio engine', () => {
  test('a 100% custom-fund portfolio tracks the synthesized series exactly', () => {
    // Layer 1 (hand-computed above): equal-weight A/B → 100, 100, 110.
    // Layer 2: 100% of that fund with $10,000 → 10000, 10000, 11000.
    const stockPrices = {
      A: pts(D3, [100, 110, 121]),
      B: pts(D3, [200, 180, 198]),
    }
    const synth = synthesizePriceData(
      fund([{ ticker: 'A', weight: 0 }, { ticker: 'B', weight: 0 }], 'equal'),
      stockPrices,
    )
    const priceData: PriceData = { 'CUSTOM-test': synth }
    const r = computePortfolio(
      [{ ticker: 'CUSTOM-test', weight: 100 }],
      priceData,
      { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 },
      10_000,
    )
    expect(r.cumulativeValues.map((p) => p.value)).toEqual([10_000, 10_000, 11_000])
  })

  test('custom fund mixed 50/50 with an ETF matches hand calc', () => {
    // Custom fund month-1 ratio (from above): 1.0; ETF month-1: +10%.
    // Portfolio (buy-and-hold): 5000×1.0 + 5000×1.1 = 10500.
    const stockPrices = {
      A: pts(D3.slice(0, 2), [100, 110]),
      B: pts(D3.slice(0, 2), [200, 180]),
    }
    const synth = synthesizePriceData(
      fund([{ ticker: 'A', weight: 0 }, { ticker: 'B', weight: 0 }], 'equal'),
      stockPrices,
    )
    const priceData: PriceData = {
      'CUSTOM-test': synth,
      VOO: pts(D3.slice(0, 2), [400, 440]),
    }
    const r = computePortfolio(
      [{ ticker: 'CUSTOM-test', weight: 50 }, { ticker: 'VOO', weight: 50 }],
      priceData,
      { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 },
      10_000,
    )
    expect(r.cumulativeValues[1].value).toBeCloseTo(10_500, 8)
  })
})
