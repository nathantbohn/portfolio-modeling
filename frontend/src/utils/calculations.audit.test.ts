/**
 * Phase 3 audit tests — calculation engine correctness.
 *
 * All expected values are computed BY HAND in the comments; none are derived by
 * running the code under test. Three tests in the "KNOWN DEFECTS" describe are
 * intentionally failing findings (see audit/03_calc_correctness.md) and are
 * left in place per the audit instructions:
 *   - volatility counts contribution cashflows as market returns
 *   - max drawdown is masked by contribution cashflows
 *   - IRR discounts each contribution one month later than the simulation invests it
 */
import { describe, test, expect } from 'vitest'
import {
  computePortfolio,
  computeBenchmark,
  computeChartBounds,
  calcRollingReturns,
  calcMaxDrawdown,
  calcAnnualReturns,
  RISK_FREE_RATE,
} from './calculations'
import type { Allocation, PriceData, PricePoint } from '../types'

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

function priceSeries(dates: string[], prices: number[], adjPrices?: number[]): PricePoint[] {
  return dates.map((date, i) => ({
    date,
    adjusted_close: adjPrices ? adjPrices[i] : prices[i],
    close: prices[i],
  }))
}

const CFG = { rebalanceFrequency: 'none', useTotalReturn: true, monthlyContribution: 0 } as const

// ─── Rebalancing frequencies vs hand calculation ─────────────────────────────

describe('rebalancing frequency — hand-computed', () => {
  // Fund A gains exactly 10%/month, Fund B is flat. 50/50 target.
  test('monthly rebalance matches hand calc (2 funds, 2 growth steps)', () => {
    // Dates: Jan, Feb, Mar 2020. A: 100, 110, 121. B: 100, 100, 100.
    // Start: A=5000, B=5000.
    // i=1 (Feb): rebalance (already 50/50, no-op). A→5500, B=5000. Total 10500.
    // i=2 (Mar): rebalance → 5250/5250. A→5775, B=5250. Total 11025.
    // Equivalent closed form: 10000 × 1.05² = 11025 (portfolio return is 5%/month).
    const dates = monthlyDates(2020, 1, 3)
    const data: PriceData = {
      A: priceSeries(dates, [100, 110, 121]),
      B: priceSeries(dates, [100, 100, 100]),
    }
    const alloc: Allocation[] = [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }]

    const r = computePortfolio(alloc, data, { ...CFG, rebalanceFrequency: 'monthly' })
    expect(r.cumulativeValues[1].value).toBeCloseTo(10_500, 6)
    expect(r.cumulativeValues[2].value).toBeCloseTo(11_025, 6)
  })

  test('buy-and-hold (none) matches hand calc on the same fixture', () => {
    // Same data. No rebalance: A=5000→5000×1.1²=6050, B=5000. Total 11050.
    const dates = monthlyDates(2020, 1, 3)
    const data: PriceData = {
      A: priceSeries(dates, [100, 110, 121]),
      B: priceSeries(dates, [100, 100, 100]),
    }
    const alloc: Allocation[] = [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }]

    const r = computePortfolio(alloc, data, CFG)
    expect(r.cumulativeValues[2].value).toBeCloseTo(11_050, 6)
  })

  test('annual rebalance fires on the 12th month boundary from series start', () => {
    // 13 dates Jan 2020..Jan 2021, A gains 10%/month, B flat, 50/50.
    // The engine rebalances at step i=12 (2021-01) BEFORE applying that month's
    // price change (note: anniversary of series start, not calendar year end).
    // After 11 growth steps: A = 5000×1.1^11, B = 5000.
    //   T = 5000×(1.1^11 + 1)
    // Rebalance → T/2 each. 12th growth: A = T/2×1.1, B = T/2.
    //   Final = T × 1.05 = 5000×(1.1^11 + 1) × 1.05
    const dates = monthlyDates(2020, 1, 13)
    const aPrices = Array.from({ length: 13 }, (_, i) => 100 * Math.pow(1.1, i))
    const data: PriceData = {
      A: priceSeries(dates, aPrices),
      B: priceSeries(dates, Array(13).fill(100)),
    }
    const alloc: Allocation[] = [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }]

    const expected = 5000 * (Math.pow(1.1, 11) + 1) * 1.05
    const r = computePortfolio(alloc, data, { ...CFG, rebalanceFrequency: 'annual' })
    expect(r.cumulativeValues[12].value).toBeCloseTo(expected, 6)

    // And buy-and-hold differs: 5000×1.1^12 + 5000
    const none = computePortfolio(alloc, data, CFG)
    expect(none.cumulativeValues[12].value).toBeCloseTo(5000 * Math.pow(1.1, 12) + 5000, 6)
    expect(r.cumulativeValues[12].value).not.toBeCloseTo(none.cumulativeValues[12].value, 2)
  })

  test('quarterly rebalance matches hand calc', () => {
    // 7 dates Jan..Jul 2020 (6 growth steps). A +10%/month, B flat, 50/50.
    // Rebalances at i=3 (Apr) and i=6 (Jul), each BEFORE that month's growth.
    // i=1: A=5500, B=5000
    // i=2: A=6050, B=5000                          (total 11050)
    // i=3: rebal → 5525/5525; A→6077.5             (total 11602.5)
    // i=4: A=6685.25                               (total 12210.25)
    // i=5: A=7353.775                              (total 12878.775)
    // i=6: rebal → 6439.3875/6439.3875; A→7083.32625 → final 13522.71375
    const dates = monthlyDates(2020, 1, 7)
    const aPrices = Array.from({ length: 7 }, (_, i) => 100 * Math.pow(1.1, i))
    const data: PriceData = {
      A: priceSeries(dates, aPrices),
      B: priceSeries(dates, Array(7).fill(100)),
    }
    const alloc: Allocation[] = [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }]

    const r = computePortfolio(alloc, data, { ...CFG, rebalanceFrequency: 'quarterly' })
    expect(r.cumulativeValues[6].value).toBeCloseTo(13_522.71375, 6)
  })

  test('all four frequencies produce distinct results on a divergent fixture', () => {
    // 25 dates (24 steps). A +10%/month, B flat → any rebalance cadence differs.
    const dates = monthlyDates(2020, 1, 25)
    const aPrices = Array.from({ length: 25 }, (_, i) => 100 * Math.pow(1.1, i))
    const data: PriceData = {
      A: priceSeries(dates, aPrices),
      B: priceSeries(dates, Array(25).fill(100)),
    }
    const alloc: Allocation[] = [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }]

    const finals = (['monthly', 'quarterly', 'semi-annual', 'annual', 'none'] as const).map(
      (f) => computePortfolio(alloc, data, { ...CFG, rebalanceFrequency: f }).cumulativeValues.at(-1)!.value,
    )
    const unique = new Set(finals.map((v) => v.toFixed(4)))
    expect(unique.size).toBe(5)
  })
})

