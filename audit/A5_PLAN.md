# A5 Plan — static-first price loading, backend only on user action

Branch: `fix/a5-static-first-loading` (from `main` @ ddb1c48). Frontend only; no backend changes.

## 1. Every backend call today

`VITE_API_URL` is read in three modules. No axios, no shared API client.

| # | Call site | Endpoint | When it fires | Consumer of the result |
|---|---|---|---|---|
| 1 | `hooks/usePriceData.ts:26-28` | `GET ${VITE_API_URL}/prices` (all 525 tickers, 7.45 MB, 526 SQL queries) — or `/data/prices.json` when `VITE_API_URL` is unset | **Page load** (mount effect in `App`) | `App` → `priceData` → `mergedPriceData` → `computePortfolio`, `computeChartBounds` (ALL_TICKERS), `computeBenchmark`, `TickerBanner` (MCMERICA-25, VOO, DIA, "as of" date) |
| 2 | `hooks/useStockPrices.ts:50` | `GET ${VITE_API_URL}/prices/{ticker}` per constituent, 45 s timeout | **User action**: a user-built custom fund becomes *active* in the portfolio (effect on `stockTickersToFetch`, `App.tsx:59-70`) | `App` → `stockPrices` → `synthesizePriceData` inside `mergedPriceData` (per slider frame) and `customFundStatus` (loading/error banner under the sliders, `App.tsx:412-440`) |
| 3 | `components/CustomFundBuilder.tsx:47` | `GET ${VITE_API_URL}/search?q=`, 45 s timeout, 300 ms typing debounce | **User action**: typing in the builder's stock search | Search dropdown results → `addStock` (adds ticker/name to the draft; **no price fetch at add time**) |

Page-load requests to the backend in production today: **1** (`/prices`, 7,454,822 bytes uncompressed per audit/05 B-1).

## 2. What `prices.json` contains

`frontend/public/data/prices.json` — 642,425 bytes, 44 keys, monthly, `{date, adjusted_close, close}`:

- 12 ETFs: VOO, BND, VXUS, SCHD, SCHF, SCHI, VTI, QQQ, BNDX, VBR, GLD, DBC
- 5 mutual funds: FXAIX, FSKAX, FTIHX, FXNAX, FBGRX
- DIA (Dow proxy for the ticker banner)
- All 25 McMerica constituents: AAL, AXP, BRK-B, CAT, COP, COST, CVX, DD, DE, DIS, F, FCX, GD, HD, HOG, JNJ, JPM, MAR, MCD, PEP, PM, T, TAP, WDC, WMT (checked against `MCMERICA_25.txt`: 25/25 present)
- `MCMERICA-25`: the pre-computed composite (base 100), written by `scripts/export_data.py`

Date range: 2011-05-01 → 2026-04-01 (180 points) for most tickers; shorter for BNDX (2013-06), FSKAX (2011-09), SCHD (2011-10), FTIHX (2016-06), SCHI (2019-10).

**McMerica 25 works without the backend.** The tray entry uses the pre-computed `MCMERICA-25` series, and the banner reads the same key. A user-built fund made from McMerica constituents could also be synthesized from static data alone.

Every ticker the base UI can reference — `ALL_TICKERS` + `MUTUAL_FUND_TICKERS` (`hooks/usePortfolio.ts`), all 5 presets (`PresetPortfolios.tsx`: VOO, BND, VTI, VXUS, QQQ, VBR, SCHD, GLD, DBC), URL-shared funds (`urlState.ts` accepts only `FUND_META` keys), the banner (MCMERICA-25, VOO, DIA) — is in `prices.json`.

## 3. How "static" vs "backend" tickers are distinguished today

They aren't. `usePriceData` is either/or on `VITE_API_URL`: when set (production), it **ignores the static file** and loads everything from `/prices`. `useStockPrices` separately refetches every custom-fund constituent from `/prices/{ticker}` even when that ticker is already present in the base data (e.g. JPM), and keeps its own cache in component refs.

## 4. Current loading/error state model

- **Base data** (`usePriceData`): `{data, loading, error}`. While in flight: header shows "Loading…" (pulse), `TickerBanner` shows "Loading indices...", `result` is `null` so `StatsPanel` shows `--` and charts are empty. On error: a header label "API error" with the message in `title`; the UI stays empty. On a Render cold start the whole app is blank for 30–60 s.
- **Custom-fund constituents** (`useStockPrices`): one global `loading` flag, per-ticker `errors`, a `retry()` that re-fetches all failed tickers. `App` derives `customFundStatus` and renders a banner under the sliders ("Loading {name}..." / "Couldn't load {name}" + Retry). 45 s timeout. No slow-server message.
- **Broken-state bug:** the custom fund is added to `activeFunds` *before* its data exists. `computePortfolio` silently drops allocations with no price data (`calculations.ts:62-64`) and renormalizes the rest, so the fund's slider shows e.g. 25% while the charts reflect only the other funds — until the fetch lands, or forever if it fails.
- **Search** (`CustomFundBuilder`): `searchLoading` → "Searching..." in the dropdown; `searchError` → "Server unavailable / Try again in a moment" with **no retry action**; 45 s timeout; responses from earlier keystrokes are not aborted and can overwrite newer results.

