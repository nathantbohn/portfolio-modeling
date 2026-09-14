# Phase 2 — Static Analysis

## TypeScript
- `tsconfig.app.json` already sets `"strict": true` plus noUnusedLocals/Parameters, noFallthrough, noUncheckedSideEffectImports.
- `npx tsc -p tsconfig.app.json --noEmit --strict`: **0 errors**.
- `any` usages in src: **2** (both `d3.timeFormat('%Y') as any` tickFormat casts) — **fixed** in commit `02dbc91` by typing the axis as `d3.axisBottom<Date>(x)`. Zero `any` remains.

## ESLint
- `package.json` has `"lint": "eslint ."` but **eslint is not a devDependency and no eslint config file exists** — the lint script has never been runnable as configured. (Fix proposal in PROPOSED_FIXES; package.json is off-limits for this audit.)
- Ran eslint 9 + typescript-eslint 8 recommended via a temporary config (installed in scratchpad, config file removed after run). Results: **only the 2 `no-explicit-any` hits fixed above**, plus 5 "Definition for rule 'react-hooks/exhaustive-deps' was not found" — those come from existing `eslint-disable-next-line react-hooks/exhaustive-deps` comments in the source, evidence the project was written against a react-hooks-enabled lint setup that was never checked in.
- Verdict: source is unusually lint-clean; the broken lint script is the finding.

## Knip (unused files/exports/deps)
All claims verified by grep before acting:
- **Unused files**: `src/utils/animations.ts`, `src/config/mcmerica25.ts` (both **removed**, commit `260c287`), `src/config/tiers.ts` (**kept** — CLAUDE.md documents tier scaffolding as intentional; flagged in report instead). dist/assets false positives ignored.
- **Unused exported types**: `Ticker` (usePortfolio.ts), `Fund`, `ReturnSeries`, `PortfolioStats` (types/index.ts) — all **removed** in `260c287`.
- Unused deps: none reported. Unlisted binary: `eslint` (matches the broken lint script above).

## Backend (ruff via pip-installed module — uvx/pipx unavailable on this machine; mypy likewise)
- `mypy main.py db.py tiers.py --ignore-missing-imports`: **clean**.
- `ruff check .`: 11 findings, none in the request path logic:
  - `main.py:12` UP035 — `AsyncGenerator` should import from `collections.abc` (cosmetic)
  - `db.py:1`, `download_stocks.py:20`, `refresh.py:19` I001 import sorting (cosmetic)
  - `download.py`/`download_stocks.py`/`refresh.py`: DTZ011 naive `date.today()` (×3) and BLE001 blind `except Exception` (×4) — all in ETL scripts, which are out of modification scope per audit rules; blind excepts there are arguably intentional (per-ticker download resilience).
- No ruff/mypy findings requiring code change; nothing committed for backend.

## Verification after Phase 2 commits
- `npm run build`: PASS (3.0s incremental)
- `npx tsc --noEmit`: 0 errors (baseline was 0; no increase)
- Tests: 43/43 pass
- Commits: `02dbc91` (type-safety), `260c287` (dead code)
