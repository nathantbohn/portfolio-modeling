import { useState, useCallback } from 'react'
import type { Allocation } from '../types'
import { parseUrlState } from '../utils/urlState'

export const ALL_TICKERS = [
  'VOO', 'BND', 'VXUS', 'SCHD', 'SCHF',
  'SCHI', 'VTI', 'QQQ', 'BNDX', 'VBR',
] as const

export type Ticker = typeof ALL_TICKERS[number]

const MAX_FUNDS = 4

const DEFAULT_FUNDS: Allocation[] = [
  { ticker: 'VOO', weight: 60 },
  { ticker: 'BND', weight: 40 },
]

// ─── Pure helpers (also useful for tests) ────────────────────────────────────

/**
 * Apply a weight change to one fund while adjusting all others proportionally
 * so the total stays at exactly 100.
 *
 * Algorithm per CLAUDE.md §Auto-Rebalance Logic:
 *  1. Compute othersTotal.
 *  2. If othersTotal === 0 (or all others clamp to 0): distribute remainder evenly.
 *  3. Otherwise: each other fund absorbs –delta proportional to its current weight,
 *     clamped to [0, 100], then the whole others-slice is normalised to (100 – newWeight).
 *
 * Original fund order is preserved.
 */
export function applyWeightChange(
  funds: Allocation[],
  ticker: string,
  rawWeight: number,
): Allocation[] {
  const newWeight = Math.max(0, Math.min(100, rawWeight))
  const idx = funds.findIndex((f) => f.ticker === ticker)
  if (idx === -1) return funds

  const others = funds.filter((f) => f.ticker !== ticker)
  const othersTotal = others.reduce((s, f) => s + f.weight, 0)

  // Edge case A: all other funds are already at 0% — distribute evenly.
  if (othersTotal === 0) {
    const each = others.length > 0 ? (100 - newWeight) / others.length : 0
    return funds.map((f) =>
      f.ticker === ticker ? { ...f, weight: newWeight } : { ...f, weight: each },
    )
  }

  const delta = newWeight - funds[idx].weight

  // Proportional absorption of delta by each other fund.
  const adjusted = others.map((f) => ({
    ...f,
    weight: Math.max(0, f.weight - delta * (f.weight / othersTotal)),
  }))

  const adjTotal = adjusted.reduce((s, f) => s + f.weight, 0)

  // Edge case B: all others clamped to 0 after adjustment — distribute evenly.
  if (adjTotal === 0) {
    const each = others.length > 0 ? (100 - newWeight) / others.length : 0
    const evenMap: Record<string, number> = {}
    for (const f of others) evenMap[f.ticker] = each
    return funds.map((f) =>
      f.ticker === ticker
        ? { ...f, weight: newWeight }
        : { ...f, weight: evenMap[f.ticker] },
    )
  }

  // Normalise so others sum to exactly (100 – newWeight).
  const scale = (100 - newWeight) / adjTotal
  const scaledMap: Record<string, number> = {}
  for (const f of adjusted) scaledMap[f.ticker] = f.weight * scale

  return funds.map((f) =>
    f.ticker === ticker
      ? { ...f, weight: newWeight }
      : { ...f, weight: scaledMap[f.ticker] },
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface PortfolioState {
  activeFunds: Allocation[]
  addFund: (ticker: string) => void
  removeFund: (ticker: string) => void
  setWeight: (ticker: string, weight: number) => void
  rebalance: boolean
  setRebalance: (v: boolean) => void
  useTotalReturn: boolean
  setUseTotalReturn: (v: boolean) => void
  principal: number
  setPrincipal: (v: number) => void
  monthlyContribution: number
  setMonthlyContribution: (v: number) => void
}

export function usePortfolio(): PortfolioState {
  const [urlInit] = useState(() => parseUrlState())
  const [activeFunds, setActiveFunds] = useState<Allocation[]>(urlInit.funds ?? DEFAULT_FUNDS)
  const [rebalance, setRebalance] = useState(urlInit.rebalance ?? true)
  const [useTotalReturn, setUseTotalReturn] = useState(urlInit.totalReturn ?? true)
  const [principal, setPrincipal] = useState(urlInit.principal ?? 10_000)
  const [monthlyContribution, setMonthlyContribution] = useState(urlInit.contribute ?? 0)

  /** Add a fund at 0% weight. No-op if already active or the portfolio is full. */
  const addFund = useCallback((ticker: string) => {
    setActiveFunds((prev) => {
      if (prev.length >= MAX_FUNDS) return prev
      if (prev.some((f) => f.ticker === ticker)) return prev
      return [...prev, { ticker, weight: 0 }]
    })
  }, [])

  /**
   * Remove a fund. Its weight is distributed EVENLY across the remaining funds.
   * No-op if the fund is not active or it's the only fund.
   */
  const removeFund = useCallback((ticker: string) => {
    setActiveFunds((prev) => {
      const target = prev.find((f) => f.ticker === ticker)
      if (!target) return prev

      const rest = prev.filter((f) => f.ticker !== ticker)
      if (rest.length === 0) return prev // can't remove the last fund

      const share = target.weight / rest.length
      return rest.map((f) => ({ ...f, weight: f.weight + share }))
    })
  }, [])

  /**
   * Set one fund's weight; all other active funds adjust proportionally.
   * Maintains fund order. Total always stays at exactly 100.
   */
  const setWeight = useCallback((ticker: string, newWeight: number) => {
    setActiveFunds((prev) => applyWeightChange(prev, ticker, newWeight))
  }, [])

  return {
    activeFunds,
    addFund,
    removeFund,
    setWeight,
    rebalance,
    setRebalance,
    useTotalReturn,
    setUseTotalReturn,
    principal,
    setPrincipal,
    monthlyContribution,
    setMonthlyContribution,
  }
}