// ─── Contributions ───────────────────────────────────────────────────────────

describe('contributions', () => {
  test('capital-invested line rises by the contribution each month', () => {
    // Principal 1000, contribution 100/month, flat prices, 4 dates.
    // capitalInvested: [1000, 1100, 1200, 1300]; with flat prices the
    // portfolio value equals capital invested at every point.
    const dates = monthlyDates(2020, 1, 4)
    const data: PriceData = { A: priceSeries(dates, [100, 100, 100, 100]) }
    const alloc: Allocation[] = [{ ticker: 'A', weight: 100 }]

    const r = computePortfolio(alloc, data, { ...CFG, monthlyContribution: 100 }, 1000)
    expect(r.capitalInvested.map((p) => p.value)).toEqual([1000, 1100, 1200, 1300])
    expect(r.cumulativeValues.map((p) => p.value)).toEqual([1000, 1100, 1200, 1300])
    expect(r.totalContributed).toBe(1300)
    expect(r.useIRR).toBe(true)
  })

  test('contribution is invested at the start of the month (earns that month\'s return)', () => {
    // Principal 1000, contribution 100. Price doubles in month 1 (2 dates).
    // Sim: (1000 + 100) × 2 = 2200.
    const dates = monthlyDates(2020, 1, 2)
    const data: PriceData = { A: priceSeries(dates, [100, 200]) }
    const alloc: Allocation[] = [{ ticker: 'A', weight: 100 }]

    const r = computePortfolio(alloc, data, { ...CFG, monthlyContribution: 100 }, 1000)
    expect(r.cumulativeValues[1].value).toBeCloseTo(2200, 6)
  })

  test('time-weighted series is identical to the money-weighted series when contributions are 0', () => {
    // With no external cash flows there is nothing to strip out, so the two
    // series (and both CAGR fields) must coincide. Multi-fund, quarterly
    // rebalance, mixed up/down path so the check is not trivially satisfied.
    const dates = monthlyDates(2019, 3, 30)
    const a = Array.from({ length: 30 }, (_, i) => 100 * Math.pow(1.02, i) * (i % 3 === 0 ? 0.95 : 1))
    const b = Array.from({ length: 30 }, (_, i) => 80 + 10 * Math.sin(i / 2))
    const c = Array.from({ length: 30 }, (_, i) => 50 * Math.pow(0.995, i))
    const data: PriceData = {
      A: priceSeries(dates, a),
      B: priceSeries(dates, b),
      C: priceSeries(dates, c),
    }
    const alloc: Allocation[] = [
      { ticker: 'A', weight: 50 }, { ticker: 'B', weight: 30 }, { ticker: 'C', weight: 20 },
    ]

    const r = computePortfolio(alloc, data, { ...CFG, rebalanceFrequency: 'quarterly' }, 25_000)
    expect(r.useIRR).toBe(false)
    expect(r.timeWeightedValues).toHaveLength(r.cumulativeValues.length)
    for (let i = 0; i < r.cumulativeValues.length; i++) {
      expect(r.timeWeightedValues[i].date).toBe(r.cumulativeValues[i].date)
      expect(r.timeWeightedValues[i].value).toBeCloseTo(r.cumulativeValues[i].value, 8)
    }
    expect(r.timeWeightedCagr).toBeCloseTo(r.cagr, 12)
    // And the stats agree with recomputing them on the money-weighted series directly
    expect(r.maxDrawdown).toBeCloseTo(calcMaxDrawdown(r.cumulativeValues), 12)
    const annualFromMwr = calcAnnualReturns(r.cumulativeValues)
    expect(r.annualReturns).toHaveLength(annualFromMwr.length)
    for (let i = 0; i < annualFromMwr.length; i++) {
      expect(r.annualReturns[i].return).toBeCloseTo(annualFromMwr[i].return, 12)
    }
  })

  test('time-weighted series strips contribution cash flows but keeps market moves', () => {
    // Prices 100 → 110 → 99 (+10%, −10%); P = 1000, C = 500 each month.
    //   i=1: (1000+500) × 1.1 = 1650  → twr = 1650/1500 − 1 = +10%
    //   i=2: (1650+500) × 0.9 = 1935  → twr = 1935/2150 − 1 = −10%
    // MWR series [1000, 1650, 1935]; TWR series [1000, 1100, 990].
    const dates = monthlyDates(2020, 1, 3)
    const data: PriceData = { A: priceSeries(dates, [100, 110, 99]) }
    const r = computePortfolio(
      [{ ticker: 'A', weight: 100 }], data, { ...CFG, monthlyContribution: 500 }, 1000,
    )
    expect(r.cumulativeValues[1].value).toBeCloseTo(1650, 8)
    expect(r.cumulativeValues[2].value).toBeCloseTo(1935, 8)
    expect(r.timeWeightedValues[1].value).toBeCloseTo(1100, 8)
    expect(r.timeWeightedValues[2].value).toBeCloseTo(990, 8)
    // Max drawdown on the TWR series: (1100 − 990)/1100 = 10% (MWR series never falls)
    expect(r.maxDrawdown).toBeCloseTo(0.1, 8)
  })
})

