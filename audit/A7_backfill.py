"""
A7 full-history re-download (run 2).

Run 1 fetched only a 2026-03..today window and showed that Yahoo re-bases
split/dividend-adjusted prices, so overwriting a window on top of older rows
creates fake jumps at the seam. This run replaces each ticker's rows entirely.

Per ticker:
  - fetch monthly history from START through today via refresh.refresh_ticker
  - validate: non-empty, day-01 dates, unique, contiguous months, reaches
    LAST_COMPLETE, and history does not start later than before
  - if valid: DELETE + INSERT that ticker's rows in one transaction, so a failure
    leaves either the old rows or the new rows, never a mix
  - if invalid/empty/error: keep old rows, retry once at the end

Then:
  - delete every row dated PARTIAL_MONTH (only complete months ship)
  - mark tickers inactive in metadata when their month list, from their own first
    date to LAST_COMPLETE, does not match VOO's over the same span
  - recompute MCMERICA-25 from constituents via refresh.recompute_mcmerica()

START is the DB's established history start (the original 15-year download
window), not Yahoo's max period, so every ticker's span stays within VOO's.

Usage (from repo root):
    backend/.venv/Scripts/python.exe -u audit/A7_backfill.py
"""

import os
import sys
import time
from datetime import date, datetime, timedelta

BACKEND = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND)

from db import get_all_tickers, get_connection, init_db  # noqa: E402
from refresh import MCMERICA_25, recompute_mcmerica, refresh_ticker  # noqa: E402

START = "2011-05-01"
PARTIAL_MONTH = "2026-09-01"
LAST_COMPLETE = "2026-08-01"
REFERENCE = "VOO"
SYNTHETIC = {"MCMERICA-25"}
CORE = {
    "VOO", "BND", "VXUS", "SCHD", "SCHF", "SCHI", "VTI", "QQQ", "BNDX", "VBR", "GLD", "DBC",
    "FXAIX", "FSKAX", "FTIHX", "FXNAX", "FBGRX", "DIA", *MCMERICA_25,
}


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def months_between(first: str, last: str) -> list[str]:
    y, m = int(first[:4]), int(first[5:7])
    out = []
    while f"{y:04d}-{m:02d}-01" <= last:
        out.append(f"{y:04d}-{m:02d}-01")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def validate(rows: list[dict], old_first: str | None) -> str | None:
    if not rows:
        return "empty result (0 rows)"
    dates = [r["date"] for r in rows]
    bad = [d for d in dates if not d.endswith("-01")]
    if bad:
        return f"non-boundary dates {bad[:3]}"
    if len(set(dates)) != len(dates) or dates != sorted(dates):
        return "duplicate or unsorted dates"
    if dates[-1] < LAST_COMPLETE:
        return f"ends at {dates[-1]}, before {LAST_COMPLETE}"
    expected = months_between(dates[0], dates[-1])
    if dates != expected:
        missing = sorted(set(expected) - set(dates))
        return f"missing months {missing[:6]}{'...' if len(missing) > 6 else ''}"
    if old_first and dates[0] > old_first:
        return f"history starts {dates[0]}, later than stored {old_first}"
    return None


def replace_ticker(ticker: str, rows: list[dict]) -> None:
    conn = get_connection()
    try:
        with conn:  # one transaction: commit on success, rollback on any exception
            conn.execute("DELETE FROM prices WHERE ticker = ?", (ticker,))
            conn.executemany(
                "INSERT INTO prices (ticker, date, adjusted_close, close) "
                "VALUES (:ticker, :date, :adjusted_close, :close)",
                rows,
            )
    finally:
        conn.close()


def attempt(ticker: str, end_str: str, old_first: str | None) -> tuple[bool, str]:
    try:
        rows = refresh_ticker(ticker, START, end_str)
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"
    reason = validate(rows, old_first)
    if reason:
        return False, f"{reason} (fetched {len(rows)} rows; old rows kept)"
    replace_ticker(ticker, rows)
    return True, f"{len(rows)} rows {rows[0]['date']}..{rows[-1]['date']}"


