# Audit Report — September 2026 (branch `audit/sept-2026`)

## 1. Executive summary

Overall health is **good for a rapidly-built product**: the codebase is small, typed strictly (0 tsc errors, now 0 `any`), the slider→chart loop runs ~13× inside its 16 ms budget even in the worst case, there is no SQL injection or XSS exposure, and 74 unit tests now pin the engine's behavior.
The three most important findings:
1. **Risk statistics are wrong whenever monthly contributions are on** — volatility, max drawdown, annual and rolling returns are computed on the contribution-inflated value series, so volatility is overstated and drawdowns are masked (P0, failing tests prove it).
2. **The reported IRR is systematically overstated** — contributions are discounted one month later than the simulation invests them (P1).
3. **Production loads a 7.45 MB uncompressed `/prices` payload (all 525 tickers) from the Render free tier on every visit**, contradicting the documented static-JSON data flow and making first paint hostage to backend cold starts (P1).
Nothing else is actively wrong in production; price data is 5 months stale (Apr 2026) but the UI discloses it.

## 2. Findings table

### P0 — incorrect calculations / production bugs
| ID | Title | File(s) | Evidence | Proposed fix | Effort | Risk of fix |
|---|---|---|---|---|---|---|
| P0-1 | Volatility treats contribution cashflows as market returns | frontend/src/utils/calculations.ts:195-198 | Failing test `FINDING: volatility should be 0 for flat prices with contributions` (flat prices + DCA → 2.89% vol, true 0%). audit/03 F3-1 | Track time-weighted monthly returns inside the sim loop (value-after-growth ÷ value-after-contribution − 1); feed vol/Sharpe from those | S | Low — loop already has both values in hand; pin with the existing failing tests |
| P0-2 | Max drawdown (and annual/rolling returns) masked/inflated by contributions | calculations.ts:220-222, 372-390; App.tsx:170-173 | Failing test `FINDING: max drawdown should reflect market losses…` (50% crash reported as 25%). audit/03 F3-2 | Run drawdown/annual/rolling on a TWR index series (chain the time-weighted returns from P0-1) | S–M | Low-Med — decide whether the *chart* keeps showing money-weighted values (it should) while *stats* use TWR |

### P1 — will break under real traffic / next feature
| ID | Title | File(s) | Evidence | Proposed fix | Effort | Risk of fix |
|---|---|---|---|---|---|---|
| P1-1 | IRR discounts contributions one month late (overstated) | calculations.ts:204-210, 399-418 | Failing test `FINDING: IRR should discount contributions when they are invested…` (213.8% truth vs 257.5% reported on the fixture). audit/03 F3-3 | Shift each contribution's cashflow one period earlier to match the sim's start-of-month investment | S | Low |
| P1-2 | Production fetches all 525 tickers (7.45 MB, uncompressed, uncached, 526 SQL queries) on every page load | frontend/src/hooks/usePriceData.ts:26; backend/main.py:62-71 | Measured live: 7,454,822 bytes, 0.68 s CPU locally; Render free tier much worse. audit/05 B-1 | Always load base data from static prices.json; backend only for /prices/{ticker} + /search. Add GZip + Cache-Control regardless | S–M | Med — verify TickerBanner/MCMERICA-25 needs are all in prices.json (they are: 44 tickers incl. DIA + composite) |

### P2 — quality/maintainability
| ID | Title | File(s) | Evidence | Proposed fix | Effort | Risk |
|---|---|---|---|---|---|---|
| P2-1 | `?funds=VOO:Infinity` NaN-cascades the whole UI | utils/urlState.ts:33-34 | Verified: values `[10000, NaN, NaN]`, CAGR NaN. audit/06 S-1 | `Number.isFinite` + clamp 0–100; cap fund count | S | Low |
| P2-2 | `principal=0` → CAGR NaN | urlState.ts:43-46, calculations.ts:216 | Verified NaN. audit/06 S-2 | Clamp ≥1 or guard division | S | Low |
| P2-3 | Fund limit inconsistency: 4 (App/isFull/copy/CLAUDE.md) vs 5 (MAX_FUNDS/"n/5"/All-Weather preset) | App.tsx:148, usePortfolio.ts:17, AllocationPanel.tsx:32,47 | audit/07 §3 | Pick one number, align constant+copy+preset | S | Low |
| P2-4 | PieChart renders every custom fund in accent crimson | PieChart.tsx:132-136, App.tsx:445 | audit/07 §6 | Pass customFundMeta through | S | Low |
| P2-5 | Primary data fetch has no retry/robust error UI | usePriceData.ts, App.tsx:206-213 | audit/07 §5 | Retry button + explanatory state | S | Low |
| P2-6 | useStockPrices: empty-array response → fund stuck "Loading" forever; boolean loading races across batches | useStockPrices.ts:64-83 | audit/07 §5 | Treat empty 200 as error; per-ticker loading set | S | Low |
| P2-7 | SQLite connections never closed (526/request on /prices) | backend/db.py:7-10 | audit/05 B-2 | contextlib.closing or shared read-only conn | S | Low |
| P2-8 | No backend logging; CORS env silently falls back to localhost | backend/main.py | audit/05 B-4/B-5 | Startup log + request/error logging | S | Low |
| P2-9 | Contrast failures: warm-300 (2.7:1) and warm-400 (2.0:1) secondary text | tailwind palette usage across components | Measured ratios, audit/07 §4 | Darken warm-300/400 or bump to warm-200 for text | S | Low (visual delta — needs owner sign-off; CLAUDE.md palette rules) |
| P2-10 | Click-to-add funds not keyboard operable; modal lacks dialog semantics/focus trap; sliders unlabeled | FundTray.tsx, CustomFundBuilder.tsx, PortfolioSlot.tsx | audit/07 §4 | KeyboardSensor / aria-labels / dialog role+trap | S–M | Low |
| P2-11 | Custom funds lost on reload (state-only) | useCustomFunds.ts | audit/07 §3 | localStorage persistence | S | Low |
| P2-12 | `npm run lint` has never worked (eslint not installed, no config) | frontend/package.json | audit/02 | Add eslint 9 + typescript-eslint + react-hooks flat config as devDeps | S | Low |
| P2-13 | Price data stale since 2026-04 (refresh not run ~5 months) | data/prices.db, prices.json | audit/05 B-6 | Run refresh.py + export_data.py; consider scheduling | S (ops) | Low |
| P2-14 | Sharpe convention nonstandard (geometric CAGR − 2% hardcoded)/(inflated vol); becomes IRR-based with contributions | calculations.ts:3,221 | audit/03 | After P0-1/P1-1, decide convention & document in UI | S | Product decision |

