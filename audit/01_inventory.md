# Phase 1 — Inventory

## Frontend map (`frontend/src/`, 29 files, 4,079 lines)

### Entry / root
| File | Lines | Purpose | Imported by |
|---|---|---|---|
| `main.tsx` | 10 | React root mount | index.html |
| `App.tsx` | 522 | Root component: wires all hooks, computes portfolio/bounds/benchmark/rolling memos, layout, DnD context, share button, custom-fund status UI | main.tsx |
| `index.css` | — | Tailwind layers + slider styling | main.tsx |
| `vite-env.d.ts` | 1 | Vite env types | — |

### Components
| File | Lines | Purpose | Imported by |
|---|---|---|---|
| `AllocationPanel.tsx` | 72 | Portfolio drop zone + slot list + total % header | App |
| `PortfolioSlot.tsx` | 140 | One fund row: slider (0–100, step 0.1), number input, lock, remove | AllocationPanel |
| `FundTray.tsx` | 175 | Draggable/clickable fund list (ETFs, mutual funds, custom), "Build Custom Fund" button | App |
| `PieChart.tsx` | 197 | SVG pie/donut, hand-rolled arc paths, framer-motion animates only the donut-hole radius; wedge angles are NOT animated — they recompute per render (fine during drag: re-render per frame) | App |
| `StatsPanel.tsx` | 85 | 4 stat cards (CAGR/IRR, Vol, MaxDD, Sharpe) | App |
| `CumulativeChart.tsx` | 484 | D3 line+area chart: portfolio, capital invested, dividends, benchmark; tooltip w/ crosshair; legend; init-once + update pattern | App |
| `AnnualReturnsChart.tsx` | 148 | D3 bar chart w/ join/enter/exit keyed by year | App |
| `RollingReturnsChart.tsx` | 250 | D3 line chart + 1Y/3Y/5Y window buttons; **auto-scaled Y** (no fixed bounds) | App |
| `PresetPortfolios.tsx` | 91 | 5 hardcoded presets | App |
| `ResizablePanel.tsx` | 84 | Drag-to-resize chart container, persists height to localStorage | App |
| `TickerBanner.tsx` | 115 | Top banner: McMerica 25 (rebased to 1000 @ 2026-04-01), S&P (VOO × 9.28), Dow (DIA × 87.7), "as of" date | App |
| `ToggleSwitch.tsx` | 33 | Animated switch (role="switch", aria-checked ✓) | App |
| `CustomFundBuilder.tsx` | 303 | Modal: debounced /search (300ms), stock list w/ equal/manual weights, create | App |

### Hooks
| File | Lines | Purpose | Imported by |
|---|---|---|---|
| `usePortfolio.ts` | 212 | Portfolio state: activeFunds/weights/locks, rebalance freq, total-return toggle, principal, contribution; exports pure `applyWeightChange` | App, FundTray (constants), tests |
| `usePriceData.ts` | 45 | Loads ALL price data once: backend `/prices` if VITE_API_URL set, else static `/data/prices.json` | App |
| `useStockPrices.ts` | 114 | Per-ticker on-demand fetch `/prices/{ticker}` for custom fund constituents, cache + per-ticker errors + retry | App |
| `useCustomFunds.ts` | 44 | In-memory (React state only) list of user custom funds — **not persisted; lost on reload** | App |

### Utils / config / types
| File | Lines | Purpose | Imported by |
|---|---|---|---|
| `utils/calculations.ts` | 433 | Engine: computePortfolio (sim loop, rebalance, contributions, dividends), CAGR/IRR, vol, maxDD, Sharpe, annual & rolling returns, benchmark, chart bounds | App, charts (types), tests |
| `utils/synthesize.ts` | 78 | Custom fund → synthetic PricePoint[] via weighted monthly returns chained from base 100 (implicitly monthly-rebalanced) | App |
| `utils/urlState.ts` | 102 | Parse/build shareable URL params w/ ticker & value validation | usePortfolio, App |
| `utils/animations.ts` | 15 | Shared easing/transition constants | **ZERO importers — dead** (easing duplicated inline in each chart) |
| `config/tiers.ts` | 77 | Tier scaffolding (free/premium), always returns premium | **ZERO importers** — intentional scaffolding per CLAUDE.md, kept |
| `config/mcmerica25.ts` | 48 | McMerica 25 CustomFund constant | **ZERO importers — dead** since MCMERICA-25 was precomputed into prices.json/DB (commit e8e9541) |
| `types/index.ts` | 63 | Fund/Allocation/PricePoint/CustomFund types + FUND_META (18 funds, colors) | nearly everything |

