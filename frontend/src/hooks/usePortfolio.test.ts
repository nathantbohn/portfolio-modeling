import { describe, test, expect } from 'vitest'
import { applyWeightChange } from './usePortfolio'
import type { Allocation } from '../types'

// ─── helpers ──────────────────────────────────────────────────────────────────

function sumWeights(funds: Allocation[]) {
  return funds.reduce((s, f) => s + f.weight, 0)
}

function w(funds: Allocation[], ticker: string) {
  return funds.find((f) => f.ticker === ticker)!.weight
}

const twoFunds: Allocation[] = [
  { ticker: 'A', weight: 60 },
  { ticker: 'B', weight: 40 },
]

const threeFunds: Allocation[] = [
  { ticker: 'A', weight: 50 },
  { ticker: 'B', weight: 30 },
  { ticker: 'C', weight: 20 },
]

// ─── sum invariant ────────────────────────────────────────────────────────────

describe('sum invariant: weights always total 100', () => {
  test('two-fund portfolio at various set points', () => {
    for (const target of [0, 10, 33.3, 50, 75, 100]) {
      const result = applyWeightChange(twoFunds, 'A', target)
      expect(sumWeights(result)).toBeCloseTo(100, 10)
    }
  })

  test('three-fund portfolio at various set points', () => {
    for (const target of [0, 25, 50, 80, 100]) {
      const result = applyWeightChange(threeFunds, 'A', target)
      expect(sumWeights(result)).toBeCloseTo(100, 10)
    }
  })

  test('sum holds after chained adjustments', () => {
    let funds = threeFunds
    funds = applyWeightChange(funds, 'A', 70)
    funds = applyWeightChange(funds, 'B', 20)
    funds = applyWeightChange(funds, 'C', 10)
    expect(sumWeights(funds)).toBeCloseTo(100, 10)
  })
})

// ─── proportional adjustment ──────────────────────────────────────────────────

describe('proportional adjustment of other funds', () => {
  test('two funds: other absorbs the entire delta', () => {
    const result = applyWeightChange(twoFunds, 'A', 80)
    expect(w(result, 'A')).toBeCloseTo(80, 10)
    expect(w(result, 'B')).toBeCloseTo(20, 10)
  })

  test('three funds: others shrink proportionally to their current weights', () => {
    // A: 50→70 (delta +20). B=30, C=20, othersTotal=50.
    // B absorbs: 30 – 20×(30/50) = 30 – 12 = 18
    // C absorbs: 20 – 20×(20/50) = 20 – 8  = 12
    const result = applyWeightChange(threeFunds, 'A', 70)
    expect(w(result, 'A')).toBeCloseTo(70, 10)
    expect(w(result, 'B')).toBeCloseTo(18, 10)
    expect(w(result, 'C')).toBeCloseTo(12, 10)
  })

  test('decreasing a weight: others grow proportionally', () => {
    // A: 50→30 (delta –20). B=30, C=20, othersTotal=50.
    // B gains: 30 – (–20)×(30/50) = 30 + 12 = 42
    // C gains: 20 – (–20)×(20/50) = 20 + 8  = 28
    const result = applyWeightChange(threeFunds, 'A', 30)
    expect(w(result, 'A')).toBeCloseTo(30, 10)
    expect(w(result, 'B')).toBeCloseTo(42, 10)
    expect(w(result, 'C')).toBeCloseTo(28, 10)
  })
})

// ─── edge cases ───────────────────────────────────────────────────────────────

