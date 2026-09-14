/**
 * Phase 3 audit tests — auto-rebalance redistribution with fund locking.
 * Expected values computed by hand in comments (following the documented
 * algorithm in applyWeightChange), never derived from the code under test.
 */
import { describe, test, expect } from 'vitest'
import { applyWeightChange } from './usePortfolio'
import type { Allocation } from '../types'

function w(funds: Allocation[], ticker: string) {
  return funds.find((f) => f.ticker === ticker)!.weight
}

function sum(funds: Allocation[]) {
  return funds.reduce((s, f) => s + f.weight, 0)
}

describe('auto-rebalance with locked funds', () => {
  test('locked fund keeps its weight; only unlocked funds absorb the delta', () => {
    // A=50, B=30 (locked), C=20. Set A → 60 (delta +10).
    // Locked total = 30, remainder = 100 − 60 − 30 = 10.
    // Only C absorbs: 20 − 10×(20/20) = 10.
    const funds: Allocation[] = [
      { ticker: 'A', weight: 50 },
      { ticker: 'B', weight: 30, locked: true },
      { ticker: 'C', weight: 20 },
    ]
    const r = applyWeightChange(funds, 'A', 60)
    expect(w(r, 'A')).toBeCloseTo(60, 10)
    expect(w(r, 'B')).toBe(30)
    expect(w(r, 'C')).toBeCloseTo(10, 10)
    expect(sum(r)).toBeCloseTo(100, 10)
  })

  test('two unlocked funds absorb proportionally around a locked one', () => {
    // A=40, B=20 (locked), C=30, D=10. Set A → 60 (delta +20).
    // Unlocked others: C=30, D=10 (total 40). Remainder = 100−60−20 = 20.
    // C: 30 − 20×(30/40) = 15; D: 10 − 20×(10/40) = 5. Sum 20 = remainder, no rescale.
    const funds: Allocation[] = [
      { ticker: 'A', weight: 40 },
      { ticker: 'B', weight: 20, locked: true },
      { ticker: 'C', weight: 30 },
      { ticker: 'D', weight: 10 },
    ]
    const r = applyWeightChange(funds, 'A', 60)
    expect(w(r, 'A')).toBeCloseTo(60, 10)
    expect(w(r, 'B')).toBe(20)
    expect(w(r, 'C')).toBeCloseTo(15, 10)
    expect(w(r, 'D')).toBeCloseTo(5, 10)
    expect(sum(r)).toBeCloseTo(100, 10)
  })

  test('raising a weight is capped so locked + new never exceeds 100', () => {
    // A=50, B=30 (locked), C=20. Ask for A=90.
    // Cap: min(90, 100 − 30) = 70. Remainder = 0 → C driven to 0.
    const funds: Allocation[] = [
      { ticker: 'A', weight: 50 },
      { ticker: 'B', weight: 30, locked: true },
      { ticker: 'C', weight: 20 },
    ]
    const r = applyWeightChange(funds, 'A', 90)
    expect(w(r, 'A')).toBeCloseTo(70, 10)
    expect(w(r, 'B')).toBe(30)
    expect(w(r, 'C')).toBeCloseTo(0, 10)
    expect(sum(r)).toBeCloseTo(100, 10)
  })

  test('lowering a weight distributes only to unlocked funds', () => {
    // A=50, B=30 (locked), C=20. Set A → 30 (delta −20).
    // Remainder = 100 − 30 − 30 = 40. C: 20 − (−20)×(20/20) = 40.
    const funds: Allocation[] = [
      { ticker: 'A', weight: 50 },
      { ticker: 'B', weight: 30, locked: true },
      { ticker: 'C', weight: 20 },
    ]
    const r = applyWeightChange(funds, 'A', 30)
    expect(w(r, 'A')).toBeCloseTo(30, 10)
    expect(w(r, 'B')).toBe(30)
    expect(w(r, 'C')).toBeCloseTo(40, 10)
    expect(sum(r)).toBeCloseTo(100, 10)
  })

  test('all others locked: the slider is fully constrained by the locked total', () => {
    // A=50, B=50 (locked). Any request for A caps at 100−50 = 50 and no
    // unlocked others exist (edge case A in the algorithm distributes to none).
    const funds: Allocation[] = [
      { ticker: 'A', weight: 50 },
      { ticker: 'B', weight: 50, locked: true },
    ]
    const r = applyWeightChange(funds, 'A', 80)
    expect(w(r, 'A')).toBeCloseTo(50, 10)
    expect(w(r, 'B')).toBe(50)
    expect(sum(r)).toBeCloseTo(100, 10)
  })

  test('unlocked others at 0%: remainder splits evenly among them, locked untouched', () => {
    // A=70, B=30 (locked), C=0, D=0. Set A → 40.
    // Remainder = 100 − 40 − 30 = 30 → C and D get 15 each.
    const funds: Allocation[] = [
      { ticker: 'A', weight: 70 },
      { ticker: 'B', weight: 30, locked: true },
      { ticker: 'C', weight: 0 },
      { ticker: 'D', weight: 0 },
    ]
    const r = applyWeightChange(funds, 'A', 40)
    expect(w(r, 'A')).toBeCloseTo(40, 10)
    expect(w(r, 'B')).toBe(30)
    expect(w(r, 'C')).toBeCloseTo(15, 10)
    expect(w(r, 'D')).toBeCloseTo(15, 10)
    expect(sum(r)).toBeCloseTo(100, 10)
  })
})
