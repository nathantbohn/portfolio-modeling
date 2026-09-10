# P0 Fix Plan — time-weighted risk statistics and IRR contribution timing

Branch: `fix/p0-calc-stats` (from `audit/sept-2026`). Scope: audit findings F3-1, F3-2 (P0) and F3-3 (P1, bundled as "fix #2").

## 1. Data-source map (Phase 1 discovery)

Legend: **MWR** = money-weighted (dollar balance including deposits), **TWR** = time-weighted (chain-linked holding returns, cash flows excluded).

| Stat / series | Producer | Consumer | Currently computed on | Should be | Change? |
|---|---|---|---|---|---|
| "Growth of $X" line | `computePortfolio` → `cumulativeValues` | `App.tsx` → `CumulativeChart` | MWR value series | MWR | no |
| Capital-invested baseline | `computePortfolio` → `capitalInvested` | `CumulativeChart` | principal + k·contribution | MWR | no |
| Dividend income line | `computePortfolio` → `dividendValues` | `CumulativeChart` | holdings × (adj − price ratio) | n/a (income) | no |
| Ending balance / total contributed | `cumulativeValues[n−1]`, `totalContributed` | `StatsPanel` sub-line | MWR | MWR | no |
| Benchmark overlay (100% VOO) | `computeBenchmark` | `CumulativeChart` only | MWR (mirrors contribution timing) | MWR | no — see §3 |
| Fixed cumulative Y-max | `computeChartBounds.cumulativeMax` | `CumulativeChart` | MWR `cumulativeValues` | MWR | no |
| IRR (label "IRR" when contributions > 0) | `calcAnnualizedIRR(cashflows)` → `cagr` | `StatsPanel` | MWR cash-flow vector, contributions dated 1 month late | MWR, correct dating | **fix #2** |
| CAGR (label "CAGR" when contributions = 0) | `cagr` (geometric, date span) | `StatsPanel` | MWR final/initial (identical to TWR when C = 0) | TWR | new field `timeWeightedCagr`; `cagr` unchanged |
| Annualized volatility | `calcAnnualizedVol(monthlyReturns)` | `StatsPanel` | MWR value-series ratios | TWR | **fix #1** |
| Max drawdown | `calcMaxDrawdown(cumulativeValues)` | `StatsPanel` | MWR value series | TWR | **fix #1** |
| Sharpe | `(cagr − 0.02) / vol` | `StatsPanel` | MWR IRR ÷ MWR vol | TWR CAGR ÷ TWR vol | **fix #1** |
| Annual (calendar-year) returns | `calcAnnualReturns(cumulativeValues)` | `AnnualReturnsChart` | MWR value series | TWR | **fix #1** |
| Fixed annual-return Y-max | `computeChartBounds.annualReturnMax` | `AnnualReturnsChart` | from `annualReturns` | TWR (follows the above) | follows fix #1 |
| Rolling returns (1/3/5 yr) | `calcRollingReturns(result.cumulativeValues, w)` in `App.tsx` | `RollingReturnsChart` | MWR value series | TWR | **fix #1** (repoint in `App.tsx`) |

## 2. Where contributions enter the simulation

`computePortfolio` loop, step `i` covers the month `dates[i−1] → dates[i]` (calculations.ts:143-190). Order inside one step:

1. Rebalance to target weights if the cadence fires (total value unchanged).
2. **Contribution `C` is added to holdings, split by target weights** (`holdings[t] += w_t · C`).
3. Each holding is multiplied by its price ratio `P_t[i] / P_t[i−1]`; the sum is `cumulativeValues[i]`.

So the deposit for month `t` is made at the **start** of the month (time `i−1`) and earns that month's full return. This is pinned by the existing passing test "contribution is invested at the start of the month" ((1000 + 100) × 2 = 2200).

Consequences:

- **TWR formula.** With `V_start = cumulativeValues[i−1]` (rebalance conserves total) and `V_end = cumulativeValues[i]`:

  `twr_i = V_end / (V_start + C) − 1`

  This is the start-of-period case of Modified Dietz. The end-of-period form `(V_end − C) / V_start − 1` would be wrong for this simulation: with `V_end = (V_start + C)·R` it yields `R − 1 + C·(R − 1)/V_start`, i.e. it would still leak a contribution-sized error into the return whenever `R ≠ 1`. The implementation sums the actual holdings right after step 2 (pre-growth total) and divides the post-growth total by it, so the return is taken from the simulated holdings rather than from an algebraic shortcut.

- **IRR dating.** The current cash-flow vector puts contribution `i` at index `i` (time of `dates[i]`), one period after it was actually invested. Correct vector for `n` dates and `n−1` deposits:

  ```
  cashflows[0]     = -initialValue - C
  cashflows[i]     = -C                 for i = 1 ... n-2
  cashflows[n-1]   = +finalValue
  ```

## 3. Benchmark overlay

`computeBenchmark` produces only a value series (deposits at start of month, mirroring the portfolio) and is drawn on the money-weighted cumulative chart. No benchmark statistics (vol, drawdown, annual, rolling) are computed or displayed anywhere (`grep benchmarkData` → `CumulativeChart` only). Because the chart it overlays stays MWR, the benchmark stays MWR. No change; the comparison remains apples-to-apples.

## 4. Two-layer custom fund path