describe('edge case: all other funds at 0%', () => {
  test('remainder is distributed evenly when others start at 0%', () => {
    const funds: Allocation[] = [
      { ticker: 'A', weight: 100 },
      { ticker: 'B', weight: 0 },
      { ticker: 'C', weight: 0 },
    ]
    const result = applyWeightChange(funds, 'A', 40)
    expect(w(result, 'A')).toBeCloseTo(40, 10)
    expect(w(result, 'B')).toBeCloseTo(30, 10) // (100-40)/2 = 30
    expect(w(result, 'C')).toBeCloseTo(30, 10)
    expect(sumWeights(result)).toBeCloseTo(100, 10)
  })

  test('pushing to 100% clamps others to 0 then distributes evenly → they stay 0', () => {
    const result = applyWeightChange(twoFunds, 'A', 100)
    expect(w(result, 'A')).toBeCloseTo(100, 10)
    expect(w(result, 'B')).toBeCloseTo(0, 10)
    expect(sumWeights(result)).toBeCloseTo(100, 10)
  })

  test('setting 0% spreads 100% evenly across others', () => {
    const result = applyWeightChange(twoFunds, 'A', 0)
    expect(w(result, 'A')).toBeCloseTo(0, 10)
    expect(w(result, 'B')).toBeCloseTo(100, 10)
    expect(sumWeights(result)).toBeCloseTo(100, 10)
  })

  test('three funds: setting to 0% distributes PROPORTIONALLY (not evenly) to others', () => {
    // A: 50→0 (delta –50). B=30, C=20, othersTotal=50.
    // B gains: 30 – (–50)×(30/50) = 30 + 30 = 60
    // C gains: 20 – (–50)×(20/50) = 20 + 20 = 40
    // Even distribution would give 50/50; proportional gives 60/40 (preserving B:C ratio).
    const result = applyWeightChange(threeFunds, 'A', 0)
    expect(w(result, 'A')).toBeCloseTo(0, 10)
    expect(w(result, 'B')).toBeCloseTo(60, 10)
    expect(w(result, 'C')).toBeCloseTo(40, 10)
    expect(sumWeights(result)).toBeCloseTo(100, 10)
  })
})

describe('edge case: clamping causes all others to collapse to 0', () => {
  test('others at small weights: pushing to near-100% redistributes evenly', () => {
    // A=98, B=1, C=1. Set A to 99.9 (delta = +1.9).
    // B: 1 – 1.9×(1/2) = 1 – 0.95 = 0.05 → stays positive
    // This is not the edge case. Let's use A=98, B=0.5, C=0.5, set A to 99.5.
    // B: 0.5 – 1.5×(0.5/1) = 0.5 – 0.75 = –0.25 → clamped to 0
    // C: same → 0; adjTotal = 0 → evenly distribute 0.5 to B and C: each = 0.25
    const funds: Allocation[] = [
      { ticker: 'A', weight: 98 },
      { ticker: 'B', weight: 1 },
      { ticker: 'C', weight: 1 },
    ]
    const result = applyWeightChange(funds, 'A', 99.5)
    expect(w(result, 'A')).toBeCloseTo(99.5, 10)
    expect(w(result, 'B')).toBeCloseTo(0.25, 10)
    expect(w(result, 'C')).toBeCloseTo(0.25, 10)
    expect(sumWeights(result)).toBeCloseTo(100, 10)
  })
})

// ─── clamping ─────────────────────────────────────────────────────────────────

describe('weight clamping', () => {
  test('newWeight above 100 is clamped to 100', () => {
    const result = applyWeightChange(twoFunds, 'A', 150)
    expect(w(result, 'A')).toBeCloseTo(100, 10)
    expect(sumWeights(result)).toBeCloseTo(100, 10)
  })

  test('newWeight below 0 is clamped to 0', () => {
    const result = applyWeightChange(twoFunds, 'A', -10)
    expect(w(result, 'A')).toBeCloseTo(0, 10)
    expect(sumWeights(result)).toBeCloseTo(100, 10)
  })
})

// ─── order preservation ───────────────────────────────────────────────────────

describe('fund order is preserved', () => {
  test('adjusting A does not reorder B and C', () => {
    const result = applyWeightChange(threeFunds, 'A', 70)
    expect(result.map((f) => f.ticker)).toEqual(['A', 'B', 'C'])
  })

  test('adjusting B (middle) does not reorder A and C', () => {
    const result = applyWeightChange(threeFunds, 'B', 50)
    expect(result.map((f) => f.ticker)).toEqual(['A', 'B', 'C'])
  })
})

// ─── unknown ticker ───────────────────────────────────────────────────────────

describe('unknown ticker', () => {
  test('no-op when ticker not found', () => {
    const result = applyWeightChange(twoFunds, 'UNKNOWN', 50)
    expect(result).toEqual(twoFunds)
  })
})
