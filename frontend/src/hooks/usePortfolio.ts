import { useState, useCallback } from 'react'
import type { Allocation } from '../types'
import type { RebalanceFrequency } from '../utils/calculations'
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

  // Locked funds keep their weight; only unlocked others absorb the delta
  const lockedTotal = funds
    .filter((f) => f.ticker !== ticker && f.locked)
    .reduce((s, f) => s + f.weight, 0)

  // Cap so locked + new never exceeds 100
  const cappedWeight = Math.min(newWeight, 100 - lockedTotal)

  const unlocked = funds.filter((f) => f.ticker !== ticker && !f.locked)
  const unlockedTotal = unlocked.reduce((s, f) => s + f.weight, 0)
  const remainder = 100 - cappedWeight - lockedTotal

  // Edge case A: all unlocked others at 0% — distribute evenly.
  if (unlockedTotal === 0) {
    const each = unlocked.length > 0 ? remainder / unlocked.length : 0
    return funds.map((f) => {
      if (f.ticker === ticker) return { ...f, weight: cappedWeight }
      if (f.locked) return f
      return { ...f, weight: each }
    })
  }

  const delta = cappedWeight - funds[idx].weight

  // Proportional absorption among unlocked others
  const adjusted = unlocked.map((f) => ({
    ...f,
    weight: Math.max(0, f.weight - delta * (f.weight / unlockedTotal)),
  }))

  const adjTotal = adjusted.reduce((s, f) => s + f.weight, 0)

  // Edge case B: all unlocked others clamped to 0 — distribute evenly.
  if (adjTotal === 0) {
    const each = unlocked.length > 0 ? remainder / unlocked.length : 0
    const evenMap: Record<string, number> = {}
    for (const f of unlocked) evenMap[f.ticker] = each
    return funds.map((f) => {
      if (f.ticker === ticker) return { ...f, weight: cappedWeight }
      if (f.locked) return f
      return { ...f, weight: evenMap[f.ticker] }
    })
  }

  // Normalise so unlocked others sum to remainder.
  const scale = remainder / adjTotal
  const scaledMap: Record<string, number> = {}
  for (const f of adjusted) scaledMap[f.ticker] = f.weight * scale

  return funds.map((f) => {
    if (f.ticker === ticker) return { ...f, weight: cappedWeight }
    if (f.locked) return f
    return { ...f, weight: scaledMap[f.ticker] }
  })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface PortfolioState {
  activeFunds: Allocation[]
  setFunds: (funds: Allocation[]) => void
  addFund: (ticker: string) => void
  removeFund: (ticker: string) => void
  setWeight: (ticker: string, weight: number) => void
  toggleLock: (ticker: string) => void
  rebalanceFrequency: RebalanceFrequency
  setRebalanceFrequency: (v: RebalanceFrequency) => void
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
  const [rebalanceFrequency, setRebalanceFrequency] = useState<RebalanceFrequency>(urlInit.rebalanceFrequency ?? 'annual')
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
   * Remove a fund. Its weight is distributed among unlocked remaining funds
   * (evenly if all unlocked are at 0%, proportionally otherwise).
   */
  const removeFund = useCallback((ticker: string) => {
    setActiveFunds((prev) => {
      const target = prev.find((f) => f.ticker === ticker)
      if (!target) return prev

      const rest = prev.filter((f) => f.ticker !== ticker)
      if (rest.length === 0) return prev

      const unlocked = rest.filter((f) => !f.locked)
      if (unlocked.length === 0) {
        // All remaining are locked — distribute evenly anyway
        const share = target.weight / rest.length
        return rest.map((f) => ({ ...f, weight: f.weight + share }))
      }

      const share = target.weight / unlocked.length
      const unlockedSet = new Set(unlocked.map((f) => f.ticker))
      return rest.map((f) =>
        unlockedSet.has(f.ticker) ? { ...f, weight: f.weight + share } : f,
      )
    })
  }, [])

  /** Toggle lock on a fund. Prevents locking if locked total would reach 100%. */
  const toggleLock = useCallback((ticker: string) => {
    setActiveFunds((prev) => {
      const fund = prev.find((f) => f.ticker === ticker)
      if (!fund) return prev

      if (!fund.locked) {
        // Check if locking would leave no room for unlocked funds
        const lockedTotal = prev
          .filter((f) => f.locked)
          .reduce((s, f) => s + f.weight, 0)
        if (lockedTotal + fund.weight >= 100) return prev
      }

      return prev.map((f) =>
        f.ticker === ticker ? { ...f, locked: !f.locked } : f,
      )
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
    setFunds: setActiveFunds,
    addFund,
    removeFund,
    setWeight,
    toggleLock,
    rebalanceFrequency,
    setRebalanceFrequency,
    useTotalReturn,
    setUseTotalReturn,
    principal,
    setPrincipal,
    monthlyContribution,
    setMonthlyContribution,
  }
}
