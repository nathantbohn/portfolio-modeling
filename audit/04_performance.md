# Phase 4 — Performance

Benchmark: `audit/bench.ts` (run `npx tsx audit/bench.ts` from repo root; node v24.14.0, this machine). Real `prices.json` + synthetic 25-stock × 180-month custom fund. 1000 iterations/scenario after warm-up. Times are the FULL per-slider-frame pipeline App.tsx executes (computePortfolio + calcRollingReturns + benchmark when on + custom-fund synthesis when active — see below for why synthesis is in the frame).

| Scenario | p50 | p95 | max |
|---|---|---|---|
| 2 ETFs (60/40, annual rebal) | 0.071 ms | 0.130 ms | 0.48 ms |
| 4 ETFs (25×4, annual rebal) | 0.104 ms | 0.195 ms | 2.10 ms |
| Custom-25 + 2 ETFs (annual) | 0.672 ms | 1.259 ms | 3.04 ms |
| Custom-25 + 3 ETFs, monthly rebal + contrib + benchmark | 0.767 ms | 1.218 ms | 2.54 ms |

Worst-case decomposition (p50): synthesizePriceData **0.588 ms** · computePortfolio 0.162 ms · calcRollingReturns 0.001 ms · computeBenchmark 0.013 ms.

**Verdict: the <16 ms/frame budget holds with ~13× headroom even in the worst case.** No performance emergency exists. Everything below is proposal-only (no fixes applied, per audit rules).

## Findings

### P4-1 — synthesizePriceData re-runs on every slider frame (largest avoidable cost)
`App.tsx:74-89` — `mergedPriceData` useMemo lists `activeFunds` as a dep. Slider drags replace the `activeFunds` array identity every frame, so with a user-created custom fund active, each frame re-synthesizes the fund (75–88% of frame cost). The synthesis result only actually depends on (set of active custom ids, customFunds, stockPrices) — not on weights.
- **Proposed**: derive `const activeCustomKey = activeFunds.filter(f => f.ticker.startsWith('CUSTOM-')).map(f => f.ticker).sort().join(',')` and memo `mergedPriceData` on `[priceData, activeCustomKey, customFunds, stockPrices]`; or cache per-fund synth in a separate `useMemo`.
- **Impact**: ~5× lower frame cost with custom funds active (1.2 ms p95 → ~0.25 ms). Effort S, risk low.

### P4-2 — computePortfolio rebuilds price lookup maps per call
`calculations.ts:60-78` — every invocation rebuilds `priceMap` (ticker → date → price) and re-derives the date intersection. That construction dominates computePortfolio's 0.16 ms. The maps only change when priceData or the total-return toggle changes, not per slider move.
- **Proposed**: precompute per-ticker `{dates[], closes[], adjs[]}` typed arrays once per (priceData, useTotalReturn) and pass indices through; or a WeakMap cache keyed by the PricePoint[] reference.
- **Impact**: ~2–3× on computePortfolio; irrelevant to the 16 ms budget today, becomes relevant only if fund count/history grows 10×. Effort M, risk medium (hot path). **Not recommended now.**

### P4-3 — CumulativeChart does non-incremental work every frame
`CumulativeChart.tsx` update path runs per slider frame: re-`call`s both axes inside 200 ms d3 transitions (each frame interrupts the last — churn), **rebuilds the legend DOM from scratch** (`legend.selectAll('*').remove()` + re-append, lines 291-322), and re-binds `mousemove`/`mouseleave` closures on the overlay. Scales/axes/generators are also re-created as JS objects each pass (cheap but avoidable).
- **Proposed**: (a) rebuild legend only when the showDividend/showCapital/showBenchmark flag-set changes (keyed join or a ref of the last flag-set); (b) axes: skip the transition when an update arrives <200 ms after the previous one (drag detection) and `.call` directly — visual behavior during drag is unchanged since interrupted transitions never finish anyway; (c) hoist static tooltip HTML template strings.
- **Impact**: DOM-write reduction per frame; keeps 60 fps headroom on low-end mobile where D3 DOM work, not the engine, is the bottleneck. Effort M, risk low-medium (pure refactor of chart internals, no visual change intended). RollingReturnsChart shares pattern (a)/(b) minus legend; AnnualReturnsChart is already a keyed join (good) but re-calls axes with transitions likewise.

### P4-4 — Full React tree re-renders on every slider frame
Portfolio state lives at App top level, so every slider frame re-renders all children including ones whose props are unchanged: `FundTray` (~40 draggable rows), `TickerBanner`, `PresetPortfolios`, `CustomFundBuilder` trigger area. None are wrapped in `React.memo`.
- **Proposed**: `React.memo` on FundTray, TickerBanner, PresetPortfolios (their props are referentially stable during drags — activeTickers Set is rebuilt per render at App.tsx:147, so hoist it into a useMemo first).
- **Impact**: removes ~half the per-frame VDOM work; matters on mobile. Effort S, risk low.

### P4-5 — chartBounds recomputes 13 single-fund sims per keystroke
`App.tsx:160-168` — `chartBounds` deps include `principal` and `monthlyContribution`; each keystroke in those inputs runs 13 × computePortfolio (~1 ms total) plus full chart redraws. Within budget; noted only because the result is used purely for Y-axis ceilings and could be scaled analytically from a principal-10000 baseline instead. Effort S, impact negligible today. **Not recommended now.**

### Non-issues verified
- No O(n²) patterns in the sim loop; holdings updated in place; `Float64Array` for returns; IRR Newton ≤50 iterations is trivial.
- `{ ...priceData }` spread per frame copies only references (525 keys ≈ µs).
- `computeChartBounds` correctly does NOT run on slider moves (deps exclude allocations).
- Pie slices are recomputed per render but never unmounted (respects CLAUDE.md animation rule); arc math is trivial.
- Fixed Y-axis ranges and no-debounce slider onChange are intentional per CLAUDE.md — not flagged; their perf implication is precisely the D3 per-frame work covered in P4-3.

## Production-path caveat (ties to Phase 5)
These numbers use the 44-ticker static JSON. In production `VITE_API_URL` is set, so the base data is the 525-ticker `/prices` payload; per-frame math is unaffected (only active tickers are touched), but initial load transfers ~10× more data than the product needs — see Phase 5.