`synthesizePriceData` chains weighted constituent price ratios into a synthetic `PricePoint[]` starting at 100. It has no knowledge of principal or contributions; the result is merged into `priceData` and enters `computePortfolio` as an ordinary ticker. Portfolio-level contributions are applied afterwards inside `computePortfolio`. Therefore the custom-fund return series is unaffected by either fix. `synthesize.test.ts` (9 tests) must stay green unchanged as confirmation.

## 5. Implementation

### Fix #1 — time-weighted stats (`calculations.ts`, `App.tsx`)

- In the loop: after the contribution step, sum holdings into `preGrowthValue`; after growth, `twrReturn = portfolioValue / preGrowthValue − 1`; chain into `timeWeightedValues[i] = timeWeightedValues[i−1] · (1 + twrReturn)` with `timeWeightedValues[0] = initialValue`. Store the monthly TWR into the existing `monthlyReturns` `Float64Array` (it is now filled in-loop instead of post-loop; no new allocation beyond one `CumulativePoint[]`).
- New `PortfolioResult` fields: `timeWeightedValues: CumulativePoint[]` (growth of the principal on holding returns alone — identical to `cumulativeValues` when `C = 0`) and `timeWeightedCagr: number`.
- `annualizedVolatility` ← TWR monthly returns; `maxDrawdown` ← `calcMaxDrawdown(timeWeightedValues)`; `annualReturns` ← `calcAnnualReturns(timeWeightedValues)`; `sharpeRatio` ← `(timeWeightedCagr − RISK_FREE_RATE) / annualizedVolatility`.
- `cagr` / `useIRR` keep their current meaning (IRR when contributions > 0) so the StatsPanel headline and the audit IRR test are unchanged.
- `App.tsx` rolling memo: `calcRollingReturns(result.timeWeightedValues, rollingWindow)`.
- `cumulativeValues`, `capitalInvested`, `dividendValues`, benchmark: untouched.
- New test: with `monthlyContribution = 0`, `timeWeightedValues` equals `cumulativeValues` point-for-point and `timeWeightedCagr === cagr` (rebalanced, multi-fund fixture).

### Fix #2 — IRR timing (`calculations.ts`)

- Build the cash-flow vector per §2. Newton solver unchanged.
- Rename the describe block from "KNOWN DEFECTS (intentionally failing …)" to a regression-test title; expected values untouched.
- `StatsPanel` label "IRR" → "IRR (money-weighted)". No other UI change.

## 6. Worked example — contrib fixture from the failing volatility test

Flat prices `[100, 100, 100, 100]`, Jan–Apr 2020, principal 1000, contribution 100, single fund, no rebalance.

| step i | V_start | + C (pre-growth) | ratio | V_end (MWR) | twr_i = V_end/(V_start+C) − 1 | TWR value |
|---|---|---|---|---|---|---|
| 0 | — | — | — | 1000 | — | 1000 |
| 1 | 1000 | 1100 | 1.0 | 1100 | 1100/1100 − 1 = 0 | 1000 |
| 2 | 1100 | 1200 | 1.0 | 1200 | 1200/1200 − 1 = 0 | 1000 |
| 3 | 1200 | 1300 | 1.0 | 1300 | 1300/1300 − 1 = 0 | 1000 |

- MWR series `[1000, 1100, 1200, 1300]` → chart line and capital-invested baseline (unchanged).
- Old engine: "returns" `[10%, 9.09%, 8.33%]` → vol 2.89%. New: TWR returns `[0, 0, 0]` → **vol 0, drawdown 0**, annual return 2020 = 0.
- IRR on the corrected vector `[−1100, −100, −100, +1300]`: r = 0 exactly (NPV at r = 0 is 0), annualized 0%. The old vector `[−1000, −100, −100, +1200]` also solves to 0 here because prices are flat; the timing bias only appears when returns are non-zero.

Drawdown fixture (prices `[100, 100, 50]`, P = 10 000, C = 10 000):

| i | V_start | pre-growth | ratio | V_end | twr_i | TWR value |
|---|---|---|---|---|---|---|
| 1 | 10 000 | 20 000 | 1.0 | 20 000 | 0 | 10 000 |
| 2 | 20 000 | 30 000 | 0.5 | 15 000 | −0.5 | 5 000 |

TWR series `[10 000, 10 000, 5 000]` → max drawdown **50%** (old, on MWR `[10 000, 20 000, 15 000]`: 25%).

IRR fixture (prices `[100, 110]`, P = 10 000, C = 1 200): corrected vector `[−11 200, +12 320]` → monthly r = 0.10 → annualized `1.1^12 − 1 ≈ 213.84%` (old: `[−10 000, +11 120]` → 257.5%).

## 7. Expected-value check on the three failing tests

All three expected values were re-derived by hand above and agree with the tests. No test expectation needs to change.

## 8. Performance

Baseline (`npx tsx audit/bench.ts`, node v24.14.0, before any change):

```
Custom-25 + 3 ETFs, monthly rebal + contributions (worst case) + benchmark
  p50 0.739 ms   p95 1.038 ms   max 3.258 ms
computePortfolio only (pre-merged data): p50 0.152 ms   p95 0.196 ms
```

After (same machine, same run length):

```
Custom-25 + 3 ETFs, monthly rebal + contributions (worst case) + benchmark
  p50 0.802 ms   p95 1.102 ms   max 2.771 ms
computePortfolio only (pre-merged data): p50 0.173 ms   p95 0.222 ms
```

Delta at the worst case: +0.06 ms p50, +0.06 ms p95 — one extra accumulation per holding per month plus one `CumulativePoint[]` of length n. Within the 2 ms threshold.