### Tests (existing)
- `utils/calculations.test.ts` (489 lines, 27 tests), `hooks/usePortfolio.test.ts` (182 lines, 16 tests). All pass.

## Backend map (`backend/`)

| Endpoint | Method | Params | Queries | Notes |
|---|---|---|---|---|
| `/tickers` | GET | — | `SELECT DISTINCT ticker FROM prices` | list[str] |
| `/prices/{ticker}` | GET | path ticker (uppercased) | `SELECT date, adjusted_close, close FROM prices WHERE ticker=? ORDER BY date` | 404 if empty |
| `/prices` | GET | — | 1 + N queries (one per ticker, **525 tickers**, ~89,773 rows total) | Unbounded, no pagination/caching; serialized via per-row Pydantic models |
| `/search` | GET | `q` string | `LIKE %q%` on metadata (ticker, name), LIMIT 10, exact-prefix ranked first | parameterized ✓ |
| `/health` | GET | — | — | ok |

Modules:
- `main.py` (91) — app, CORS (ALLOWED_ORIGINS env, GET only), endpoints above; `init_db()` on lifespan startup
- `db.py` (96) — sqlite3, connection-per-call (`sqlite3.connect` each request, no pooling; `with conn` doesn't close connections — see Phase 5), schema init, upserts, queries
- `tiers.py` (81) — tier scaffolding, **not imported by main.py** (get_tier dependency unused); parallel copy of frontend config/tiers.ts
- `download.py`, `download_stocks.py`, `refresh.py` — yfinance ETL (out of audit scope per rules, not modified)
- `scripts/export_data.py` — exports selected tickers to prices.json

Database `data/prices.db`: tables `prices` (PK ticker+date, redundant idx_prices_ticker) and `metadata` (524 rows); 525 tickers × monthly 2011-05..2026-04 = 89,773 rows.

## Data flow

1. **Base price data**: `usePriceData` — if `VITE_API_URL` set → **backend `/prices` (ALL 525 tickers)**; else static `/data/prices.json` (44 tickers: 12 ETFs, 5 mutual funds, 25 McMerica constituents, DIA, MCMERICA-25 composite, 180 monthly points each, 2011-05→2026-04).
   ⚠️ CLAUDE.md says "ETFs + mutual funds from static JSON, stocks from backend" — the code actually switches the ENTIRE base load to the backend when VITE_API_URL is set (production). See Phase 4/5 for the cost of that.
2. **Custom fund stocks**: `useStockPrices` fetches `/prices/{ticker}` per constituent of *active user-created* custom funds only.
3. **Custom fund calc**: `synthesizePriceData` (frontend) chains weighted monthly returns into a synthetic PricePoint[]; merged into priceData under the fund's `CUSTOM-*` id; then treated as a normal fund by `computePortfolio` (two-layer design).
4. **McMerica 25**: precomputed composite stored as ticker `MCMERICA-25` in both prices.json and SQLite; `config/mcmerica25.ts` constant is now dead.
5. **Tier logic**: scaffolded in `frontend/src/config/tiers.ts` and `backend/tiers.py`; **neither is referenced anywhere**; "premium for all" is implicit.

## Cross-cutting observations recorded for later phases
- **Max funds inconsistency**: usePortfolio `MAX_FUNDS = 5`, App `isFull = length >= 4`, AllocationPanel header "n/5", empty state says "Up to 4 funds", CLAUDE.md says max 4. Effective limit is 4 via isFull gating of tray, but URL params can load more (parseUrlState doesn't cap count). → Phase 7 / report.
- PieChart falls back to accent crimson for `CUSTOM-*` tickers (FUND_META miss) — App doesn't pass customFundMeta to PieChart, so custom fund slices are all crimson. → Phase 7.
- TickerBanner hardcodes index scale factors (VOO×9.28, DIA×87.7) — approximations, drift over time. → report (uncertainty).
- `useCustomFunds` not persisted to localStorage — custom funds lost on reload (CLAUDE.md doesn't promise persistence; noted as quality gap).
- Custom funds cannot be encoded in share URLs (urlState validates against FUND_META only).
