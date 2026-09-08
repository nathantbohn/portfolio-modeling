# Audit Checkpoints

## Phase 0 — Setup
- Status: COMPLETE
- Timestamp: 2026-09-07 23:06 local
- Notes: Working tree was clean on arrival — no stash created. Branch `audit/sept-2026` already existed at main tip (1adf589) and was checked out; used as-is. vitest already configured, so the rule-2 vitest exception is unused. eslint script exists but eslint not installed (finding, Phase 2).
- Files written: audit/00_baseline.md

## Phase 1 — Inventory
- Status: COMPLETE
- Timestamp: 2026-09-07 23:15 local
- Notes: 3 zero-importer frontend files found (animations.ts, config/tiers.ts, config/mcmerica25.ts). Data-flow discrepancy vs CLAUDE.md: VITE_API_URL switches ENTIRE base load to backend /prices (525 tickers).
- Files written: audit/01_inventory.md

## Phase 2 — Static analysis
- Status: COMPLETE
- Timestamp: 2026-09-07 23:22 local
- Notes: 2 code commits made (02dbc91 type-safety, 260c287 dead-code). tsc/build/tests verified after each. Backend mypy clean; ruff only cosmetic/ETL findings. eslint not actually installed/configured despite lint script — reported.
- Files written: audit/02_static.md

## Phase 3 — Calculation engine correctness
- Status: COMPLETE
- Timestamp: 2026-09-07 23:35 local
- Notes: 32 new tests added across 3 files; 3 intentionally-failing finding tests (vol-with-contributions, maxDD-with-contributions, IRR timing). 74/77 pass; the 3 failures are the findings. Build + tsc still clean.
- Files written: audit/03_calc_correctness.md, frontend/src/utils/calculations.audit.test.ts, frontend/src/utils/synthesize.test.ts, frontend/src/hooks/usePortfolio.locking.test.ts

## Phase 4 — Performance
- Status: COMPLETE
- Timestamp: 2026-09-07 23:45 local
- Notes: Budget holds with ~13x headroom (worst case p95 1.2ms vs 16ms). Biggest avoidable cost: synthesizePriceData re-runs per slider frame (App mergedPriceData memo dep on activeFunds). No fixes applied.
- Files written: audit/04_performance.md, audit/bench.ts

## Phase 5 — Backend
- Status: COMPLETE
- Timestamp: 2026-09-07 23:55 local
- Notes: /prices = 7.45MB uncompressed, N+1 (526 queries), no gzip/cache — P1. No SQL injection (parameterized, verified live). Connections never closed (P2). Data stale since Apr 2026.
- Files written: audit/05_backend.md

## Phase 6 — Security & dependencies
- Status: COMPLETE
- Timestamp: 2026-09-08 00:05 local
- Notes: All 7 npm vulns are dev/build-time only (prod bundle clean). starlette advisories mostly unreachable (GET-only API). URL tampering: weight=Infinity NaN-cascade verified (S-1), principal=0 NaN CAGR, fund-count cap bypass. localStorage safe. Nothing upgraded.
- Files written: audit/06_security_deps.md

## Phase 7 — Frontend quality
- Status: COMPLETE
- Timestamp: 2026-09-08 00:15 local
- Notes: ~28% duplication across 3 D3 charts (shared-module proposal). App.tsx/CumulativeChart/CustomFundBuilder decomposition proposals. warm-300/400 text fails WCAG AA. Click-to-add not keyboard operable (no KeyboardSensor). PieChart drops custom fund colors. 4-vs-5 fund limit inconsistency.
- Files written: audit/07_frontend_quality.md