## 5. Backend endpoints available

`backend/main.py` already exposes `GET /prices/{ticker}` (single ticker, uppercases input, 404 on unknown) and `GET /search`. **No backend change is required** for this task.

## 6. Proposed change (minimal)

### 6.1 Data-access module — `frontend/src/utils/dataAccess.ts`

- `BackendError extends Error` with `kind: 'timeout' | 'network' | 'http' | 'unconfigured'` (+ `status` for `http`).
- `fetchBackendJson<T>(path, opts)`: prefixes `VITE_API_URL`, 75 s timeout via `AbortController`, maps failures to `BackendError`. Caller aborts (superseded search) are rethrown as `AbortError`, not reported as timeouts.
- `createPriceStore({ apiUrl, fetchImpl, timeoutMs })` → `{ loadStatic(url), seed(data), peek(ticker), getPrices(ticker) }`:
  - `loadStatic()` fetches `/data/prices.json` **once** (memoized promise, StrictMode-safe) and seeds the in-memory map.
  - `getPrices(ticker)`: waits for a pending static load (so a user who opens the builder before `prices.json` lands doesn't hit the backend for a static ticker), then returns from the map if present; otherwise one `GET /prices/{ticker}` with in-flight de-duplication; success is cached for the session; failure is not cached, so Retry refetches.
- `searchStocks(q, signal)` → `fetchBackendJson('/search?q=…')`.
- A default `priceStore` instance bound to `import.meta.env.VITE_API_URL`.
- `trackRequest(promise, onPhase, slowMs = 5000)` → emits `loading` → `slow` (after 5 s if still pending) → `ready` | `error`; returns a cancel function. Pure and timer-driven, so it is unit-testable with fake timers.

### 6.2 Base load — `usePriceData`

Always `priceStore.loadStatic()`. The `/prices` branch is deleted. Page load makes **zero** backend requests. The state shape (`{data, loading, error}`) is unchanged; the header error label becomes "Price data error", because no API is involved any more.

### 6.3 Where backend fetches happen and who shows the state

- **Adding a stock in the builder** fetches its prices immediately (static tickers resolve instantly with no request). The **constituent row** that triggered it shows the state: a spinner and "Loading prices…"; after 5 s the line becomes "Waking the data server — first request can take up to a minute."; on failure it shows an inline error + **Retry**.
- **Create Fund is disabled until every constituent's prices are loaded.** A failed stock must be retried or removed first. So a custom fund can never enter the tray, and therefore never the portfolio, without data. This is the fix for the broken-state bug in §4.
- **Search box**: the same loading / slow / error + Retry line in the dropdown; a new keystroke aborts the previous request.
- `useStockPrices.ts` and the `customFundStatus` banner in `App.tsx` are deleted, because they only existed to cover data that arrived after the fund was already active.

### 6.4 Custom fund synthesis in `App`

Because constituent data is guaranteed to be in the store at creation time, `App` synthesizes each custom fund in a memo keyed on `[customFunds]` (reading `priceStore.peek`). `mergedPriceData` becomes `{...priceData, ...customFundSeries}` keyed on those two values instead of `activeFunds`. **Slider loop impact:** this *removes* work per frame — synthesis no longer re-runs on every drag event (audit/04 finding: 75–88% of frame cost with an active custom fund). No slider handler, debounce, animation, Y-axis or palette changes.

### 6.5 Not doing

- No prefetch or warm-up ping on page load.
- No backend changes (recommendations go in the report: gzip + Cache-Control on `/prices/{ticker}` and `/search`, deprecating `/prices`, an optional keep-alive).

## 7. Tests planned

- `utils/dataAccess.test.ts`: static ticker → no fetch; unknown ticker → one fetch, second call cached (and concurrent calls de-duplicated); HTTP/network failure → rejects with `BackendError` of the right kind, and a retry refetches; timeout → `BackendError('timeout')` (fake timers); `trackRequest` loading → slow at 5 s → ready/error.
- `components/BackendStatusLine.test.ts`: drives a pending request through `trackRequest` with fake timers and renders the status line at each phase: loading text, the slow-server message after 5 s, error + Retry button on failure.
  - **Limitation:** there is no DOM test environment installed (no jsdom/happy-dom/testing-library) and no new dependencies are allowed, so the component is rendered with `react-dom/server` per phase rather than mounted and clicked.
