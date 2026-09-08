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
