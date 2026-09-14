# Phase 0 — Baseline

Date: 2026-09-07 ~23:04 local
Branch: `audit/sept-2026` (already existed at main's tip `1adf589`; checked out on arrival, working tree clean — no stash needed)

## Environment
- Node/npm: npm install completed cleanly (pre-existing `node_modules` refreshed)
- Python 3.11.3, pip 23.1.2; `pip install -r backend/requirements.txt` — all requirements already satisfied
- FastAPI app imports cleanly: `from main import app` → "Portfolio Backtester API"

## Build baseline
- `npm run build` (script is exactly `vite build`, per constraint): **PASSES**
- Build time: **11.55s** (vite-reported), ~14.1s wall
- Bundle output:
  - `dist/` total: **1,156 KB** (includes public/ data copied in)
  - `dist/assets/index-B0FCYOhN.js`: **510.8 KB** (gzip 163.1 KB) — single chunk, exceeds Vite's 500 KB warning threshold. No code-splitting.
  - `dist/assets/index-B6brZG8G.css`: 23.2 KB (gzip 5.2 KB)
  - `public/data/prices.json`: 628 KB on disk (shipped in dist)

## Type checking
- `npx tsc --noEmit`: **0 errors** (project config, non-strict extras TBD in Phase 2)

## Lint
- `package.json` has `"lint": "eslint ."` **but eslint is not installed** (not in devDependencies; `npm run lint` fails with "'eslint' is not recognized"). No eslint config file check yet. → Finding; Phase 2 will run eslint via npx without modifying package.json.

## Tests
- **vitest is already configured** (`"test": "vitest run"` + `vitest ^3.0.0` in devDependencies) — the rule-2 vitest exception is NOT needed.
- Existing suite: **43 tests, all passing** in 2 files:
  - `src/utils/calculations.test.ts` (27 tests)
  - `src/hooks/usePortfolio.test.ts` (16 tests)

## Source inventory (line counts)
Frontend `src/`: 29 files, 4,079 lines total. Largest:
- App.tsx 522, CumulativeChart.tsx 484, calculations.ts 433, CustomFundBuilder.tsx 303, RollingReturnsChart.tsx 250
(files >300 lines flagged for Phase 7 decomposition review: App.tsx, CumulativeChart.tsx, calculations.ts, CustomFundBuilder.tsx)

Backend: `main.py`, `db.py`, `tiers.py`, `download.py`, `download_stocks.py`, `refresh.py` + `requirements.txt`
Data: `data/prices.db` (7,048 KB SQLite)
Scripts: `scripts/export_data.py`

## Baseline verification standard numbers
- build: PASS (11.55s)
- tsc --noEmit errors: 0
- tests: 43/43 pass
- lint: not runnable as configured