def main() -> None:
    print(f"[{ts()}] A7_backfill run2 pid={os.getpid()}")
    init_db()

    conn = get_connection()
    old = {t: (first, n) for t, first, n in conn.execute(
        "SELECT ticker, MIN(date), COUNT(*) FROM prices GROUP BY ticker")}
    conn.close()

    tickers = [t for t in get_all_tickers() if t not in SYNTHETIC]
    end_str = str(date.today() + timedelta(days=1))
    print(f"[{ts()}] Full re-download of {len(tickers)} tickers from {START} to {end_str} (skipped synthetic: {sorted(SYNTHETIC)})")

    failed: dict[str, str] = {}
    for i, ticker in enumerate(tickers):
        ok, msg = attempt(ticker, end_str, old.get(ticker, (None,))[0])
        print(f"  [{ts()}] [{i+1}/{len(tickers)}] {'OK' if ok else 'FAIL'} {ticker}: {msg}")
        if not ok:
            failed[ticker] = msg
        if i < len(tickers) - 1:
            time.sleep(0.5)

    print(f"\n[{ts()}] PASS1 attempted={len(tickers)} replaced={len(tickers) - len(failed)} failed={len(failed)}")

    still_failed: dict[str, str] = {}
    for ticker, first_msg in failed.items():
        time.sleep(0.5)
        ok, msg = attempt(ticker, end_str, old.get(ticker, (None,))[0])
        print(f"  [{ts()}] RETRY {'OK' if ok else 'FAIL'} {ticker}: {msg}  (pass1: {first_msg})")
        if not ok:
            still_failed[ticker] = msg
    print(f"[{ts()}] RETRY recovered={len(failed) - len(still_failed)} still_failed={len(still_failed)}")

    conn = get_connection()
    with conn:
        n_partial = conn.execute("DELETE FROM prices WHERE date = ?", (PARTIAL_MONTH,)).rowcount
    print(f"[{ts()}] Deleted {n_partial} rows dated {PARTIAL_MONTH} (partial month)")

    dates_by_ticker: dict[str, list[str]] = {}
    for t, d in conn.execute("SELECT ticker, date FROM prices ORDER BY ticker, date"):
        dates_by_ticker.setdefault(t, []).append(d)
    ref = [d for d in dates_by_ticker.get(REFERENCE, []) if d <= LAST_COMPLETE]

    inactive: dict[str, str] = {}
    for t in tickers:
        dates = [d for d in dates_by_ticker.get(t, []) if d <= LAST_COMPLETE]
        if not dates:
            inactive[t] = "no rows"
            continue
        if dates[0] < ref[0]:
            inactive[t] = f"starts {dates[0]}, before {REFERENCE} {ref[0]}"
            continue
        expected = [d for d in ref if d >= dates[0]]
        if dates != expected:
            missing = sorted(set(expected) - set(dates))
            extra = sorted(set(dates) - set(expected))
            inactive[t] = f"missing={missing[:6]}{'...' if len(missing) > 6 else ''} ({len(missing)}) extra={extra[:3]}"
        if t in still_failed:
            inactive[t] = f"download failed after retry: {still_failed[t]}; " + inactive.get(t, "")

    with conn:
        conn.execute("UPDATE metadata SET active = 1")
        conn.executemany("UPDATE metadata SET active = 0 WHERE ticker = ?", [(t,) for t in inactive])
    conn.close()

    print(f"[{ts()}] INACTIVE {len(inactive)}")
    for t, why in inactive.items():
        print(f"  INACTIVE {t}{' [CORE]' if t in CORE else ''}: {why}")

    core_bad = sorted(CORE & (set(inactive) | set(still_failed)))
    if core_bad:
        print(f"[{ts()}] CORE FAILURE {core_bad}: skipping McMerica recompute")
    else:
        recompute_mcmerica()
    print(f"[{ts()}] A7_backfill run2 done")


if __name__ == "__main__":
    main()
