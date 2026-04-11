import type { Allocation, PriceData } from '../types'

export const RISK_FREE_RATE = 0.02 // 2% annual

// ─── Public types ────────────────────────────────────────────────────────────

export type RebalanceFrequency = 'none' | 'monthly' | 'quarterly' | 'semi-annual' | 'annual'

export interface PortfolioConfig {
  rebalanceFrequency: RebalanceFrequency
  useTotalReturn: boolean
  monthlyContribution: number
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
  capitalInvested: CumulativePoint[] // total capital deployed over time (principal + contributions)
  dividendValues: CumulativePoint[] // cumulative dividend income (only populated in price return mode)
  annualReturns: AnnualReturn[]
  cagr: number // time-weighted CAGR when no contributions, money-weighted IRR when contributions active
  useIRR: boolean // true when CAGR is actually IRR (contributions > 0)
  totalContributed: number // principal + all contributions
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
  // When in price return mode, also build adjusted close map for dividend calc
  const adjMap: Record<string, Record<string, number>> = {}
  for (const { ticker } of active) {
    const map: Record<string, number> = {}
    for (const p of priceData[ticker]) {
      map[p.date] = config.useTotalReturn ? p.adjusted_close : p.close
    }
    priceMap[ticker] = map

    if (!config.useTotalReturn) {
      const aMap: Record<string, number> = {}
      for (const p of priceData[ticker]) {
        aMap[p.date] = p.adjusted_close
      }
      adjMap[ticker] = aMap
    }
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
      capitalInvested: [{ date: dates[0], value: initialValue }],
      dividendValues: config.useTotalReturn ? [] : [{ date: dates[0], value: 0 }],
      annualReturns: [],
      cagr: 0,
      useIRR: false,
      totalContributed: initialValue,
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

  const contribution = config.monthlyContribution
  const hasContributions = contribution > 0

  const cumulativeValues: CumulativePoint[] = new Array(n)
  cumulativeValues[0] = { date: dates[0], value: initialValue }

  const capitalInvested: CumulativePoint[] = new Array(n)
  let totalInvested = initialValue
  capitalInvested[0] = { date: dates[0], value: totalInvested }

  // Track cumulative dividends in price return mode
  const trackDividends = !config.useTotalReturn
  const dividendValues: CumulativePoint[] = trackDividends ? new Array(n) : []
  let cumulativeDividend = 0
  if (trackDividends) {
    dividendValues[0] = { date: dates[0], value: 0 }
  }

  let prevDate = dates[0]
  let prevMonth = parseInt(dates[0].slice(5, 7), 10)
  let monthCount = 0
  const rebalPeriod =
    config.rebalanceFrequency === 'monthly' ? 1
    : config.rebalanceFrequency === 'quarterly' ? 3
    : config.rebalanceFrequency === 'semi-annual' ? 6
    : config.rebalanceFrequency === 'annual' ? 12
    : 0 // 'none'

  for (let i = 1; i < n; i++) {
    const date = dates[i]
    const month = parseInt(date.slice(5, 7), 10)

    // Count elapsed months for rebalance cadence
    if (month !== prevMonth) {
      monthCount++
      prevMonth = month
    }

    // Rebalance at the start of each period
    if (rebalPeriod > 0 && monthCount >= rebalPeriod) {
      monthCount = 0
      let total = 0
      for (const { ticker } of active) total += holdings[ticker]
      for (const { ticker } of active) holdings[ticker] = weights[ticker] * total
    }

    // Monthly contribution: add at start of month before price change
    if (hasContributions) {
      for (const { ticker } of active) {
        holdings[ticker] += weights[ticker] * contribution
      }
      totalInvested += contribution
    }

    // Grow each holding by its fund's price ratio, accumulate portfolio total
    let portfolioValue = 0
    for (const { ticker } of active) {
      const priceRatio = priceMap[ticker][date] / priceMap[ticker][prevDate]

      // Dividend income = difference between total return and price return, applied to holdings
      if (trackDividends) {
        const adjRatio = adjMap[ticker][date] / adjMap[ticker][prevDate]
        cumulativeDividend += holdings[ticker] * (adjRatio - priceRatio)
      }

      holdings[ticker] *= priceRatio
      portfolioValue += holdings[ticker]
    }

    cumulativeValues[i] = { date, value: portfolioValue }
    capitalInvested[i] = { date, value: totalInvested }
    if (trackDividends) {
      dividendValues[i] = { date, value: cumulativeDividend }
    }
    prevDate = date
  }

  // ── Derived statistics ─────────────────────────────────────────────────────

  // Monthly returns (n-1 values)
  const monthlyReturns = new Float64Array(n - 1)
  for (let i = 1; i < n; i++) {
    monthlyReturns[i - 1] = cumulativeValues[i].value / cumulativeValues[i - 1].value - 1
  }

  const finalValue = cumulativeValues[n - 1].value
  const useIRR = hasContributions
  let cagr: number

  if (useIRR) {
    // Money-weighted return (IRR) via Newton's method on monthly cashflows
    const cashflows = new Float64Array(n)
    cashflows[0] = -initialValue
    for (let i = 1; i < n - 1; i++) cashflows[i] = -contribution
    cashflows[n - 1] = -contribution + finalValue // last contribution + terminal value
    cagr = calcAnnualizedIRR(cashflows)
  } else {
    // Time-weighted CAGR
    const t0 = new Date(dates[0]).getTime()
    const t1 = new Date(dates[n - 1]).getTime()
    const years = (t1 - t0) / (365.25 * 24 * 60 * 60 * 1000)
    cagr = years > 0 ? Math.pow(finalValue / initialValue, 1 / years) - 1 : 0
  }

  const annualizedVolatility = calcAnnualizedVol(monthlyReturns)
  const maxDrawdown = calcMaxDrawdown(cumulativeValues)
  const sharpeRatio = annualizedVolatility > 0 ? (cagr - RISK_FREE_RATE) / annualizedVolatility : 0
  const annualReturns = calcAnnualReturns(cumulativeValues)

  return {
    cumulativeValues, capitalInvested, dividendValues, annualReturns,
    cagr, useIRR, totalContributed: totalInvested,
    annualizedVolatility, maxDrawdown, sharpeRatio,
  }
}

// ─── Rolling returns ────────────────────────────────────────────────────────

export interface RollingReturnPoint {
  date: string
  return: number // e.g. 0.12 = 12%
}

/** Trailing rolling return over `months` months from cumulative values (monthly data). */
export function calcRollingReturns(
  values: CumulativePoint[],
  months: number,
): RollingReturnPoint[] {
  if (values.length <= months) return []
  const result: RollingReturnPoint[] = new Array(values.length - months)
  for (let i = months; i < values.length; i++) {
    result[i - months] = {
      date: values[i].date,
      return: values[i].value / values[i - months].value - 1,
    }
  }
  return result
}

// ─── Benchmark (100% VOO) ───────────────────────────────────────────────────

export function computeBenchmark(
  priceData: PriceData,
  useTotalReturn: boolean,
  dates: string[],
  initialValue: number,
  monthlyContribution: number = 0,
): CumulativePoint[] {
  const vooData = priceData['VOO']
  if (!vooData || vooData.length === 0 || dates.length === 0) return []

  const priceMap: Record<string, number> = {}
  for (const p of vooData) {
    priceMap[p.date] = useTotalReturn ? p.adjusted_close : p.close
  }

  // Filter to dates that exist in VOO data
  const validDates = dates.filter((d) => d in priceMap)
  if (validDates.length === 0) return []

  const result: CumulativePoint[] = [{ date: validDates[0], value: initialValue }]
  let value = initialValue

  for (let i = 1; i < validDates.length; i++) {
    // Add contribution before price change, mirroring portfolio simulation
    if (monthlyContribution > 0) value += monthlyContribution
    value *= priceMap[validDates[i]] / priceMap[validDates[i - 1]]
    result.push({ date: validDates[i], value })
  }

  return result
}

// ─── Fixed Y-axis bounds ────────────────────────────────────────────────────

export interface ChartBounds {
  cumulativeMax: number
  annualReturnMax: number // max absolute annual return across all single-fund sims
}

/**
 * Simulate 100% allocation in each available fund to find the extreme Y values.
 * These become the fixed axis bounds so the chart doesn't rescale on allocation changes.
 */
export function computeChartBounds(
  priceData: PriceData,
  config: PortfolioConfig,
  initialValue: number,
): ChartBounds {
  const tickers = Object.keys(priceData)
  let cumulativeMax = initialValue
  let annualReturnMax = 0.05 // minimum floor

  for (const ticker of tickers) {
    const result = computePortfolio(
      [{ ticker, weight: 100 }],
      priceData,
      config,
      initialValue,
    )
    for (const pt of result.cumulativeValues) {
      if (pt.value > cumulativeMax) cumulativeMax = pt.value
    }
    for (const ar of result.annualReturns) {
      const abs = Math.abs(ar.return)
      if (abs > annualReturnMax) annualReturnMax = abs
    }
  }

  return { cumulativeMax, annualReturnMax }
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

/**
 * Compute annualized IRR from evenly-spaced monthly cashflows via Newton's method.
 * cashflows[0] is typically negative (initial investment), last element includes terminal value.
 * Returns annualized rate: (1 + monthly_irr)^12 - 1.
 */
function calcAnnualizedIRR(cashflows: Float64Array, maxIter = 50, tol = 1e-8): number {
  const n = cashflows.length
  let r = 0.005 // initial guess: 0.5% monthly

  for (let iter = 0; iter < maxIter; iter++) {
    let npv = 0
    let dnpv = 0
    for (let i = 0; i < n; i++) {
      const disc = Math.pow(1 + r, i)
      npv += cashflows[i] / disc
      dnpv -= i * cashflows[i] / (disc * (1 + r))
    }
    if (Math.abs(dnpv) < 1e-15) break
    const step = npv / dnpv
    r -= step
    if (Math.abs(step) < tol) break
  }

  return Math.pow(1 + r, 12) - 1
}

function emptyResult(): PortfolioResult {
  return {
    cumulativeValues: [],
    capitalInvested: [],
    dividendValues: [],
    annualReturns: [],
    cagr: 0,
    useIRR: false,
    totalContributed: 0,
    annualizedVolatility: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
  }
}
