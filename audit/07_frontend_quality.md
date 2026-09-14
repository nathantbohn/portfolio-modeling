# Phase 7 — Frontend Quality

## 1. D3 chart duplication (CumulativeChart 484 / RollingReturnsChart 250 / AnnualReturnsChart 148 = 882 lines)

Measured overlap (~230–260 lines ≈ 28% of chart code is duplicated or near-identical):
- **Constants** (~35 dup lines): MARGIN/EASE/DURATION, AXIS_TEXT/GRID_LINE/zero-line colors, MONO_FONT, TOOLTIP_BG/BORDER/TEXT, date/pct formatters — declared 3× (2× for tooltip consts). Ironically `utils/animations.ts` was the start of such a module and was dead.
- **Resize handling** (~30): identical ResizeObserver effect (`initialized.current = false; setResizeTick(t+1)`) 3×.
- **Init-once scaffolding** (~45): `initialized` ref + `selectAll('*').remove()` + chart-g translate + class-named element pre-creation, 3×.
- **Axis styling** (~36): the four-`.call` chain (domain removal, tick text fill/size/font, grid-line styling) 3× with only tick counts differing.
- **Tooltip machinery** (~70 near-identical between Cumulative & Rolling): overlay rect, crosshair, hover dot(s), `d3.bisector` + findNearest, mousemove → position with right-edge flip, mouseleave reset, absolutely-positioned tooltip div with the same inline style object.
- **Empty state** (~8 × 3).

**Proposed shared module** (`src/components/chart/`): `chartTheme.ts` (constants + formatters), `useChartSurface.ts` (container/svg refs + ResizeObserver + init lifecycle), `axes.ts` (`styleXAxis`/`styleYAxis` helpers), `tooltip.ts` (create/position/find-nearest). Estimated −200 lines and one place to fix behaviors like transition churn (P4-3). Effort M; risk moderate (touches all charts — needs visual regression care). Charts keep their own render logic; this respects the D3-direct-DOM rule in CLAUDE.md.

## 2. Components over 300 lines — decomposition proposals

- **App.tsx (522)** — five responsibilities: url/share state, custom-fund data plumbing, portfolio computation memos, mobile/sidebar chrome, layout. Proposal: extract `useCustomFundData()` (stockTickersToFetch + mergedPriceData + customFundMeta + customFundStatus, App.tsx:59-113), `<ControlSidebar>` (App.tsx:227-397, the entire aside), and `<CustomFundStatusBanners>` (App.tsx:412-439). App drops to ~250 lines of composition. Effort M, risk low (mechanical extraction).
- **CumulativeChart.tsx (484)** — covered by the shared-module proposal above; with chartTheme + tooltip extracted it lands ~250.
- **CustomFundBuilder.tsx (303)** — marginal; extract `<StockSearchDropdown>` (search state + debounce + dropdown, lines 36-199) leaving the form ~150. Effort S.

## 3. State management

- Portfolio state is held once in `usePortfolio` (App-level); derived data flows through four `useMemo`s (result, chartBounds, rollingData, benchmarkData). **No derived state is stored redundantly** — good discipline.
- `parseUrlState()` runs twice (usePortfolio.ts:125 and App.tsx:115), splitting URL-initialized state across two owners (funds/rebalance/principal in the hook; benchmark/rolling in App). Consolidation candidate, cosmetic.
- **Fund-limit inconsistency (bug-adjacent)**: `usePortfolio.MAX_FUNDS = 5`, but App gates the tray with `isFull = length >= 4` (App.tsx:148), AllocationPanel header prints "{n}/5", its empty state says "Up to 4 funds", and CLAUDE.md says max 4. Effective UI limit is 4; the 5th slot is reachable only via URL params (or presets — **All Weather preset has 5 funds** and loads fine, after which the tray is Full). Decide 4 or 5 and align constant + copy.
- `PresetPortfolios` keeps `activeIdx` highlight that goes stale the moment the user drags any slider (preset still shown as active). Cosmetic.
- `useCustomFunds` is React-state only — custom funds (and their weights) **vanish on reload**, though the product's share/persistence story otherwise leans on URL + localStorage. Quality gap worth a product decision (localStorage persistence is a natural fit).

## 4. Accessibility

