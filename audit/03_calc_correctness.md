# Phase 3 — Calculation Engine Correctness

Test additions (all expected values hand-computed in test comments):
- `frontend/src/utils/calculations.audit.test.ts` — 17 tests (14 pass, 3 intentionally failing findings)
- `frontend/src/utils/synthesize.test.ts` — 9 tests (all pass)
- `frontend/src/hooks/usePortfolio.locking.test.ts` — 6 tests (all pass)

Suite after Phase 3: **77 tests, 74 pass, 3 intentional failures** (the findings below). vitest was already configured; no package.json change was needed.

## FINDINGS (each has a failing test left in place)

### F3-1 — Volatility counts contribution cashflows as market returns (P0)
- **Test**: `FINDING: volatility should be 0 for flat prices with contributions`
- **Evidence**: flat prices + $100/month contribution on $1,000 → engine reports annualized volatility **2.89%**; the true market volatility is **0%**.
- **Cause**: `computePortfolio` derives `monthlyReturns` from `cumulativeValues[i]/cumulativeValues[i-1] − 1` (calculations.ts:195-198). When contributions are active, `cumulativeValues` includes external cash inflows, so each month's "return" is inflated by contribution/value. Volatility, and therefore Sharpe, are computed on this money-weighted series.
- **Expected vs actual**: 0 vs 0.0289 (on the fixture).
- **Hypothesis/fix direction**: track a parallel time-weighted return each step (portfolio value after growth ÷ value after contribution − 1, which the loop already has in hand) and feed THAT into vol/Sharpe/drawdown/annual returns. Real-world impact scales with contribution size relative to balance: for a $10k start + $500/month the early months add ~5%/month of phantom "return", overstating volatility badly.

### F3-2 — Max drawdown masked by contributions (P0)
- **Test**: `FINDING: max drawdown should reflect market losses, not be masked by contributions`
- **Evidence**: market drops 50% in a month; with a large contribution the engine reports **25%** drawdown instead of **50%**.
- **Cause**: same root as F3-1 — `calcMaxDrawdown` runs on the contribution-inflated `cumulativeValues`. Contributions systematically **understate** drawdowns (deposits offset losses), so the risk stat shown to users is optimistic exactly when they enable DCA.
- Note: the same distortion applies to `annualReturns` (annual bars are inflated by that year's contributions) and to `calcRollingReturns` (App feeds it `result.cumulativeValues`). No separate failing tests were added for those two — same root cause, recorded here.

### F3-3 — IRR discounts each contribution one month later than the sim invests it (P1)
- **Test**: `FINDING: IRR should discount contributions when they are invested, not one month later`
- **Evidence**: 1-month sim, $10,000 principal, $1,200 contribution, price ×1.1. The sim invests the contribution at the start of the month — final = (10000+1200)×1.1 = 12,320, so the true money-weighted monthly return is 10% (annualized ≈ 213.8%). The engine reports ≈ **257.5%**.
- **Cause**: in the sim loop, the contribution at step *i* is added **before** the price move from date[i−1]→date[i] (i.e. it is invested at time i−1), but `calcAnnualizedIRR` receives it as `cashflows[i]` discounted at time i (calculations.ts:204-210). Every contribution is credited a free month of return.
- **Magnitude in practice**: for long horizons the bias is roughly one month of return on each contribution — small but systematic upward bias of the headline IRR. The fixture exaggerates it (1 month, big contribution) to make the arithmetic hand-checkable.
- **Fix direction**: shift contribution flows one index earlier (`cashflows[i-1] -= contribution` semantics), or equivalently fold the month-i contribution into the time-(i−1) flow.

## Documented behaviors (not defects; now pinned by passing tests)

- **Sharpe**: `RISK_FREE_RATE = 0.02` (2% annual), hardcoded, `Sharpe = (CAGR − 0.02)/annualizedVol`. Nonstandard on two axes: numerator is a geometric annual return rather than mean monthly excess return ×12, and when contributions are active the numerator silently becomes the (biased, F3-3) IRR while the denominator is the (inflated, F3-1) money-weighted vol. Recorded as an uncertainty for product judgment.
- **Rebalance cadence** fires on month-count anniversaries of the series start (e.g. "annual" = every 12th month from the first data point), rebalancing **before** that month's price change and before the contribution. It is NOT calendar-year-end aligned. Pinned by hand-computed monthly/quarterly/annual tests.
- **Contributions** are split by target weights (not current weights) each month, invested at the start of the month; capital-invested line = principal + k×contribution. Pinned by tests.
- **Benchmark** (`computeBenchmark`) mirrors the portfolio's contribution timing exactly — a 100% VOO portfolio with contributions equals the benchmark point-for-point. Pinned by tests.
- **Dividend series** (price-return mode): each month adds `holdings × (adjRatio − priceRatio)` using pre-growth holdings; dividends accumulate in a separate series and are NOT reinvested into the portfolio value. Pinned by hand-calc test.
- **Custom fund synthesis** chains the weighted average of monthly constituent ratios — i.e. models an index **rebalanced monthly** back to target weights, not buy-and-hold. Equal-weight matches ratio averaging; manual weights are normalized whatever their sum (UI enforces ±0.5 of 100, engine tolerates anything). Missing constituents are dropped with weight renormalization; only the intersection of constituent dates is used (a fund with one young stock truncates the whole fund's history — worth surfacing in UI someday). Pinned by 9 tests.
- **Locking**: `applyWeightChange` honors locks: locked weights never move, cap = 100 − lockedTotal, redistribution only among unlocked. Pinned by 6 tests.
- **100%/0% portfolio equals the underlying fund** and weight normalization when sum ≠ 100 — already covered by the pre-existing suite.
- **calcAnnualReturns** first calendar year is measured from the series' first value (partial years included as-is) — documented in code, already tested.

## Other engine observations (no test, recorded)
- `computePortfolio` with `initialValue = 0` (URL `?principal=0` is accepted by `parseUrlState`): values all 0, CAGR = `Math.pow(0/0, …)` → NaN propagated to stats. UI displays "NaN%". Minor edge (P2), listed in report.
- `calcAnnualizedIRR` is plain Newton from a fixed 0.5%/month guess, no bracketing/fallback; pathological series (huge losses) could diverge. Not reproduced; recorded as uncertainty.
- CAGR uses actual date span at 365.25 days/year — fine.