// ─── Benchmark overlay ───────────────────────────────────────────────────────

describe('computeBenchmark', () => {
  test('benchmark equals a 100% VOO portfolio without contributions', () => {
    const dates = monthlyDates(2020, 1, 6)
    const voo = [100, 95, 105, 98, 110, 103]
    const data: PriceData = { VOO: priceSeries(dates, voo) }

    const portfolio = computePortfolio([{ ticker: 'VOO', weight: 100 }], data, CFG, 10_000)
    const bench = computeBenchmark(data, true, dates, 10_000, 0)

    expect(bench).toHaveLength(portfolio.cumulativeValues.length)
    for (let i = 0; i < bench.length; i++) {
      expect(bench[i].value).toBeCloseTo(portfolio.cumulativeValues[i].value, 8)
    }
  })

  test('benchmark mirrors the portfolio contribution timing exactly', () => {
    // Both add the contribution before applying the month's price ratio, so a
    // 100% VOO portfolio with contributions must equal the benchmark.
    // Hand check of the first two steps (P=10000, c=500):
    //   i=1: (10000+500) × 95/100  = 9975
    //   i=2: (9975+500) × 105/95   = 11577.63…
    const dates = monthlyDates(2020, 1, 6)
    const voo = [100, 95, 105, 98, 110, 103]
    const data: PriceData = { VOO: priceSeries(dates, voo) }

    const portfolio = computePortfolio(
      [{ ticker: 'VOO', weight: 100 }], data, { ...CFG, monthlyContribution: 500 }, 10_000,
    )
    const bench = computeBenchmark(data, true, dates, 10_000, 500)

    expect(bench[1].value).toBeCloseTo(10_500 * 95 / 100, 6)
    for (let i = 0; i < bench.length; i++) {
      expect(bench[i].value).toBeCloseTo(portfolio.cumulativeValues[i].value, 6)
    }
  })

  test('returns empty when VOO is absent from price data', () => {
    const dates = monthlyDates(2020, 1, 3)
    const data: PriceData = { A: priceSeries(dates, [100, 110, 121]) }
    expect(computeBenchmark(data, true, dates, 10_000, 0)).toHaveLength(0)
  })
})

