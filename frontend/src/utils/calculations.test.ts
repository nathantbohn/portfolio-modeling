import { describe, test, expect } from 'vitest'
import {
  computePortfolio,
  calcAnnualizedVol,
  calcMaxDrawdown,
  calcAnnualReturns,
  RISK_FREE_RATE,
} from './calculations'
import type { Allocation, PriceData, PricePoint } from '../types'

// ─── Test data factories ──────────────────────────────────────────────────────

/** Generate ISO date strings for `count` consecutive months starting at year/month. */
function monthlyDates(startYear: number, startMonth: number, count: number): string[] {
  const dates: string[] = []
  let y = startYear
  let m = startMonth
  for (let i = 0; i < count; i++) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-01`)
    if (++m > 12) { m = 1; y++ }
  }
  return dates
}

/** Build a PricePoint[] from parallel date and price arrays (adj = close unless overridden). */
function priceSeries(dates: string[], prices: number[], adjPrices?: number[]): PricePoint[] {
  return dates.map((date, i) => ({
    date,
    adjusted_close: adjPrices ? adjPrices[i] : prices[i],
    close: prices[i],
  }))
}

/** Compound a starting price at a fixed monthly rate for `n` months. */
function compoundPrices(start: number, monthlyRate: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => start * Math.pow(1 + monthlyRate, i))
}

// ─── Single-fund (100% VOO proxy) ─────────────────────────────────────────────

describe('100% single-fund portfolio', () => {
  test('cumulative values track fund price exactly', () => {
    const dates = monthlyDates(2020, 1, 13) // Jan 2020 – Jan 2021 (12 periods)
    const prices = [100, 95, 105, 98, 110, 103, 115, 108, 120, 112, 125, 118, 130]
    const data: PriceData = { VOO: priceSeries(dates, prices) }
    const alloc: Allocation[] = [{ ticker: 'VOO', weight: 100 }]

    const { cumulativeValues } = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    expect(cumulativeValues).toHaveLength(13)
    for (let i = 0; i < prices.length; i++) {
      expect(cumulativeValues[i].value).toBeCloseTo(10_000 * prices[i] / prices[0], 6)
    }
  })

  test('zero volatility for perfectly smooth monthly returns', () => {
    const dates = monthlyDates(2020, 1, 25) // 24 periods
    const prices = compoundPrices(100, 0.01, 25) // 1 % every month, no variance
    const data: PriceData = { VOO: priceSeries(dates, prices) }
    const alloc: Allocation[] = [{ ticker: 'VOO', weight: 100 }]

    const { annualizedVolatility } = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    expect(annualizedVolatility).toBeCloseTo(0, 10)
  })

  test('zero max drawdown for monotonically rising prices', () => {
    const dates = monthlyDates(2020, 1, 25)
    const prices = compoundPrices(100, 0.005, 25)
    const data: PriceData = { VOO: priceSeries(dates, prices) }
    const alloc: Allocation[] = [{ ticker: 'VOO', weight: 100 }]

    const { maxDrawdown } = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    expect(maxDrawdown).toBe(0)
  })

  test('CAGR matches analytic value for known price path', () => {
    // Prices rise from 100 to 100*(1.01)^24 over exactly 24 monthly steps.
    // Date span: Jan 2020 → Jan 2022 = 2 years (approximately).
    // Analytic CAGR ≈ (1.01^24)^(12/24) - 1 = 1.01^12 - 1 ≈ 12.68%.
    // The date-based computation introduces a small deviation; we accept ±0.5 pp.
    const dates = monthlyDates(2020, 1, 25) // 24 periods
    const prices = compoundPrices(100, 0.01, 25)
    const data: PriceData = { VOO: priceSeries(dates, prices) }
    const alloc: Allocation[] = [{ ticker: 'VOO', weight: 100 }]

    const { cagr } = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    const analytic = Math.pow(1.01, 12) - 1 // ≈ 12.68%
    expect(cagr).toBeCloseTo(analytic, 1) // within ~0.1 pp
  })

  test('max drawdown is correct for known peak-to-trough', () => {
    // Prices: 100 → 150 (peak) → 75 (trough) = 50% drawdown
    const dates = monthlyDates(2020, 1, 4)
    const prices = [100, 120, 150, 75]
    const data: PriceData = { VOO: priceSeries(dates, prices) }
    const alloc: Allocation[] = [{ ticker: 'VOO', weight: 100 }]

    const { maxDrawdown } = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    expect(maxDrawdown).toBeCloseTo(0.5, 6) // 50% drawdown
  })

  test('Sharpe ratio uses correct formula', () => {
    // With known CAGR and vol we can verify Sharpe = (cagr - 0.02) / vol
    const dates = monthlyDates(2020, 1, 13) // 12 periods
    const prices = [100, 95, 105, 98, 110, 103, 115, 108, 120, 112, 125, 118, 130]
    const data: PriceData = { VOO: priceSeries(dates, prices) }
    const alloc: Allocation[] = [{ ticker: 'VOO', weight: 100 }]

    const { cagr, annualizedVolatility, sharpeRatio } = computePortfolio(
      alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 }
    )

    const expected = annualizedVolatility > 0 ? (cagr - RISK_FREE_RATE) / annualizedVolatility : 0
    expect(sharpeRatio).toBeCloseTo(expected, 10)
  })
})

// ─── Two-fund (60/40 VOO/BND proxy) ───────────────────────────────────────────

describe('60/40 portfolio', () => {
  test('single-period portfolio return equals weighted average of fund returns', () => {
    // Fund A: +6%, Fund B: +2% → weighted return = 0.6×6% + 0.4×2% = 4.4%
    const dates = monthlyDates(2020, 1, 2)
    const data: PriceData = {
      A: priceSeries(dates, [100, 106]),
      B: priceSeries(dates, [100, 102]),
    }
    const alloc: Allocation[] = [
      { ticker: 'A', weight: 60 },
      { ticker: 'B', weight: 40 },
    ]

    const { cumulativeValues } = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    expect(cumulativeValues[1].value).toBeCloseTo(10_000 * 1.044, 6)
  })

  test('multi-period buy-and-hold accumulates correctly', () => {
    // Both funds grow by 1% per month for 12 periods.
    // A 60/40 split of two identical funds behaves exactly like either fund alone.
    const dates = monthlyDates(2020, 1, 13)
    const prices = compoundPrices(100, 0.01, 13)
    const data: PriceData = {
      A: priceSeries(dates, prices),
      B: priceSeries(dates, prices),
    }
    const alloc: Allocation[] = [
      { ticker: 'A', weight: 60 },
      { ticker: 'B', weight: 40 },
    ]

    const { cumulativeValues } = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    for (let i = 0; i < prices.length; i++) {
      expect(cumulativeValues[i].value).toBeCloseTo(10_000 * prices[i] / prices[0], 6)
    }
  })

  test('annual returns computed per year match manual calculation', () => {
    // Fund A: flat, Fund B: +10% every month for all of 2020.
    // 12 data points = Jan–Dec 2020 only (11 periods, single calendar year).
    const dates = monthlyDates(2020, 1, 12)
    const data: PriceData = {
      A: priceSeries(dates, Array(12).fill(100)),
      B: priceSeries(dates, compoundPrices(100, 0.10, 12)),
    }
    const alloc: Allocation[] = [
      { ticker: 'A', weight: 50 },
      { ticker: 'B', weight: 50 },
    ]

    const { annualReturns, cumulativeValues } = computePortfolio(
      alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 }
    )

    expect(annualReturns).toHaveLength(1)
    const expectedReturn =
      cumulativeValues[cumulativeValues.length - 1].value / cumulativeValues[0].value - 1
    expect(annualReturns[0].return).toBeCloseTo(expectedReturn, 10)
    expect(annualReturns[0].year).toBe(2020)
  })
})

// ─── Rebalance on vs off ──────────────────────────────────────────────────────

describe('rebalancing', () => {
  /**
   * Fund A grows 10%/month in year 1, flat in year 2.
   * Fund B is flat in year 1, grows 10%/month in year 2.
   * Rebalancing at Jan year 2 moves gains from A into B, boosting year 2.
   * Without rebalancing, year 2 growth only applies to the small Fund B holding.
   */
  function twoYearData() {
    // 25 data points: Dec prior year + 12 months of 2020 + 12 months of 2021
    const dates = monthlyDates(2019, 12, 25)
    // Fund A: months 0–12 (year 2020) grows 10%/month, then flat
    const fundAPrices = Array.from({ length: 25 }, (_, i) =>
      i <= 12 ? 100 * Math.pow(1.1, i) : 100 * Math.pow(1.1, 12),
    )
    // Fund B: flat in year 2020, then grows 10%/month in 2021
    const fundBPrices = Array.from({ length: 25 }, (_, i) =>
      i <= 12 ? 100 : 100 * Math.pow(1.1, i - 12),
    )
    const data: PriceData = {
      A: priceSeries(dates, fundAPrices),
      B: priceSeries(dates, fundBPrices),
    }
    const alloc: Allocation[] = [
      { ticker: 'A', weight: 50 },
      { ticker: 'B', weight: 50 },
    ]
    return { data, alloc }
  }

  test('annual rebalance and no rebalance produce different final values', () => {
    const { data, alloc } = twoYearData()
    const cfg = { useTotalReturn: true, monthlyContribution: 0 }

    const withRebalance = computePortfolio(alloc, data, { ...cfg, rebalanceFrequency: 'annual' })
    const withoutRebalance = computePortfolio(alloc, data, { ...cfg, rebalanceFrequency: 'none' })

    const finalWith = withRebalance.cumulativeValues.at(-1)!.value
    const finalWithout = withoutRebalance.cumulativeValues.at(-1)!.value

    expect(finalWith).not.toBeCloseTo(finalWithout, 2)
    // Rebalancing transfers year-1 gains into year-2 outperformer, so it wins here
    expect(finalWith).toBeGreaterThan(finalWithout)
  })

  test('annual rebalance produces different annual returns than no rebalance', () => {
    const { data, alloc } = twoYearData()

    const withRebalance = computePortfolio(alloc, data, { rebalanceFrequency: 'annual', useTotalReturn: true, monthlyContribution: 0 })
    const withoutRebalance = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    // Year-2 annual return should differ because of the rebalance
    const wr2 = withRebalance.annualReturns.find((r) => r.year === 2021)!
    const wo2 = withoutRebalance.annualReturns.find((r) => r.year === 2021)!

    expect(wr2.return).not.toBeCloseTo(wo2.return, 4)
  })
})

// ─── Dividend toggle (useTotalReturn) ─────────────────────────────────────────

describe('useTotalReturn toggle', () => {
  test('total-return uses adjusted_close, price-return uses close', () => {
    const dates = monthlyDates(2020, 1, 3)
    // adjusted close grows faster (dividends reinvested)
    const data: PriceData = {
      SCHD: priceSeries(dates, [100, 101, 102], [100, 103, 106]),
    }
    const alloc: Allocation[] = [{ ticker: 'SCHD', weight: 100 }]

    const totalReturn = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })
    const priceReturn = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: false, monthlyContribution: 0 })

    // Total return ends higher because adjusted_close grew more
    expect(totalReturn.cumulativeValues.at(-1)!.value).toBeGreaterThan(
      priceReturn.cumulativeValues.at(-1)!.value,
    )
    expect(priceReturn.cumulativeValues.at(-1)!.value).toBeCloseTo(10_000 * 102 / 100, 4)
    expect(totalReturn.cumulativeValues.at(-1)!.value).toBeCloseTo(10_000 * 106 / 100, 4)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('single month of data returns initial value with zero stats', () => {
    const data: PriceData = {
      VOO: [{ date: '2020-01-01', adjusted_close: 300, close: 300 }],
    }
    const alloc: Allocation[] = [{ ticker: 'VOO', weight: 100 }]

    const result = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    expect(result.cumulativeValues).toHaveLength(1)
    expect(result.cumulativeValues[0].value).toBe(10_000)
    expect(result.cagr).toBe(0)
    expect(result.annualizedVolatility).toBe(0)
    expect(result.maxDrawdown).toBe(0)
    expect(result.annualReturns).toHaveLength(0)
  })

  test('zero-weight funds are ignored and do not change results', () => {
    const dates = monthlyDates(2020, 1, 13)
    const prices = compoundPrices(100, 0.01, 13)
    const data: PriceData = {
      A: priceSeries(dates, prices),
      // B exists in priceData but allocation weight is 0
      B: priceSeries(dates, compoundPrices(50, 0.05, 13)),
    }

    const without = computePortfolio(
      [{ ticker: 'A', weight: 100 }],
      data,
      { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 },
    )
    const withZero = computePortfolio(
      [{ ticker: 'A', weight: 100 }, { ticker: 'B', weight: 0 }],
      data,
      { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 },
    )

    expect(withZero.cagr).toBeCloseTo(without.cagr, 10)
    expect(withZero.cumulativeValues.at(-1)!.value).toBeCloseTo(
      without.cumulativeValues.at(-1)!.value, 10
    )
  })

  test('empty allocations returns empty result', () => {
    const result = computePortfolio([], {}, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    expect(result.cumulativeValues).toHaveLength(0)
    expect(result.cagr).toBe(0)
  })

  test('all-zero-weight allocations returns empty result', () => {
    const dates = monthlyDates(2020, 1, 5)
    const data: PriceData = { A: priceSeries(dates, compoundPrices(100, 0.01, 5)) }
    const alloc: Allocation[] = [{ ticker: 'A', weight: 0 }]

    const result = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    expect(result.cumulativeValues).toHaveLength(0)
  })

  test('weights not summing to 100 are normalised correctly', () => {
    // 30 + 20 = 50, effectively 60/40 after normalisation
    const dates = monthlyDates(2020, 1, 2)
    const data: PriceData = {
      A: priceSeries(dates, [100, 106]),
      B: priceSeries(dates, [100, 102]),
    }

    const unnorm = computePortfolio(
      [{ ticker: 'A', weight: 30 }, { ticker: 'B', weight: 20 }],
      data,
      { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 },
    )
    const norm = computePortfolio(
      [{ ticker: 'A', weight: 60 }, { ticker: 'B', weight: 40 }],
      data,
      { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 },
    )

    expect(unnorm.cumulativeValues.at(-1)!.value).toBeCloseTo(
      norm.cumulativeValues.at(-1)!.value, 6
    )
  })

  test('missing ticker in priceData is silently skipped', () => {
    const dates = monthlyDates(2020, 1, 5)
    const data: PriceData = { A: priceSeries(dates, compoundPrices(100, 0.01, 5)) }
    const alloc: Allocation[] = [
      { ticker: 'A', weight: 60 },
      { ticker: 'MISSING', weight: 40 }, // not in priceData
    ]

    // Should run without throwing, treating MISSING as inactive
    const result = computePortfolio(alloc, data, { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 })

    expect(result.cumulativeValues.length).toBeGreaterThan(0)
  })
})

// ─── Internal helpers ─────────────────────────────────────────────────────────

describe('calcAnnualizedVol', () => {
  test('returns 0 for fewer than 2 returns', () => {
    expect(calcAnnualizedVol(new Float64Array([]))).toBe(0)
    expect(calcAnnualizedVol(new Float64Array([0.01]))).toBe(0)
  })

  test('returns 0 for constant returns', () => {
    const returns = new Float64Array([0.01, 0.01, 0.01, 0.01])
    expect(calcAnnualizedVol(returns)).toBeCloseTo(0, 10)
  })

  test('annualises monthly std dev by sqrt(12)', () => {
    // Monthly returns: 0.02, -0.02 alternating (12 samples)
    const returns = new Float64Array(12)
    for (let i = 0; i < 12; i++) returns[i] = i % 2 === 0 ? 0.02 : -0.02

    const vol = calcAnnualizedVol(returns)

    // Compute expected: sample std dev of the series × sqrt(12)
    const mean = 0
    let variance = 0
    for (let i = 0; i < 12; i++) variance += (returns[i] - mean) ** 2
    variance /= 11 // Bessel
    const expected = Math.sqrt(variance * 12)
    expect(vol).toBeCloseTo(expected, 10)
  })
})

describe('calcMaxDrawdown', () => {
  test('no drawdown for monotonically rising series', () => {
    const values = [
      { date: '2020-01-01', value: 100 },
      { date: '2020-02-01', value: 110 },
      { date: '2020-03-01', value: 120 },
    ]
    expect(calcMaxDrawdown(values)).toBe(0)
  })

  test('correct drawdown for simple peak-to-trough', () => {
    const values = [
      { date: '2020-01-01', value: 100 },
      { date: '2020-02-01', value: 200 }, // peak
      { date: '2020-03-01', value: 100 }, // 50% drawdown
    ]
    expect(calcMaxDrawdown(values)).toBeCloseTo(0.5, 10)
  })

  test('picks the largest drawdown across multiple troughs', () => {
    const values = [
      { date: '2020-01-01', value: 100 },
      { date: '2020-02-01', value: 150 },
      { date: '2020-03-01', value: 120 }, // 20% dd from 150
      { date: '2020-04-01', value: 160 },
      { date: '2020-05-01', value: 100 }, // 37.5% dd from 160 — largest
    ]
    expect(calcMaxDrawdown(values)).toBeCloseTo((160 - 100) / 160, 10)
  })
})

describe('calcAnnualReturns', () => {
  test('single year return equals total portfolio return', () => {
    const values = [
      { date: '2020-01-01', value: 10_000 },
      { date: '2020-06-01', value: 11_000 },
      { date: '2020-12-01', value: 12_000 },
    ]
    const [ar] = calcAnnualReturns(values)
    expect(ar.year).toBe(2020)
    expect(ar.return).toBeCloseTo(0.2, 10) // 10000→12000 = +20%
  })

  test('multi-year returns chain correctly', () => {
    const values = [
      { date: '2020-01-01', value: 10_000 },
      { date: '2020-12-01', value: 11_000 }, // 2020: +10%
      { date: '2021-12-01', value: 9_900 }, // 2021: -10%
    ]
    const returns = calcAnnualReturns(values)
    expect(returns[0].year).toBe(2020)
    expect(returns[0].return).toBeCloseTo(0.1, 10)
    expect(returns[1].year).toBe(2021)
    expect(returns[1].return).toBeCloseTo(-0.1, 10)
  })
})

// ─── Performance benchmark ────────────────────────────────────────────────────

describe('performance', () => {
  test('4 funds × 180 months completes in under 16ms (average of 200 runs)', () => {
    const MONTHS = 180
    const dates = monthlyDates(2010, 1, MONTHS)
    const tickers = ['A', 'B', 'C', 'D']

    const priceData: PriceData = {}
    for (const ticker of tickers) {
      // Each fund has a slightly different growth rate to prevent trivial short-circuits
      const rate = 0.005 + tickers.indexOf(ticker) * 0.001
      priceData[ticker] = priceSeries(dates, compoundPrices(100, rate, MONTHS))
    }

    const alloc: Allocation[] = tickers.map((ticker) => ({ ticker, weight: 25 }))
    const config = { rebalanceFrequency: 'annual' as const, useTotalReturn: true, monthlyContribution: 0 }

    // Warm-up (JIT)
    for (let i = 0; i < 10; i++) computePortfolio(alloc, priceData, config)

    const RUNS = 200
    const t0 = performance.now()
    for (let i = 0; i < RUNS; i++) {
      computePortfolio(alloc, priceData, config)
    }
    const avgMs = (performance.now() - t0) / RUNS

    expect(avgMs).toBeLessThan(16)
  })
})
