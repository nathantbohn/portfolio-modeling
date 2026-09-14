# A7 — Rename to Youdex + price data refresh

Log: `C:\Users\natha\Documents\ClaudeLearning\A7_refresh.log` (runs 1 and 2).

# RUN 2 — full-history re-download (00:30–00:50)

## TL;DR (run 2)

- **Full re-download worked.**
  - 518 of 524 tickers were replaced atomically.
  - The gap check passes for all 519 active tickers (518 plus MCMERICA-25).
  - Max date is **2026-08-01**; September rows were deleted.
  - The split seams from run 1 are gone.
- **6 tickers marked inactive:** AVB, BK, CTRA, EA, EQR, SATS. None are core.
- **Stopped at the continuity gate (decision 5): no export, no data commit, `backend-deploy` untouched.**
  - Four McMerica constituents have single-month moves beyond ±40%: AAL, FCX, WDC (×3) and **F**.
  - Five of those six events look genuine; four are already in the live data today.
  - **F May 2026 (+44%, then −20% in June) looks suspicious.** Ford's peers didn't move. It needs a human check against another source.
- **New artifact found (non-core, doesn't stop the run):** DHR Jul 2016 adjusted_close now shows +65.4% against close +6.4%. The baseline had +6.5%. Yahoo's current adjustment appears to mishandle the 2016 Fortive spin-off.
- **Committed and pushed to `main`:**
  1. The `backend/db.py` change (`metadata.active` plus search filter).
  2. The rewritten `audit/A7_backfill.py` and this report.
- **DB state: fully updated, unexported, uncommitted.**
  - `data/prices.db` in the working tree holds the run 2 result.
  - An identical copy is at `C:\Users\natha\Documents\ClaudeLearning\A7_prices_run2.db`.
  - The committed DB is still the April baseline.

## Decisions as executed

**1. Restore.** Ran `git checkout -- data/prices.db`; git status was clean, and the file hash matched the pre-run-1 backup.

**2. Full re-download.** `audit/A7_backfill.py` was rewritten; refresh.py was not modified.
- **Fetch:** reuses `refresh.refresh_ticker` and `refresh.recompute_mcmerica`, with the same 0.5 s throttle.
- **Validation before replacing:**
  - non-empty
  - day-01 dates, no duplicates
  - contiguous months
  - reaches 2026-08-01
  - history doesn't start later than stored
- **Replacement:** `DELETE` + `INSERT` for the ticker in **one transaction** (sqlite3 context manager: commit on success, rollback on exception). Invalid or empty fetches keep the old rows.
- **Interpretation, please check:** "complete available history" was fetched from **2011-05-01**, the DB's established 15-year span from the original download, not Yahoo's max period.
  - Why: literal max history (e.g. AAPL from 1980) would break your own checks. VOO has no months to compare against before 2011, and prices.json would grow far beyond ~640 KB.
  - Tickers listed after 2011 got their full available history. Result: 0 tickers start earlier or later than before.
- Ran as PID 38712, 00:30:19 → 00:35:59, exit 0. No stall.

**3. Current month excluded.** 518 rows dated 2026-09-01 deleted; 0 remain. The new max(date) is **2026-08-01**.

**4. Failed tickers.** Pass 1: 518 replaced, 6 failed. Retry: 0 recovered. All 6 marked inactive with their old rows kept; each still ends at 2026-04-01, the partial April row.

| Ticker | Name | Why inactive |
|---|---|---|
| AVB | AvalonBay Communities | Yahoo returns only 2026-07 and 2026-08 (history "starts" 2026-07). Old rows kept; missing 2026-05..08 |
| BK | The Bank of New York Mellon | Yahoo: "possibly delisted; no price data found" (both attempts) |
| CTRA | Coterra Energy | same |
| EA | Electronic Arts | only 2026-07 and 2026-08 returned (EA had a pending take-private) |
| EQR | Equity Residential | only 2026-07 and 2026-08 returned |
| SATS | EchoStar | Yahoo: "possibly delisted; no price data found" (both attempts) |

The three returning only two months (AVB, EA, EQR) behaved identically in run 1, run 2, and the retry. That is consistent, not transient. BK being "delisted" is surprising for a large live bank; worth a manual look.

- **Search exclusion:** `metadata.active INTEGER NOT NULL DEFAULT 1` was added, and `search_metadata` now filters `active = 1`.
  - Verified: `/search` queries for BK, CTRA, SATS, AVB, EA and EQR no longer return those tickers; AAPL and VOO still return.
  - The migration is idempotent and tested on a copy of the baseline DB, so old DBs and Render keep working.
- ⚠ **This modifies application source (`backend/db.py`),** which the original A7 rules barred. Decision 4 can't be met any other way, because search reads the metadata table through that function. It is a separate commit.
- **Export exclusion:** needed no code change. `scripts/export_data.py` exports only the fixed list (13 ETFs incl. DIA, 5 mutual funds, 25 constituents), and no inactive ticker is on it; a core ticker going inactive would have stopped the run anyway. export_data.py is untouched.
- **Not done:** inactive tickers are still served by `/prices/{ticker}` and `/tickers`. You didn't ask for that.

**5. Gap check (new baseline): PASS.**
- For each of the 519 active tickers, the month list from its first date to 2026-08-01 exactly matches VOO's (2011-05-01..2026-08-01, 184 months).
- 0 violations, 0 duplicates, 0 non-boundary dates, 0 null or non-positive prices.
- No row count decreased: 89,773 → 91,849 (+2,076 = 519 × 4 months).

**Continuity check: 263 single-month moves beyond ±40%** (full appendix below).
- 224 were already beyond ±40% in the live baseline data.
- 39 are new or changed: new months, the previously partial April, updated dividend factors, and one artifact (DHR).
- **Core tickers flagged → STOP, per your rule:**

| Core ticker | Month | adj / close | In live data today? | Read |
|---|---|---|---|---|
| AAL | 2012-01 | +66.5% / +66.5% | yes, identical | Pre-2013 AAL history is US Airways (LCC); Jan 2012 rally on AMR merger speculation ($5.07→$8.44). Genuine. |
| FCX | 2016-02 | +65.9% / +65.9% | yes, identical | Commodity-bottom rebound ($4.60→$7.63→$10.34→$14.00). Genuine. |
| WDC | 2025-09 | +49.6% / +49.4% | yes | Start of the AI storage rally ($80→$120). Genuine-looking. |
| WDC | 2026-01 | +45.3% / +45.3% | yes | Storage rally; SNDK +143%, STX +48%, MU +45% the same month. Genuine-looking. |
| WDC | 2026-04 | +60.6% / +60.6% | baseline +29.5% (partial April) | Full-month April; STX +72%, MU +53% the same month. Genuine-looking. |
| **F** | **2026-05** | **+46.2% / +44.4%** | no (new month) | **$12.08 → $17.44 → $13.90 (June). Spike-and-revert; GM +8%, TSLA +14%, APTV +13% that month. Suspicious, possibly a bad Yahoo monthly print. Verify.** |

**My recommendation, your decision:**
- If F May 2026 checks out against another source, all core flags are genuine and the run can resume from export (below).
- If F is wrong, it's a McMerica constituent, so the data needs fixing first.

## Step 5 — McMerica series (status only; not exported)

- **Sources:** `refresh.py::recompute_mcmerica()` writes the DB; `scripts/export_data.py::synthesize_mcmerica()` writes prices.json and the DB. The algorithm is identical: equal weight, chain-linked over dates common to all constituents, base 100.
- **Recompute:** `recompute_mcmerica()` ran at the end of run 2: 184 rows, 2011-05-01..2026-08-01, from 25 constituents.
- **Dates:** the date set exactly equals the constituents' common dates, with no gaps (same check as Step 4).

| McMerica March 2026 return | Value |
|---|---|
| Baseline (live today) | **−4.68%** |
| Run 1 (windowed refresh, discarded; DD split seam) | **+2.01%** |
| Run 2 (full re-download) | **−4.60%** |

The small baseline→run 2 difference comes from the updated dividend-adjustment basis. April 2026 goes from +4.07% (partial month) to +5.23% (full month).

## Steps 6–8 — NOT run

Stopped at the continuity gate: no export, no tests/build on new data, no "as of" check, no data commit, no `backend-deploy` merge or push.

**To resume, if you accept the core flags:**
1. Leave `data/prices.db` as-is. If it was reset, copy `A7_prices_run2.db` back over it.
2. Run `scripts/export_data.py`.
3. Run the prices.json checks: max 2026-08-01, 44 tickers, VOO month-list match, size ~640 KB.
4. In frontend/: `npm run test`, then `npm run build`. The "as of" check should read **Aug 2026**.
5. Commit "data: full re-download through 2026-08", push main, and fast-forward `backend-deploy`.

## Other things that looked off (run 2)

- **DHR Jul 2016 adjusted_close artifact.**
  - Adjusted +65.4% against close +6.4%; the baseline had +6.5%.
  - Yahoo's re-download applies a spin-off factor (Fortive, July 2016) that scales pre-July adjusted prices down by ~35%.
  - DHR is active and searchable, so a custom index containing it would show a fake +65% month.
  - Non-core, so it didn't stop the run. It needs a human look: mark it inactive, patch the factor, or accept it.
- **Re-based `close` vs baseline (Feb 2026):**
  - APH ×0.5, CRWD ×0.25, CVNA ×0.2, DD ×3.0, KLAC ×0.1, MNST ×0.5: splits.
  - FDX ×0.806, SPGI ×0.946: spin-offs.
  - **HON ×1.049:** unexplained upward re-basing.
  - Because each ticker's history was replaced whole, these are consistent across history with no seam.
- **Dividend basis:** DVN 2016-03, OKE 2020-04 and VLO 2020-11 crossed 40% only because their adjusted returns grew a few points (39.4→40.9%, 37.2→41.8%, 39.3→41.8%). Genuine.
- **Unverifiable moves:** many 2026-04/05 moves beyond ±40% (semis/software/AI, e.g. DELL +101%, MU +88%, DDOG +87%) and MRNA 2026-08 +156% are after my knowledge cutoff. They're consistent across many names in the same months, but I couldn't verify them.

## Note: refresh.py's windowed design is unsafe for adjusted prices

`backend/refresh.py` fetches a fixed 90-day window and upserts over existing rows. Yahoo's `Adj Close` (and, for splits, `Close`) is **re-based to the current date** on every fetch. Any split, spin-off or dividend since the last full download therefore puts older stored rows and newly fetched rows on different bases.
- Run 1 showed fake seams of −90% (KLAC), −81% (CVNA), −74% (CRWD) and +173% (DD). DD alone added about 6.9 points to McMerica's March return.
- Dividends alone create 1–2% false dips in bond-fund total returns (BND −1.4%).
- The fixed lookback also silently skips months when a refresh is missed, which is how April → September became a 5-month gap.

**Recommendation:** replace refresh.py with the full-download approach from `audit/A7_backfill.py`: validated per-ticker replace in one transaction, retry, inactive marking, and complete months only. refresh.py was not modified in this run.

---

# RUN 1 — windowed backfill (superseded; kept for the record)

Run: 2026-09-14, 00:05–00:30 local.

## TL;DR (run 1)

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

## Current state / how to resume (run 1, SUPERSEDED — see Run 2 at the top)

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

---

# Appendix — single-month adjusted_close moves beyond ±40% (run 2 DB, all tickers)

263 moves. "Live" = the same move was already beyond ±40% in the currently deployed baseline data. Reads are mine: dated market events I'm confident about are marked Genuine; anything after my knowledge cutoff (May 2026) is marked unverified.

| Ticker | Month | adj | close | Live? | Read |
|---|---|---|---|---|---|
| AAL **[CORE]** | 2012-01 | +66.5% | +66.5% | yes | CORE. Pre-2013 history is US Airways (LCC); AMR-merger speculation rally. Genuine. |
| AIG | 2020-03 | -41.8% | -42.5% | yes | COVID crash. Genuine. |
| AKAM | 2026-05 | +45.2% | +45.2% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| ALB | 2020-11 | +45.9% | +45.9% | yes | Vaccine/election rally. Genuine. |
| ALGN | 2011-10 | +51.8% | +51.8% | yes | Oct 2011 market rebound month (S&P ~+11%). Genuine-looking. |
| ALGN | 2018-10 | -43.5% | -43.5% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| AMAT | 2026-06 | +60.6% | +60.6% | no (new) | After my knowledge cutoff; not verified (adj and close agree). |
| AMD | 2013-05 | +41.8% | +41.8% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| AMD | 2018-10 | -41.0% | -41.0% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| AMD | 2020-07 | +47.2% | +47.2% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| AMD | 2025-10 | +58.3% | +58.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| AMD | 2026-04 | +74.3% | +74.3% | no (was +21.3%) | One of many large moves in Apr–May 2026 (semis, software, hardware). Baseline April was partial. Not verified. |
| AMD | 2026-05 | +45.6% | +45.6% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| ANET | 2026-04 | +40.7% | +40.7% | no (was +23.8%) | One of many large moves in Apr–May 2026 (semis, software, hardware). Baseline April was partial. Not verified. |
| APA | 2020-03 | -83.2% | -83.2% | yes | COVID crash. Genuine. |
| APA | 2020-04 | +213.8% | +212.9% | yes | Oil rebound after negative-WTI crash. Genuine. |
| APA | 2020-11 | +55.3% | +55.3% | yes | Vaccine/election rally. Genuine. |
| APP | 2023-05 | +47.1% | +47.1% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| APP | 2024-02 | +45.2% | +45.2% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| APP | 2024-09 | +40.6% | +40.6% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| APP | 2024-11 | +98.8% | +98.8% | yes | AI adtech earnings rally. Genuine. |
| APP | 2025-05 | +45.9% | +45.9% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| APP | 2025-09 | +50.1% | +50.1% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| APTV | 2020-04 | +41.2% | +41.2% | yes | COVID rebound. Genuine. |
| AVGO | 2024-12 | +43.4% | +43.0% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| AXON | 2018-05 | +51.7% | +51.7% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| AXON | 2019-11 | +44.3% | +44.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| AXON | 2024-11 | +52.8% | +52.8% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| BA | 2020-03 | -45.8% | -45.8% | yes | COVID crash. Genuine. |
| BA | 2020-11 | +45.9% | +45.9% | yes | Vaccine/election rally. Genuine. |
| BBY | 2014-01 | -41.0% | -41.0% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| BLDR | 2015-04 | +91.3% | +91.3% | yes | ProBuild acquisition announcement. Genuine. |
| BLDR | 2016-03 | +42.1% | +42.1% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| BLDR | 2020-03 | -46.1% | -46.1% | yes | COVID crash. Genuine. |
| BLDR | 2020-04 | +50.0% | +50.0% | yes | COVID rebound. Genuine. |
| CCL | 2020-03 | -60.6% | -60.6% | yes | COVID crash. Genuine. |
| CCL | 2020-11 | +45.7% | +45.7% | yes | Vaccine/election rally. Genuine. |
| CCL | 2021-02 | +43.3% | +43.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CCL | 2023-06 | +67.7% | +67.7% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CFG | 2020-03 | -40.6% | -40.6% | yes | COVID crash. Genuine. |
| CIEN | 2025-09 | +55.0% | +55.0% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| CNC | 2025-07 | -52.0% | -52.0% | yes | Guidance withdrawal crash. Genuine. |
| CNC | 2026-04 | +64.0% | +64.0% | no (was +14.4%) | Managed-care rebound after 2025 crash (not tech). Baseline April was partial. Not verified. |
| COF | 2020-03 | -42.9% | -42.9% | yes | COVID crash. Genuine. |
| COHR | 2020-11 | +48.8% | +48.8% | yes | Vaccine/election rally. Genuine. |
| COIN | 2021-10 | +40.4% | +40.4% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| COIN | 2022-04 | -40.6% | -40.6% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| COIN | 2023-01 | +65.2% | +65.2% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| COIN | 2023-11 | +61.7% | +61.7% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| COIN | 2024-02 | +58.8% | +58.8% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| COIN | 2024-11 | +65.2% | +65.2% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| COIN | 2025-06 | +42.1% | +42.1% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CRWD | 2026-05 | +64.0% | +64.0% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| CTSH | 2026-07 | +42.9% | +42.9% | no (new) | After my knowledge cutoff; not verified (adj and close agree). |
| CVNA | 2017-06 | +103.7% | +103.7% | yes | Early post-IPO volatility (IPO Apr 2017). Plausible. |
| CVNA | 2018-06 | +44.2% | +44.2% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CVNA | 2018-08 | +50.6% | +50.6% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CVNA | 2020-04 | +45.4% | +45.4% | yes | COVID rebound. Genuine. |
| CVNA | 2022-04 | -51.4% | -51.4% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CVNA | 2022-05 | -49.2% | -49.2% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CVNA | 2022-11 | -43.0% | -43.0% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CVNA | 2023-01 | +114.6% | +114.6% | yes | Short squeeze off near-bankruptcy lows. Genuine. |
| CVNA | 2023-05 | +86.2% | +86.2% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CVNA | 2023-06 | +100.6% | +100.6% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CVNA | 2023-07 | +77.3% | +77.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CVNA | 2023-12 | +69.0% | +69.0% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CVNA | 2024-02 | +76.3% | +76.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| CVNA | 2024-10 | +42.0% | +42.0% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| DDOG | 2020-05 | +58.0% | +58.0% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| DDOG | 2023-05 | +40.9% | +40.9% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| DDOG | 2023-11 | +43.1% | +43.1% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| DDOG | 2026-05 | +87.1% | +87.1% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| DELL | 2026-05 | +101.4% | +101.4% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| DHR | 2016-07 | +65.4% | +6.4% | no (was +6.5%) | **Adjustment artifact**: adj +65% vs close +6% (baseline +6.5%); Fortive spin-off factor. Needs fix. |
| DRI | 2020-03 | -44.1% | -44.1% | yes | COVID crash. Genuine. |
| DVA | 2026-02 | +42.9% | +42.9% | yes | 2026 move; not verified individually (adj and close agree). |
| DVN | 2016-03 | +40.9% | +39.4% | no (was +39.4%) | Oil rebound; crossed 40% only via updated dividend factor (was 39.4%). Genuine. |
| DVN | 2020-03 | -57.0% | -57.5% | yes | COVID crash. Genuine. |
| DVN | 2020-04 | +80.5% | +80.5% | yes | COVID rebound. Genuine. |
| DVN | 2020-11 | +56.7% | +56.7% | yes | Vaccine/election rally. Genuine. |
| DXCM | 2018-08 | +51.8% | +51.8% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| DXCM | 2019-11 | +47.4% | +47.4% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| DXCM | 2022-10 | +50.0% | +50.0% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| DXCM | 2024-07 | -40.2% | -40.2% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| EOG | 2020-03 | -43.2% | -43.2% | yes | COVID crash. Genuine. |
| EPAM | 2012-03 | +45.2% | +45.2% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| EPAM | 2022-02 | -56.4% | -56.4% | yes | Russia/Ukraine invasion (Eastern-Europe delivery base). Genuine. |
| EPAM | 2022-03 | +42.8% | +42.8% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| EQT | 2020-01 | -44.5% | -44.5% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| EQT | 2020-04 | +106.4% | +106.4% | yes | COVID rebound. Genuine. |
| EQT | 2022-03 | +48.7% | +48.7% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| EXPE | 2020-03 | -42.7% | -42.9% | yes | COVID crash. Genuine. |
| EXPE | 2023-11 | +42.9% | +42.9% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| F **[CORE]** | 2026-05 | +46.2% | +44.4% | no (new) | CORE. **Suspicious**: $12.08→$17.44→$13.90, peers +8–14%. Verify against another source. |
| FANG | 2020-03 | -57.5% | -57.7% | yes | COVID crash. Genuine. |
| FANG | 2020-04 | +66.2% | +66.2% | yes | COVID rebound. Genuine. |
| FANG | 2020-11 | +55.7% | +53.9% | yes | Vaccine/election rally. Genuine. |
| FCX **[CORE]** | 2016-02 | +65.9% | +65.9% | yes | CORE. Commodity-bottom rebound ($4.60→$7.63). Genuine. |
| FFIV | 2011-10 | +46.3% | +46.3% | yes | Oct 2011 market rebound month (S&P ~+11%). Genuine-looking. |
| FISV | 2025-10 | -48.3% | -48.3% | yes | Guidance-cut crash. Genuine. |
| FIX | 2024-02 | +40.6% | +40.6% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| FSLR | 2013-04 | +72.7% | +72.7% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| FSLR | 2015-02 | +41.2% | +41.2% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| FSLR | 2022-07 | +45.6% | +45.6% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| FSLR | 2024-05 | +54.1% | +54.1% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| FSLR | 2026-05 | +52.0% | +52.0% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| FTNT | 2026-05 | +63.6% | +63.6% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| GLW | 2026-02 | +45.9% | +45.6% | yes | 2026 move; not verified individually (adj and close agree). |
| GLW | 2026-06 | +41.0% | +41.0% | no (new) | Followed by −46% in July: spike-and-revert. Post-cutoff; verify. |
| GLW | 2026-07 | -45.9% | -45.9% | no (new) | Reversal of June spike. Post-cutoff; verify. |
| GNRC | 2012-10 | +48.5% | +48.5% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| HAL | 2020-03 | -59.2% | -59.6% | yes | COVID crash. Genuine. |
| HAL | 2020-04 | +53.3% | +53.3% | yes | COVID rebound. Genuine. |
| HAL | 2022-10 | +47.9% | +47.9% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| HOOD | 2023-12 | +44.8% | +44.8% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| HOOD | 2024-02 | +51.9% | +51.9% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| HOOD | 2024-11 | +59.8% | +59.8% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| HOOD | 2025-06 | +41.5% | +41.5% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| HPE | 2026-05 | +49.6% | +49.6% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| HWM | 2020-03 | -45.3% | -45.3% | yes | COVID crash. Genuine. |
| INCY | 2013-08 | +44.8% | +44.8% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| INTC | 2026-04 | +114.1% | +114.1% | yes | One of many large moves in Apr–May 2026 (semis, software, hardware). Baseline April was partial. Not verified. |
| KEYS | 2026-02 | +42.1% | +42.1% | yes | 2026 move; not verified individually (adj and close agree). |
| KIM | 2020-03 | -44.3% | -44.3% | yes | COVID crash. Genuine. |
| KIM | 2020-11 | +40.7% | +40.7% | yes | Vaccine/election rally. Genuine. |
| KLAC | 2026-06 | +57.0% | +57.0% | no (new) | After my knowledge cutoff; not verified (adj and close agree). |
| LITE | 2025-11 | +61.3% | +61.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| LITE | 2026-02 | +78.9% | +78.9% | yes | 2026 move; not verified individually (adj and close agree). |
| LYB | 2026-03 | +41.8% | +40.1% | yes | 2026 move; not verified individually (adj and close agree). |
| MCHP | 2026-04 | +43.8% | +43.8% | no (was +13.8%) | One of many large moves in Apr–May 2026 (semis, software, hardware). Baseline April was partial. Not verified. |
| META | 2013-07 | +47.9% | +47.9% | yes | Mobile-ads earnings beat. Genuine. |
| MGM | 2020-03 | -51.6% | -52.0% | yes | COVID crash. Genuine. |
| MGM | 2020-04 | +42.6% | +42.6% | yes | COVID rebound. Genuine. |
| MPC | 2020-03 | -50.2% | -50.2% | yes | COVID crash. Genuine. |
| MPWR | 2026-04 | +47.7% | +47.7% | no (was +25.8%) | One of many large moves in Apr–May 2026 (semis, software, hardware). Baseline April was partial. Not verified. |
| MRNA | 2020-04 | +53.6% | +53.6% | yes | COVID rebound. Genuine. |
| MRNA | 2020-11 | +126.4% | +126.4% | yes | Vaccine/election rally. Genuine. |
| MRNA | 2021-01 | +65.8% | +65.8% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| MRNA | 2021-07 | +50.5% | +50.5% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| MRNA | 2026-01 | +49.4% | +49.4% | yes | 2026 move; not verified individually (adj and close agree). |
| MRNA | 2026-06 | +48.4% | +48.4% | no (new) | After my knowledge cutoff; not verified (adj and close agree). |
| MRNA | 2026-08 | +156.0% | +156.0% | no (new) | Very large; post-cutoff, unverified. Worth a news check. |
| MU | 2025-09 | +40.6% | +40.6% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| MU | 2026-01 | +45.4% | +45.4% | yes | 2026 move; not verified individually (adj and close agree). |
| MU | 2026-04 | +53.1% | +53.1% | no (was +26.3%) | One of many large moves in Apr–May 2026 (semis, software, hardware). Baseline April was partial. Not verified. |
| MU | 2026-05 | +87.8% | +87.8% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| NCLH | 2020-03 | -70.6% | -70.6% | yes | COVID crash. Genuine. |
| NCLH | 2020-04 | +49.6% | +49.6% | yes | COVID rebound. Genuine. |
| NCLH | 2022-10 | +48.7% | +48.7% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| NCLH | 2023-06 | +46.6% | +46.6% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| NFLX | 2011-09 | -51.8% | -51.8% | yes | Qwikster/price-hike collapse. Genuine. |
| NFLX | 2012-01 | +73.5% | +73.5% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| NFLX | 2012-10 | +45.6% | +45.6% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| NFLX | 2013-01 | +78.5% | +78.5% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| NFLX | 2018-01 | +40.8% | +40.8% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| NFLX | 2022-04 | -49.2% | -49.2% | yes | Subscriber-loss crash. Genuine. |
| NOW | 2026-05 | +40.8% | +40.8% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| NRG | 2017-07 | +43.1% | +43.0% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| NRG | 2025-05 | +42.8% | +42.3% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| NTAP | 2026-05 | +57.3% | +57.3% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| NXPI | 2026-04 | +49.1% | +49.1% | no (was +6.2%) | One of many large moves in Apr–May 2026 (semis, software, hardware). Baseline April was partial. Not verified. |
| OKE | 2020-03 | -67.3% | -67.3% | yes | COVID crash. Genuine. |
| OKE | 2020-04 | +41.8% | +37.2% | no (was +37.2%) | Oil rebound; crossed 40% via updated dividend factor (was 37.2%). Genuine. |
| ON | 2026-04 | +62.8% | +62.8% | no (was +14.7%) | One of many large moves in Apr–May 2026 (semis, software, hardware). Baseline April was partial. Not verified. |
| OXY | 2020-03 | -63.6% | -64.6% | yes | COVID crash. Genuine. |
| OXY | 2020-04 | +43.4% | +43.4% | yes | COVID rebound. Genuine. |
| OXY | 2020-06 | +41.4% | +41.3% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| OXY | 2020-11 | +72.6% | +72.6% | yes | Vaccine/election rally. Genuine. |
| PANW | 2026-05 | +57.1% | +57.1% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| PCG | 2018-11 | -43.6% | -43.6% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| PCG | 2019-01 | -45.3% | -45.3% | yes | Wildfire-liability bankruptcy filing. Genuine. |
| PCG | 2019-08 | -42.4% | -42.4% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| PCG | 2019-12 | +45.7% | +45.7% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| PCG | 2020-03 | -42.0% | -42.0% | yes | COVID crash. Genuine. |
| PHM | 2020-03 | -44.3% | -44.5% | yes | COVID crash. Genuine. |
| PLTR | 2020-11 | +167.6% | +167.6% | yes | Post-direct-listing election/vaccine rally. Genuine. |
| PLTR | 2021-01 | +49.4% | +49.4% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| PLTR | 2023-05 | +89.8% | +89.8% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| PLTR | 2024-02 | +55.9% | +55.9% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| PLTR | 2024-11 | +61.4% | +61.4% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| PLTR | 2025-04 | +40.3% | +40.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| PLTR | 2026-08 | +51.5% | +51.5% | no (new) | After my knowledge cutoff; not verified (adj and close agree). |
| PODD | 2023-11 | +42.6% | +42.6% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| PSKY | 2020-03 | -42.2% | -43.1% | yes | COVID crash. Genuine. |
| QCOM | 2019-04 | +51.0% | +51.0% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| RCL | 2020-03 | -59.6% | -60.0% | yes | COVID crash. Genuine. |
| RCL | 2020-04 | +45.4% | +45.4% | yes | COVID rebound. Genuine. |
| RCL | 2020-08 | +41.3% | +41.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| RCL | 2021-02 | +43.5% | +43.5% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| RCL | 2022-10 | +40.8% | +40.8% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| REGN | 2012-01 | +63.9% | +63.9% | yes | Early Eylea-launch era rally. Not verified individually; adj and close agree. |
| SATS [inactive] | 2023-12 | +58.3% | +58.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| SATS [inactive] | 2025-06 | +56.2% | +56.2% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| SATS [inactive] | 2025-08 | +89.6% | +89.6% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| SATS [inactive] | 2025-12 | +48.3% | +48.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| SLB | 2020-03 | -50.2% | -50.2% | yes | COVID crash. Genuine. |
| SLB | 2022-10 | +44.9% | +44.9% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| SMCI | 2023-05 | +112.4% | +112.4% | yes | AI server rally. Genuine. |
| SMCI | 2024-01 | +86.3% | +86.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| SMCI | 2024-02 | +63.5% | +63.5% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| SMCI | 2025-02 | +45.4% | +45.4% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| SMCI | 2026-05 | +68.2% | +68.2% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| SNDK | 2025-09 | +113.8% | +113.8% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| SNDK | 2025-10 | +77.7% | +77.7% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| SNDK | 2026-01 | +142.8% | +142.8% | yes | Memory/storage rally (WDC/STX/MU same month). Genuine-looking. |
| SNDK | 2026-04 | +72.6% | +72.6% | yes | One of many large moves in Apr–May 2026 (semis, software, hardware). Baseline April was partial. Not verified. |
| SNDK | 2026-05 | +54.6% | +54.6% | no (new) | One of many large moves in Apr–May 2026 (semis, software, hardware). Not verified. |
| SNDK | 2026-07 | -46.6% | -46.6% | no (new) | Pullback after very large run. Post-cutoff; unverified. |
| SPG | 2020-03 | -55.4% | -55.4% | yes | COVID crash. Genuine. |
| STX | 2011-10 | +57.1% | +57.1% | yes | Oct 2011 market rebound month (S&P ~+11%). Genuine-looking. |
| STX | 2025-09 | +41.5% | +41.0% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| STX | 2026-01 | +48.0% | +48.0% | yes | 2026 move; not verified individually (adj and close agree). |
| STX | 2026-04 | +72.0% | +72.0% | no (was +31.2%) | One of many large moves in Apr–May 2026 (semis, software, hardware). Baseline April was partial. Not verified. |
| STZ | 2012-06 | +40.3% | +40.3% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| SYF | 2020-03 | -44.7% | -44.7% | yes | COVID crash. Genuine. |
| TDG | 2020-03 | -42.6% | -42.6% | yes | COVID crash. Genuine. |
| TKO | 2014-01 | +45.9% | +45.9% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TKO | 2014-05 | -42.2% | -42.2% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TKO | 2018-05 | +45.5% | +45.5% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TMUS | 2012-07 | +44.8% | +44.8% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| TPL | 2020-03 | -44.0% | -45.4% | yes | COVID crash. Genuine. |
| TPL | 2020-04 | +49.9% | +49.9% | yes | COVID rebound. Genuine. |
| TPL | 2021-03 | +44.3% | +44.0% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| TPL | 2026-02 | +50.5% | +50.5% | yes | 2026 move; not verified individually (adj and close agree). |
| TPR | 2020-03 | -44.0% | -44.8% | yes | COVID crash. Genuine. |
| TPR | 2020-10 | +42.2% | +42.2% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| TRGP | 2020-03 | -78.7% | -78.7% | yes | COVID crash. Genuine. |
| TRGP | 2020-04 | +89.1% | +87.6% | yes | Midstream rebound after COVID/oil crash. Genuine. |
| TRGP | 2020-11 | +46.4% | +46.4% | yes | Vaccine/election rally. Genuine. |
| TSLA | 2013-04 | +42.5% | +42.5% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TSLA | 2013-05 | +81.1% | +81.1% | yes | First profitable quarter rally. Genuine. |
| TSLA | 2020-01 | +55.5% | +55.5% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TSLA | 2020-04 | +49.2% | +49.2% | yes | COVID rebound. Genuine. |
| TSLA | 2020-08 | +74.1% | +74.1% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TSLA | 2020-11 | +46.3% | +46.3% | yes | Vaccine/election rally. Genuine. |
| TSLA | 2021-10 | +43.7% | +43.7% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TSLA | 2023-01 | +40.6% | +40.6% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TTD | 2017-02 | +42.3% | +42.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TTD | 2017-05 | +47.3% | +47.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TTD | 2018-05 | +67.1% | +67.1% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TTD | 2018-08 | +68.3% | +68.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TTD | 2020-04 | +51.6% | +51.6% | yes | COVID rebound. Genuine. |
| TTD | 2020-11 | +59.1% | +59.1% | yes | Vaccine/election rally. Genuine. |
| TTD | 2025-02 | -40.7% | -40.7% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TTD | 2025-05 | +40.3% | +40.3% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| TXN | 2026-04 | +44.8% | +44.8% | no (was +11.6%) | One of many large moves in Apr–May 2026 (semis, software, hardware). Baseline April was partial. Not verified. |
| UAL | 2020-03 | -48.8% | -48.8% | yes | COVID crash. Genuine. |
| UBER | 2020-11 | +48.6% | +48.6% | yes | Vaccine/election rally. Genuine. |
| VLO | 2020-11 | +41.8% | +39.3% | no (was +39.3%) | Vaccine rally; crossed 40% via updated dividend factor (was 39.3%). Genuine. |
| VRT | 2022-10 | +47.2% | +47.2% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| VRT | 2023-08 | +51.4% | +51.4% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| VRTX | 2012-05 | +56.0% | +56.0% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| VTR | 2020-03 | -48.7% | -50.2% | yes | COVID crash. Genuine. |
| WBD | 2023-01 | +56.3% | +56.3% | yes | Not verified individually; already in live data; adj and close agree, so not an adjustment artifact. |
| WBD | 2025-09 | +67.8% | +67.8% | yes | Takeover interest. Genuine-looking. |
| WDC **[CORE]** | 2025-09 | +49.6% | +49.4% | yes | CORE. Start of AI storage rally. Genuine-looking. |
| WDC **[CORE]** | 2026-01 | +45.3% | +45.3% | yes | CORE. Storage rally; SNDK/STX/MU also +45%+ that month. Genuine-looking. |
| WDC **[CORE]** | 2026-04 | +60.6% | +60.6% | no (was +29.5%) | CORE. Baseline +29.5% was partial April; full month, STX/MU same. Genuine-looking. |
| WSM | 2020-04 | +46.8% | +45.4% | yes | COVID rebound. Genuine. |
| WYNN | 2020-03 | -44.3% | -44.3% | yes | COVID crash. Genuine. |
| WYNN | 2020-04 | +42.1% | +42.1% | yes | COVID rebound. Genuine. |
| XYZ | 2016-03 | +46.4% | +46.4% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
| XYZ | 2023-11 | +57.6% | +57.6% | yes | High-volatility name; already in live data; not verified individually (adj and close agree). |