// ─── Dividend tracking (price-return mode) ───────────────────────────────────

describe('dividend tracking', () => {
  test('cumulative dividends equal holdings × (adjusted ratio − price ratio)', () => {
    // close flat at 100 (price ratio 1.0); adjusted 100→102 (ratio 1.02).
    // Dividend month 1 = 10000 × (1.02 − 1.00) = 200. Portfolio value stays 10000.
    const dates = monthlyDates(2020, 1, 2)
    const data: PriceData = { A: priceSeries(dates, [100, 100], [100, 102]) }
    const alloc: Allocation[] = [{ ticker: 'A', weight: 100 }]

    const r = computePortfolio(alloc, data, { ...CFG, useTotalReturn: false }, 10_000)
    expect(r.cumulativeValues[1].value).toBeCloseTo(10_000, 6)
    expect(r.dividendValues[0].value).toBe(0)
    expect(r.dividendValues[1].value).toBeCloseTo(200, 8)
  })

  test('dividendValues is empty in total-return mode', () => {
    const dates = monthlyDates(2020, 1, 2)
    const data: PriceData = { A: priceSeries(dates, [100, 100], [100, 102]) }
    const r = computePortfolio([{ ticker: 'A', weight: 100 }], data, CFG, 10_000)
    expect(r.dividendValues).toHaveLength(0)
  })
})

// ─── Rolling returns ─────────────────────────────────────────────────────────

describe('calcRollingReturns', () => {
  test('hand-computed 2-month rolling returns', () => {
    // Values 100, 110, 121, 133.1 (10%/month). Window 2 months:
    //   at index 2: 121/100 − 1   = 0.21
    //   at index 3: 133.1/110 − 1 = 0.21
    const values = [
      { date: '2020-01-01', value: 100 },
      { date: '2020-02-01', value: 110 },
      { date: '2020-03-01', value: 121 },
      { date: '2020-04-01', value: 133.1 },
    ]
    const rr = calcRollingReturns(values, 2)
    expect(rr).toHaveLength(2)
    expect(rr[0].date).toBe('2020-03-01')
    expect(rr[0].return).toBeCloseTo(0.21, 10)
    expect(rr[1].date).toBe('2020-04-01')
    expect(rr[1].return).toBeCloseTo(0.21, 10)
  })

  test('returns empty when the series is not longer than the window', () => {
    const values = [
      { date: '2020-01-01', value: 100 },
      { date: '2020-02-01', value: 110 },
      { date: '2020-03-01', value: 121 },
    ]
    expect(calcRollingReturns(values, 3)).toHaveLength(0)
    expect(calcRollingReturns(values, 2)).toHaveLength(1)
  })
})

// ─── Fixed chart bounds ──────────────────────────────────────────────────────

describe('computeChartBounds', () => {
  test('bounds come from the extreme single-fund simulation', () => {
    // A doubles (10000 → 20000, +100% annual). B halves (10000 → 5000, −50%).
    // cumulativeMax = 20000; annualReturnMax = max(|1.0|, |−0.5|, 0.05 floor) = 1.0
    const dates = monthlyDates(2020, 1, 2)
    const data: PriceData = {
      A: priceSeries(dates, [100, 200]),
      B: priceSeries(dates, [100, 50]),
    }
    const bounds = computeChartBounds(data, CFG, 10_000)
    expect(bounds.cumulativeMax).toBeCloseTo(20_000, 6)
    expect(bounds.annualReturnMax).toBeCloseTo(1.0, 6)
  })
})

