import type { Allocation, PriceData } from '../types'

export const RISK_FREE_RATE = 0.02 // 2% annual

// ─── Public types ────────────────────────────────────────────────────────────

export interface PortfolioConfig {
  rebalance: boolean
  useTotalReturn: boolean
}

export interface CumulativePoint {
  date: string
  value: number
}

export interface AnnualReturn {
  year: number
  return: number // e.g. 0.12 = 12%
}

export interface PortfolioResult {
  cumulativeValues: CumulativePoint[]
  annualReturns: AnnualReturn[]
  cagr: number
  annualizedVolatility: number
  maxDrawdown: number
  sharpeRatio: number
}

// ─── Main entry point ────────────────────────────────────────────────────────

export function computePortfolio(
  allocations: Allocation[],
  priceData: PriceData,
  config: PortfolioConfig,
  initialValue: number = 10_000,
): PortfolioResult {
  // Only funds with weight > 0 and available data participate
  const active = allocations.filter(
    (a) => a.weight > 0 && priceData[a.ticker] != null && priceData[a.ticker].length > 0,
  )

  if (active.length === 0) return emptyResult()

  // Normalise weights to fractions (handles cases where active weights don't sum exactly to 100)
  const totalWeight = active.reduce((s, a) => s + a.weight, 0)
  const weights: Record<string, number> = {}
  for (const a of active) {
    weights[a.ticker] = a.weight / totalWeight
  }

  // Build price lookup: ticker → date → scalar price
  const priceMap: Record<string, Record<string, number>> = {}
  for (const { ticker } of active) {
    const map: Record<string, number> = {}
    for (const p of priceData[ticker]) {
      map[p.date] = config.useTotalReturn ? p.adjusted_close : p.close
    }
    priceMap[ticker] = map
  }

  // Intersection of dates present in every active ticker, sorted ascending
  const firstMap = priceMap[active[0].ticker]
  const dates: string[] = []
  for (const date in firstMap) {
    if (active.every((a) => date in priceMap[a.ticker])) {
      dates.push(date)
    }
  }
  dates.sort()

  if (dates.length === 0) return emptyResult()

  if (dates.length === 1) {
    return {
      cumulativeValues: [{ date: dates[0], value: initialValue }],
      annualReturns: [],
      cagr: 0,
      annualizedVolatility: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
    }
  }

  // ── Simulate holdings ──────────────────────────────────────────────────────

  const n = dates.length
  const holdings: Record<string, number> = {}
  for (const { ticker } of active) {
    holdings[ticker] = weights[ticker] * initialValue
  }

  const cumulativeValues: CumulativePoint[] = new Array(n)
  cumulativeValues[0] = { date: dates[0], value: initialValue }

  let prevDate = dates[0]
  let prevYear = dates[0].slice(0, 4)

  for (let i = 1; i < n; i++) {
    const date = dates[i]
    const year = date.slice(0, 4)

    // Annual rebalance: reset to target weights at the start of each new calendar year,
    // before computing that month's price change.
    if (config.rebalance && year !== prevYear) {
      let total = 0
      for (const { ticker } of active) total += holdings[ticker]
      for (const { ticker } of active) holdings[ticker] = weights[ticker] * total
    }

    // Grow each holding by its fund's price ratio, accumulate portfolio total
    let portfolioValue = 0
    for (const { ticker } of active) {
      holdings[ticker] *= priceMap[ticker][date] / priceMap[ticker][prevDate]
      portfolioValue += holdings[ticker]
    }

    cumulativeValues[i] = { date, value: portfolioValue }
    prevDate = date
    prevYear = year
  }

  // ── Derived statistics ─────────────────────────────────────────────────────

  // Monthly returns (n-1 values)
  const monthlyReturns = new Float64Array(n - 1)
  for (let i = 1; i < n; i++) {
    monthlyReturns[i - 1] = cumulativeValues[i].value / cumulativeValues[i - 1].value - 1
  }

  // CAGR: date-based year span so leap years are handled correctly
  const t0 = new Date(dates[0]).getTime()
  const t1 = new Date(dates[n - 1]).getTime()
  const years = (t1 - t0) / (365.25 * 24 * 60 * 60 * 1000)
  const finalValue = cumulativeValues[n - 1].value
  const cagr = years > 0 ? Math.pow(finalValue / initialValue, 1 / years) - 1 : 0

  const annualizedVolatility = calcAnnualizedVol(monthlyReturns)
  const maxDrawdown = calcMaxDrawdown(cumulativeValues)
  const sharpeRatio = annualizedVolatility > 0 ? (cagr - RISK_FREE_RATE) / annualizedVolatility : 0
  const annualReturns = calcAnnualReturns(cumulativeValues)

  return { cumulativeValues, annualReturns, cagr, annualizedVolatility, maxDrawdown, sharpeRatio }
}

// ─── Internal helpers (exported for testing) ─────────────────────────────────

/** Sample standard deviation of monthly returns, scaled to annual. */
export function calcAnnualizedVol(returns: Float64Array): number {
  const n = returns.length
  if (n < 2) return 0

  let sum = 0
  for (let i = 0; i < n; i++) sum += returns[i]
  const mean = sum / n

  let variance = 0
  for (let i = 0; i < n; i++) {
    const d = returns[i] - mean
    variance += d * d
  }
  variance /= n - 1 // Bessel's correction

  return Math.sqrt(variance * 12) // annualise: σ_monthly × √12
}

/** Largest peak-to-trough decline as a positive fraction (e.g. 0.30 = 30%). */
export function calcMaxDrawdown(values: CumulativePoint[]): number {
  let peak = values[0].value
  let drawdown = 0

  for (let i = 1; i < values.length; i++) {
    const v = values[i].value
    if (v > peak) {
      peak = v
    } else {
      const dd = (peak - v) / peak
      if (dd > drawdown) drawdown = dd
    }
  }

  return drawdown
}

/**
 * Return for each calendar year.
 * First year uses the initial $10,000 as start; subsequent years use the
 * previous year-end value, so partial first/last years are included as-is.
 */
export function calcAnnualReturns(values: CumulativePoint[]): AnnualReturn[] {
  // Last portfolio value per year (chronological iteration → last write wins)
  const lastByYear = new Map<number, number>()
  for (const { date, value } of values) {
    lastByYear.set(parseInt(date.slice(0, 4), 10), value)
  }

  const years = [...lastByYear.keys()].sort((a, b) => a - b)
  const result: AnnualReturn[] = []

  for (let i = 0; i < years.length; i++) {
    const year = years[i]
    const endVal = lastByYear.get(year)!
    const startVal = i === 0 ? values[0].value : lastByYear.get(years[i - 1])!
    result.push({ year, return: endVal / startVal - 1 })
  }

  return result
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function emptyResult(): PortfolioResult {
  return {
    cumulativeValues: [],
    annualReturns: [],
    cagr: 0,
    annualizedVolatility: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
  }
}