### P3 — nice-to-have
| ID | Title | File(s) | Evidence/Proposal |
|---|---|---|---|
| P3-1 | ~28% duplication across 3 D3 charts | 3 chart components | Shared chartTheme/useChartSurface/axes/tooltip module (audit/07 §1) |
| P3-2 | App.tsx (522) & CumulativeChart (484) decomposition | App.tsx, CumulativeChart.tsx | audit/07 §2 |
| P3-3 | Per-frame waste: custom-fund resynthesis each slider frame; legend/axis rebuild churn; no React.memo on static children | App.tsx:74-89, charts | audit/04 P4-1/3/4 (headroom exists; fix when adding features) |
| P3-4 | Single 511 KB JS chunk (163 KB gz), no code-splitting | vite build | Split d3/framer vendor chunks if TTI ever matters |
| P3-5 | Redundant SQLite index idx_prices_ticker | backend/db.py:24 | Drop (PK autoindex covers it) |
| P3-6 | Dev-tooling npm vulns (1 critical vitest-UI, 4 high — none reachable in prod) + starlette advisories (mostly unreachable, GET-only) | package-lock, requirements | Routine `npm audit fix` + fastapi bump next maintenance window (audit/06) |
| P3-7 | prefers-reduced-motion ignored; chart tooltips mouse-only | charts | audit/07 §4 |
| P3-8 | Preset highlight stays active after manual edits; PieChart % labels use raw weights | PresetPortfolios.tsx, PieChart.tsx | audit/07 |
| P3-9 | TickerBanner index levels use hardcoded scale factors (drift) | TickerBanner.tsx:13-14 | Recompute factors on refresh, or label as approximate |
| P3-10 | Tier scaffolding duplicated (unused) in frontend & backend | config/tiers.ts, backend/tiers.py | Single source when auth lands; both currently dead code kept intentionally |
| P3-11 | /search stale-response race in builder | CustomFundBuilder.tsx:36-62 | Abort previous request or token-check |

## 3. Committed on the branch (`git log main..audit/sept-2026`)

```
b45a947 audit: phase 7 findings
9f7382e audit: phase 6 findings
cc97c33 audit: phase 5 findings
0cffc3f audit: phase 4 findings
5cda818 audit: phase 3 findings — engine correctness tests   ← +32 tests (3 intentionally failing)
2739e3d audit: phase 2 findings
260c287 audit: remove provably-unused code (…)               ← deletes animations.ts, mcmerica25.ts, 4 dead type exports
02dbc91 audit: replace the two 'as any' d3 tickFormat casts  ← type-safety, no runtime change
e73b74f audit: phase 1 findings
6b14abf audit: phase 0 findings
(+ final phase-8 commit containing REPORT.md / PROPOSED_FIXES.md / bench.ts docs)
```
No dependency, config, data, or user-facing behavior changes were committed. vitest was already configured, so the permitted package.json exception was not needed.

## 4. Uncertainties

- **Sharpe/vol conventions**: whether the author intends money-weighted stats when contributions are on (some tools show "portfolio value" stats that way). The failing tests assume industry-standard time-weighted risk stats; product owner should confirm before fixing P0-1/P0-2.
- **Rebalance timing**: cadence anchors to the series start month (e.g. "annual" = every 12th month from first data point) and fires before that month's growth. Documented and test-pinned, but whether calendar-year alignment was intended is unknown.
- **Custom-fund semantics**: weighted-monthly-ratio chaining = monthly-rebalanced index (not buy-and-hold). Reasonable for an "index", but not stated anywhere user-visible.
- **Production env values**: could not verify Render's ALLOWED_ORIGINS or Vercel's VITE_API_URL actual values from the repo; P1-2 assumes VITE_API_URL is set in production (custom-fund search working live implies it is).
- **TickerBanner scale factors** (VOO×9.28, DIA×87.7): unknown how far the displayed S&P/Dow levels have drifted from reality.
- **`vite.config.ts` test env is `node`** — hook tests are pure-function only; no DOM/component tests exist or were added (would need jsdom + testing-library, i.e. dependency changes outside audit scope).
- **calcAnnualizedIRR robustness**: plain Newton without bracketing; divergence for pathological series was not reproduced but not ruled out.
- **backend/tiers.py & frontend config/tiers.ts** kept despite zero references because CLAUDE.md documents tier scaffolding as intentional — flagged rather than removed.

## 5. Final verification (Phase 8, post-all-commits)

- `npm run build`: **PASS** (2.76 s; script untouched: `vite build`)
- `npx tsc --noEmit`: **0 errors** (baseline 0 — no increase)
- Tests: **77 total — 74 pass, 3 fail intentionally** (the P0/P1 finding tests listed in §2, names in commit 5cda818's message)
- Benchmark: worst-case slider frame p95 = 1.22 ms (budget 16 ms)