Contrast (WCAG AA needs 4.5:1 normal text, 3:1 large; measured against the FT palette):
| Combo | Ratio | Verdict |
|---|---|---|
| warm-50 #33302E on surface-0 | 11.83 | pass |
| accent #990F3D on surface-0 | 7.62 | pass |
| warm-200 #7D7168 on surface-1 | 4.50 | pass (exactly) |
| warm-200 on surface-0 | 4.28 | **fail AA** (borderline) |
| axis text #7D7168 on white | 4.74 | pass |
| warm-300 #9E9489 on surface-0/1 | 2.69/2.83 | **fail** — used heavily for 10–11px secondary text (stats sublabels, "as of", statuses, preset subtitles) |
| warm-400 #BEB0A3 on surface-1 | 2.01 | **fail** — placeholder & icon text |
| stat green/red on card | 5.02/5.16 | pass |
| ticker green/red on #1a1a1a | 6.86/4.62 | pass |

- **Sliders**: `input[type=range]` is natively keyboard-operable (arrow keys) ✓ but has **no accessible name** (no aria-label; the ticker text isn't associated) — announces as "slider". Same for the paired number input. Fix: `aria-label={\`\${ticker} allocation percent\`}` on both. Effort S.
- **Click-to-add funds is not keyboard operable**: DraggableFund rows are divs; dnd-kit's `attributes` make them focusable with role=button, but only a `KeyboardSensor` (not configured — PointerSensor only, App.tsx:42-44) or a real onKeyDown would make Enter/Space act. Keyboard users can Tab to every fund but cannot add one. Fix: add KeyboardSensor + coordinate getter, or onKeyDown Enter→onAdd. Effort S.
- **CustomFundBuilder modal**: no `role="dialog"`, no `aria-modal`, no focus trap, no Escape-to-close, focus not moved on open/close. Effort S–M.
- **Charts**: no text alternative (`role="img"` + aria-label with headline numbers would do); tooltips are mousemove-only — no touch or keyboard access to data points. StatsPanel provides numeric equivalents for the headline stats, which mitigates.
- `prefers-reduced-motion` is not respected anywhere (framer-motion + d3 transitions). P3.
- Positives: ToggleSwitch has role="switch" + aria-checked; lock/remove/collapse buttons have aria-labels; touch targets get 44px min-heights on mobile.

## 5. Error/loading coverage per backend fetch

| Fetch | Loading | Error | Gaps |
|---|---|---|---|
| `usePriceData` → `/prices` or prices.json (primary data) | "Loading…" header pulse | tiny "API error" header text; charts fall back to "No data" | **No retry, no explanatory UI** for the one fetch the whole product depends on (P2). Abort handled ✓ |
| `useStockPrices` → `/prices/{t}` | spinner banner per custom fund | per-ticker error + Retry button ✓ | (a) a 200 with empty array marks neither fetched nor errored → fund stuck at "Loading" forever; (b) `loading` is a single boolean — a second batch finishing first flips it false while the first is still in flight; (c) retry effect depends on `retryTick.current` (a ref) in the deps array — works only via the setTick re-render trick, fragile |
| CustomFundBuilder → `/search` | spinner in dropdown ✓ | "Server unavailable" state ✓ | stale-response race: no query token/abort of prior request; a slow old response can overwrite results for a newer query (300ms debounce mitigates) |

## 6. Other quality findings

- **PieChart ignores custom fund colors**: wedge color comes from `FUND_META[ticker]` with `#990F3D` fallback (PieChart.tsx:132-136); App never passes `customFundMeta` to PieChart, so every custom fund slice renders accent crimson — two custom funds are indistinguishable, and the slice color contradicts the fund's color everywhere else (slot stripe, tray dot, drag overlay). Small fix: thread `customFundMeta` in like AllocationPanel does.
- PieChart labels show `Math.round(weight)%` of raw weight, not of the normalized total — with URL-loaded weights not summing to 100 the labels don't match the arc sizes. Edge cosmetic.
- TickerBanner hardcodes scale factors (VOO×9.28, DIA×87.7) to approximate S&P/Dow index levels — drifts as the ETF NAV/index ratio changes; displayed levels are already ~inaccurate by design. Uncertainty flagged for the report.
