# Phase 5 — Backend

Method: code review of `main.py`/`db.py` + live exercise of every endpoint via FastAPI TestClient against the real `data/prices.db` + `EXPLAIN QUERY PLAN`.

## Endpoint behavior (verified live)
| Endpoint | Result |
|---|---|
| `/health` | 200 `{"status":"ok"}` |
| `/tickers` | 200, 525 tickers, 0.02s |
| `/prices/VOO` | 200, 180 points, 0.01s; lowercase `voo` works (uppercased); unknown ticker → clean 404 |
| `/prices` | 200, **525 tickers, 7,454,822 bytes (7.45 MB), 0.68s CPU on this dev machine** |
| `/search?q=app` | 200, ranked (prefix matches first), LIMIT 10 enforced |
| `/search?q=%` | 200, 10 rows (wildcard leaks into LIKE — harmless: still LIMIT 10, read-only) |
| `/search?q='; DROP TABLE prices; --` | 200, 0 rows; table intact — **parameterized queries, no injection** |

## Findings

### B-1 — `/prices` is a 7.45 MB unbounded, uncached, uncompressed payload the frontend loads on every visit (P1)
- `usePriceData` fetches `${VITE_API_URL}/prices` on mount in production. The endpoint runs **1 + 525 queries** (one per ticker via `get_prices_by_ticker` in a dict comprehension, `main.py:62-71`), instantiates ~90k Pydantic `PricePoint` models, and serializes 7.45 MB of JSON.
- No `GZipMiddleware`, no `Cache-Control`/`ETag`, no pagination or ticker filter. On Render free tier (shared CPU, cold starts, 512 MB) expect multi-second responses and memory spikes; every visitor pays it.
- The product needs only the 44 curated tickers for the base UI (exactly what `prices.json` ships). The static JSON path already exists and is CDN-served by Vercel.
- **Proposed** (PROPOSED_FIXES PF-2): always load base data from static JSON; use the backend only for `/prices/{ticker}` (custom-fund constituents) and `/search`, matching CLAUDE.md's documented data flow. Alternatively/additionally: add GZipMiddleware (7.45 MB → ~1 MB), a `?tickers=` filter, one SQL query with `ORDER BY ticker, date` grouped in Python, and `Cache-Control: public, max-age=86400` (data changes monthly).

### B-2 — SQLite connections are never closed (P2)
- `db.py` opens `sqlite3.connect(...)` per call; `with get_connection() as conn` only wraps a **transaction** (commit/rollback) — Python's sqlite3 context manager does not close. Connections are freed only by GC. Under CPython refcounting this mostly works, but it's a leak pattern, and `/prices` opens 526 connections per request.
- **Proposed**: `contextlib.closing()` wrapper or explicit `try/finally: conn.close()`; or a single module-level read-only connection (`check_same_thread=False`, `mode=ro` URI) since request handlers only read.

### B-3 — Redundant index (P3)
- `idx_prices_ticker` duplicates the leading column of the PK `sqlite_autoindex_prices_1 (ticker, date)`. Query plans confirm the per-ticker query uses the PK autoindex (SEARCH ... ticker=?) — the extra index only bloats the DB and slows upserts. `DISTINCT ticker` happens to scan it as a covering index but would use the autoindex identically.
- `/search` LIKE scan on 524 metadata rows + temp B-tree sort: fine at this size.

### B-4 — Error handling & response shape (P2)
- Only the 404 case is handled. Any sqlite error (locked/corrupt/missing file) surfaces as an unhandled 500 with a stack trace in logs and a generic body — acceptable for now but there's **no logging configured at all** (no request log, no error log beyond uvicorn defaults), so production failures on Render are hard to diagnose.
- Response shapes are consistent (typed via response_model). `/search` returns `[]` for empty q — good.
- `/prices/{ticker}` accepts arbitrary path strings (no length/charset validation). Harmless today (parameterized, 404), noted only for completeness.

### B-5 — CORS & config (OK, one note)
- `allow_origins` from `ALLOWED_ORIGINS` env (set in Render dashboard per render.yaml comment), `allow_methods=["GET"]` — appropriately tight. Default falls back to localhost origins only; if the env var were lost, production silently breaks (frontend CORS errors) — worth a startup log line.
- No secrets or hardcoded URLs in backend source. Frontend reaches the API only via `VITE_API_URL` (baked at build time per CLAUDE.md).
- `tiers.py` is scaffolding not imported by `main.py` (see inventory) — its `get_tier` FastAPI dependency is unused.

### B-6 — Data staleness (ops note, P2)
- DB and prices.json end at **2026-04-01**; today is 2026-09-07. The documented monthly refresh hasn't run in ~5 months. The ticker banner correctly shows "as of Apr 2026", so this is transparent to users, but stats/backtests are 5 months stale. (Refresh scripts are out of audit modification scope.)

### DB details (verified)
- `EXPLAIN QUERY PLAN` per-ticker query: `SEARCH prices USING INDEX sqlite_autoindex_prices_1 (ticker=?)` — optimal, satisfies the ORDER BY too.
- `init_db()` runs on lifespan startup: idempotent CREATE IF NOT EXISTS — fine with the repo-committed DB; Render disk is ephemeral but the DB ships with the deploy (read-mostly usage).
