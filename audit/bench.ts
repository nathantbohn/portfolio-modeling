/**
 * Phase 4 audit benchmark — run with:  npx tsx audit/bench.ts   (from repo root)
 *
 * Loads the real static prices.json plus a synthetic 25-stock, 180-month
 * custom fund, and times the work App.tsx actually performs per slider frame:
 *   - computePortfolio (always)
 *   - calcRollingReturns on the result (always — rollingData memo depends on result)
 *   - computeBenchmark (only when the benchmark toggle is on — memo depends on result)
 *   - synthesizePriceData for each ACTIVE user-created custom fund
 *     (mergedPriceData's useMemo depends on activeFunds, whose identity changes
 *     every slider event, so synthesis re-runs per frame in the real app)
 *
 * 1000 iterations per scenario; reports p50 / p95 / max in ms.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import {
  computePortfolio,
  calcRollingReturns,
  computeBenchmark,
  type PortfolioConfig,
} from '../frontend/src/utils/calculations'
import { synthesizePriceData } from '../frontend/src/utils/synthesize'
import type { Allocation, PriceData, PricePoint, CustomFund } from '../frontend/src/types'

const here = dirname(fileURLToPath(import.meta.url))
const priceData: PriceData = JSON.parse(
  readFileSync(join(here, '../frontend/public/data/prices.json'), 'utf8'),
)

// ─── Synthetic 25-stock custom fund, 180 months (McMerica-25-like) ───────────
function monthlyDates(startYear: number, startMonth: number, count: number): string[] {
  const dates: string[] = []
  let y = startYear, m = startMonth
  for (let i = 0; i < count; i++) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-01`)
    if (++m > 12) { m = 1; y++ }
  }
  return dates
}

const DATES = monthlyDates(2011, 5, 180)
const stockPrices: Record<string, PricePoint[]> = {}
const stocks: CustomFund['stocks'] = []
let seed = 42
function rand(): number { // deterministic LCG
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}
for (let s = 0; s < 25; s++) {
  const ticker = `SYN${s}`
  let close = 50 + rand() * 100
  let adj = close
  const pts: PricePoint[] = []
  for (const date of DATES) {
    pts.push({ date, adjusted_close: adj, close })
    const r = 1 + (rand() - 0.48) * 0.12 // ±6%-ish monthly moves, slight drift
    close *= r
    adj *= r * 1.0015 // dividend spread
  }
  stockPrices[ticker] = pts
  stocks.push({ ticker, name: ticker, weight: 4 })
}
const customFund: CustomFund = {
  id: 'CUSTOM-bench',
  name: 'Synthetic 25',
  color: '#000',
  weightMode: 'equal',
  stocks,
}

// ─── Scenarios ───────────────────────────────────────────────────────────────
interface Scenario {
  name: string
  allocations: Allocation[]
  config: PortfolioConfig
  withCustom: boolean
  withBenchmark: boolean
}

const baseCfg: PortfolioConfig = { rebalanceFrequency: 'annual', useTotalReturn: true, monthlyContribution: 0 }

const scenarios: Scenario[] = [
  {
    name: '2 ETFs (VOO/BND 60/40, annual rebal)',
    allocations: [{ ticker: 'VOO', weight: 60 }, { ticker: 'BND', weight: 40 }],
    config: baseCfg, withCustom: false, withBenchmark: false,
  },
  {
    name: '4 ETFs (25×4, annual rebal)',
    allocations: ['VOO', 'BND', 'VXUS', 'QQQ'].map((ticker) => ({ ticker, weight: 25 })),
    config: baseCfg, withCustom: false, withBenchmark: false,
  },
  {
    name: 'Custom-25 + 2 ETFs (40/30/30, annual rebal)',
    allocations: [
      { ticker: 'CUSTOM-bench', weight: 40 },
      { ticker: 'VOO', weight: 30 },
      { ticker: 'BND', weight: 30 },
    ],
    config: baseCfg, withCustom: true, withBenchmark: false,
  },
  {
    name: 'Custom-25 + 3 ETFs, monthly rebal + contributions (worst case) + benchmark',
    allocations: [
      { ticker: 'CUSTOM-bench', weight: 25 },
      { ticker: 'VOO', weight: 25 },
      { ticker: 'BND', weight: 25 },
      { ticker: 'VXUS', weight: 25 },
    ],
    config: { rebalanceFrequency: 'monthly', useTotalReturn: true, monthlyContribution: 500 },
    withCustom: true, withBenchmark: true,
  },
]

// ─── Timing ──────────────────────────────────────────────────────────────────
function frame(s: Scenario): number {
  const data: PriceData = s.withCustom
    ? { ...priceData, 'CUSTOM-bench': synthesizePriceData(customFund, stockPrices) }
    : priceData
  const result = computePortfolio(s.allocations, data, s.config, 10_000)
  const rolling = calcRollingReturns(result.cumulativeValues, 12)
  let bench: unknown = null
  if (s.withBenchmark) {
    bench = computeBenchmark(data, s.config.useTotalReturn, result.cumulativeValues.map((p) => p.date), 10_000, s.config.monthlyContribution)
  }
  // return something so nothing is dead-code-eliminated
  return result.cumulativeValues.length + rolling.length + (bench ? 1 : 0)
}

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

const ITER = 1000
console.log(`node ${process.version} — ${ITER} iterations per scenario\n`)
for (const s of scenarios) {
  // warm-up
  for (let i = 0; i < 50; i++) frame(s)
  const times: number[] = new Array(ITER)
  for (let i = 0; i < ITER; i++) {
    const t0 = performance.now()
    frame(s)
    times[i] = performance.now() - t0
  }
  times.sort((a, b) => a - b)
  console.log(s.name)
  console.log(`  p50 ${pct(times, 50).toFixed(3)} ms   p95 ${pct(times, 95).toFixed(3)} ms   max ${times[ITER - 1].toFixed(3)} ms\n`)
}

// Also isolate the pieces for the worst-case scenario
const s = scenarios[3]
const mergedOnce: PriceData = { ...priceData, 'CUSTOM-bench': synthesizePriceData(customFund, stockPrices) }
function timeIt(label: string, fn: () => unknown) {
  for (let i = 0; i < 50; i++) fn()
  const times: number[] = new Array(ITER)
  for (let i = 0; i < ITER; i++) {
    const t0 = performance.now()
    fn()
    times[i] = performance.now() - t0
  }
  times.sort((a, b) => a - b)
  console.log(`${label}: p50 ${pct(times, 50).toFixed(3)} ms   p95 ${pct(times, 95).toFixed(3)} ms`)
}
console.log('— worst-case scenario decomposition —')
timeIt('synthesizePriceData (25 stocks × 180 mo)', () => synthesizePriceData(customFund, stockPrices))
timeIt('computePortfolio only (pre-merged data)', () => computePortfolio(s.allocations, mergedOnce, s.config, 10_000))
const res = computePortfolio(s.allocations, mergedOnce, s.config, 10_000)
timeIt('calcRollingReturns (12 mo)', () => calcRollingReturns(res.cumulativeValues, 12))
timeIt('computeBenchmark', () => computeBenchmark(mergedOnce, true, res.cumulativeValues.map((p) => p.date), 10_000, 500))
