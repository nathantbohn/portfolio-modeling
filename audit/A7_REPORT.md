# A7 — Rename to Youdex + price data refresh

Run: 2026-09-14, 00:05–00:30 local. Log: `C:\Users\natha\Documents\ClaudeLearning\A7_refresh.log`.

## TL;DR

- **Task 1 (rename): shipped.** Commit `1119253`, pushed to `origin/main`.
- **Task 2 (data refresh): stopped at Step 4 (gap check).** 6 tickers have missing months. Nothing exported and no data committed. `backend-deploy` not touched.
- **Separate, more serious finding:** a windowed backfill (or refresh.py's 90-day overlap) can't work for tickers that split since the last full download. Yahoo re-bases the overlap months, but older rows keep the old basis, so the data shows **fake −90% / +173% one-month moves**. One of them is McMerica constituent DD. Details below. Even with zero gaps, exporting this data would have been wrong.
- **DB state: partially updated, unexported, uncommitted.** `data/prices.db` is modified in the working tree, so `git status` is not clean. The committed version is the untouched baseline. `git checkout -- data/prices.db` restores it.

---

## Task 1 — Rename to Youdex

**Search:** case-insensitive `calibrated|callibrated|pioneer|meridian` over `frontend/src`, `frontend/index.html`, `frontend/public`. Recorded before any change.

| Hit | Context | Action |
|---|---|---|
| `frontend/index.html:8` | `<title>Callibrated Index Services</title>` | → `<title>Youdex</title>` |
| `frontend/src/App.tsx:181` | header `<h1>` text `Callibrated Index Services` | → `Youdex` |

- `frontend/public`: no hits (it contains only `data/prices.json`).
- No meta description, OG tags, web manifest, footer text or product name in share text exist. The Share button copies a URL only. Nothing added.
- **Left alone:** none within scope. Outside scope and untouched as instructed: CLAUDE.md, which mentions the `callibratedindex.space` domain.
- `npm run test`: 102/102 passed. `npm run build`: OK (only the existing >500 kB chunk warning).
- Commit `1119253` "chore: rename product to Youdex", pushed `18e326a..1119253 main -> main` before Task 2 started.

---

## Task 2 — Price refresh

### Step 1 — Baseline (`data/prices.db`)

| | Baseline | After backfill (uncommitted) |
|---|---|---|
| Total rows | 89,773 | 92,374 (+2,601) |
| Tickers | 525 | 525 |
| Overall max(date) | 2026-04-01 | 2026-09-01 |
| VOO | 2011-05-01..2026-04-01, 180 rows | ..2026-09-01, 185 |
| BND | 2011-05-01..2026-04-01, 180 rows | ..2026-09-01, 185 |
| MCMERICA-25 (DB key `MCMERICA-25`) | 2011-05-01..2026-04-01, 180 rows | ..2026-09-01, 185 |
| DIA | 2011-05-01..2026-04-01, 180 rows | ..2026-09-01, 185 |

- All 525 tickers had max(date) = 2026-04-01 at baseline.
- Every row in the DB uses day-of-month `01`.
- VOO reference month list: 180 consecutive months, 2011-05-01 … 2026-04-01.
- +2,601 rows reconciles exactly: 518 tickers × 5 new months + AVB/EA/EQR × 2 + MCMERICA-25 × 5.

### Step 2 — Which script ran and why

`backend/refresh.py` uses a **fixed lookback**: `start = today − 90 days`, i.e. 2026-06-16 today. It doesn't look at the last stored date, so it would have left 2026-05 (and arguably 2026-06) missing. **refresh.py was not run.**

Instead I wrote `audit/A7_backfill.py`. It imports `refresh_ticker` and `recompute_mcmerica` from refresh.py and `init_db`, `upsert_prices` and `get_all_tickers` from db.py; nothing is copied.

- **Window:** 2026-03-01 through today (end = today + 1 day, same convention as refresh.py).
- **Tickers:** every ticker in the DB.
- **Throttle:** same 0.5 s sleep. Upsert happens once at the end, as in refresh.py.
- **Deviations:**
  - `MCMERICA-25` is skipped for download because it isn't a Yahoo symbol. refresh.py would just log it as an error.
  - Empty results count as failures in the summary.
  - Constituents are recomputed at the end via `recompute_mcmerica()`, as refresh.py does.

Ran in the background as PID 34892, 00:13:07 → 00:18:35 (~5.5 min), exit 0. No stall, no timeout.

### Step 3 — Failure gate: PASSED

Attempted 524, succeeded 521, **failed 3**:

| Ticker | Error |
|---|---|
| BK | empty result; Yahoo: "possibly delisted; no price data found (1mo 2026-03-01 -> 2026-09-15)" |
| CTRA | same |
| SATS | same |

3 is within the limit of 10. None are among the 12 ETFs, 5 mutual funds, DIA, or the 25 McMerica constituents. All of those returned the full 7 months.

### Step 4 — Gap check: FAILED → STOP

Reference = VOO months after 2026-04-01: `2026-05-01, 2026-06-01, 2026-07-01, 2026-08-01, 2026-09-01`.

6 violations (all of them):

| Ticker | Missing months |
|---|---|
| AVB | 2026-05, 2026-06, 2026-09 (Yahoo returned only Jul, Aug) |
| EA | 2026-05, 2026-06, 2026-09 (only Jul, Aug) |
| EQR | 2026-05, 2026-06, 2026-09 (only Jul, Aug) |
| BK | all five |
| CTRA | all five |
| SATS | all five |

These checks all passed across all 525 tickers:
- no duplicate months
- no non-boundary dates in new or historical rows
- no null or non-positive prices
- no ticker's row count decreased
- no ticker's first date changed
- no ticker disappeared

New overall max(date) is **2026-09-01**, within the required 2026-08/09.

**Partial-month note (not decided):** the 2026-09-01 row was fetched on 2026-09-14, so it is almost certainly a **partial month** holding the mid-September price. The April baseline row was also partial (see below). Whether to keep, drop, or label the current month is your call.

Why the three stocks returned only Jul/Aug: not investigated. Rules limited me to one script, so no extra network probes. EA had a pending take-private deal. AVB/EQR looks more like a Yahoo data hiccup than a delisting. BK in particular is a large live listing, so its empty result may be transient.

### Step 5 — McMerica pre-computed series

**Two producers, same equal-weight chain-linked algorithm, base 100, over dates common to all available constituents:**
- `backend/refresh.py::recompute_mcmerica()` writes `MCMERICA-25` into the DB.
- `scripts/export_data.py::synthesize_mcmerica()` recomputes it from the exported constituents. It writes it to `prices.json` **and** back into the DB.

**Status in DB (uncommitted):** `recompute_mcmerica()` ran at the end of the backfill: 185 rows from 25 constituents, 2011-05..2026-09.
- It would pass the month-list check, because all 25 constituents are complete.
- Pre-March history is byte-identical to baseline.
- **But its 2026-03 return is contaminated** by the DD split artifact below: +2.01% stored, versus roughly −4.9% without the DD artifact.
- Not exported. `prices.json` is unchanged.

### Steps 6–8 — not run

No export. No data commit. No dev-server check. No `backend-deploy` merge or push.

---

## Things that looked off (read these before re-running)

### 1. Split re-basing corrupts the seam: blocker for any windowed refresh

Yahoo returns prices adjusted for splits as of today. The backfill overwrote 2026-03 and 2026-04 with the new basis, but 2011-05..2026-02 keep the old basis. For the 9 tickers below, the March `close` changed by a clean split ratio, so the Feb→Mar month shows a fake move:

| Ticker | new/old Mar close | Likely event | Fake Feb→Mar move |
|---|---|---|---|
| KLAC | 0.100 | 10:1 split | ≈ −90% |
| CVNA | 0.200 | 5:1 split | ≈ −81% |
| CRWD | 0.250 | 4:1 split | ≈ −74% |
| MNST | 0.500 | 2:1 split | ≈ −50% |
| APH | 0.500 | 2:1 split | ≈ −50% |
| **DD** (McMerica constituent) | 3.000 | 1:3 reverse split | **≈ +173%** |
| FDX | 0.806 | spin-off adjustment | ≈ −19% |
| SPGI | 0.946 | spin-off adjustment | ≈ −5% |
| MCMERICA-25 | 1.077 | knock-on from DD | +2.01% stored for Mar |

For DD, Feb 2026 is stored at 50.04 and Mar 2026 at 137.40.

**None of the 12 ETFs or 5 mutual funds split.** Their March `close` values are unchanged to the cent.

refresh.py has the same flaw with its 90-day overlap. It has probably been silent so far only because no split landed inside a refresh window.

Filling the gaps alone will not make this data exportable. These tickers need their **full history** re-downloaded (download.py / download_stocks.py).

### 2. Dividend-basis seam in `adjusted_close` (smaller, affects ETFs)

Even without splits, the re-fetched March `adjusted_close` differs from the stored value by 0–2%. The `close` is identical, so this is the difference between dividend-adjustment factors as of April and as of September. Examples:

| Ticker | March `adjusted_close` change |
|---|---|
| BND | −1.39% |
| SCHI | −1.69% |
| FXNAX | −1.29% |
| BNDX | −1.00% |
| F | −2.30% |
| CVX | −1.76% |

This puts a small false dip in the **total-return** series at the Feb→Mar boundary. It hits bond funds most. A full-history re-download of every ticker gives one consistent adjustment basis; any partial window cannot.

### 3. The April 2026 baseline row was a partial month

The stored 2026-04-01 values were mid-April prices; the TickerBanner comment says "April 10, 2026 close". They have now been replaced with month-end values. Examples: VOO close +4.73%, QQQ +8.16%, CAT +12.4%, WDC +24.1%, FCX −15.1%. That is expected and correct, but it means the currently deployed April data is partial.

### 4. Large real-looking moves in new months (not verified)

MRNA +156% (Aug), INTC +114% (Apr), DELL +101% (May), MU +88% (May), DDOG +87% (May). These may be genuine but are worth a glance.

---

## Current state / how to resume

- `main` = `origin/main` + this report commit (report + `audit/A7_backfill.py`). No data committed.
- `data/prices.db`: **modified, uncommitted**, holding the backfilled + recomputed-McMerica state described above.
  - To discard: `git checkout -- data/prices.db`.
  - A baseline copy also exists in this session's temp scratchpad, but that isn't durable.
- `frontend/public/data/prices.json`: untouched (baseline, 642,425 bytes).
- `backend-deploy`: untouched.
- Suggested next step, your decision:
  1. Full-history re-download for all tickers, which fixes #1 and #2.
  2. Decide what to do with BK/CTRA/SATS/EA/AVB/EQR: retry, drop, or allow a shorter history.
  3. Then re-run the Step 4–8 checks.