// ─── Sharpe ratio risk-free documentation ────────────────────────────────────

describe('Sharpe ratio assumptions (documented for the audit)', () => {
  test('risk-free rate is a hardcoded 2% annual, subtracted from CAGR', () => {
    // Documented finding, not a defect per se: Sharpe = (CAGR − 0.02) / annualizedVol.
    // Note (a) 2% is hardcoded, (b) the numerator is a geometric annual return
    // (or IRR when contributions are active — see KNOWN DEFECTS), not the mean
    // monthly excess return convention.
    expect(RISK_FREE_RATE).toBe(0.02)

    const dates = monthlyDates(2020, 1, 13)
    const prices = [100, 95, 105, 98, 110, 103, 115, 108, 120, 112, 125, 118, 130]
    const data: PriceData = { A: priceSeries(dates, prices) }
    const r = computePortfolio([{ ticker: 'A', weight: 100 }], data, CFG)
    expect(r.sharpeRatio).toBeCloseTo((r.cagr - 0.02) / r.annualizedVolatility, 10)
  })
})

// ─── KNOWN DEFECTS — intentionally failing findings ──────────────────────────

describe('KNOWN DEFECTS (intentionally failing — see audit/03_calc_correctness.md)', () => {
  test('FINDING: volatility should be 0 for flat prices with contributions', () => {
    // Prices never move → there is zero market risk, so annualized volatility
    // must be 0. The engine derives monthly returns from the cumulative value
    // series, which contribution cashflows inflate:
    //   values [1000, 1100, 1200, 1300] → "returns" [10%, 9.09%, 8.33%] → vol > 0
    const dates = monthlyDates(2020, 1, 4)
    const data: PriceData = { A: priceSeries(dates, [100, 100, 100, 100]) }
    const r = computePortfolio(
      [{ ticker: 'A', weight: 100 }], data, { ...CFG, monthlyContribution: 100 }, 1000,
    )
    expect(r.annualizedVolatility).toBeCloseTo(0, 6)
  })

  test('FINDING: max drawdown should reflect market losses, not be masked by contributions', () => {
    // Prices: 100, 100, 50 → the market drops 50% in the last month.
    // With principal 10000 and a 10000 monthly contribution:
    //   i=1: 10000+10000 → 20000, flat → 20000
    //   i=2: 20000+10000 → 30000, ×0.5 → 15000
    // Cumulative series [10000, 20000, 15000] → engine reports (20000−15000)/20000 = 25%.
    // Time-weighted (industry convention: external flows excluded) drawdown is 50%.
    const dates = monthlyDates(2020, 1, 3)
    const data: PriceData = { A: priceSeries(dates, [100, 100, 50]) }
    const r = computePortfolio(
      [{ ticker: 'A', weight: 100 }], data, { ...CFG, monthlyContribution: 10_000 }, 10_000,
    )
    expect(r.maxDrawdown).toBeCloseTo(0.5, 6)
  })

  test('FINDING: IRR should discount contributions when they are invested, not one month later', () => {
    // 2 dates. P=10000, c=1200, price doubles ×1.1 in the single month.
    // The sim invests the contribution at the START of the month:
    //   final = (10000 + 1200) × 1.1 = 12320
    // So all 11200 of cash was invested at t=0 and grew 10% in one month:
    //   true monthly money-weighted return = 12320/11200 − 1 = 10%
    //   annualized: 1.1^12 − 1 ≈ 213.84%
    // The IRR cashflow vector instead places the contribution at t=1:
    //   [−10000, −1200 + 12320] → 1+r = 11120/10000 = 1.112 → 1.112^12 − 1 ≈ 257.6%
    const dates = monthlyDates(2020, 1, 2)
    const data: PriceData = { A: priceSeries(dates, [100, 110]) }
    const r = computePortfolio(
      [{ ticker: 'A', weight: 100 }], data, { ...CFG, monthlyContribution: 1200 }, 10_000,
    )
    expect(r.cagr).toBeCloseTo(Math.pow(1.1, 12) - 1, 2)
  })
})
