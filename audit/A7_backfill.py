"""
A7 one-off backfill: refresh.py's fixed 90-day lookback cannot reach back to the
last stored month (2026-04-01), so this runs the same fetch/upsert over a fixed
window of 2026-03-01 through today for every ticker in the database.

Reuses refresh.py / db.py functions directly; only the window differs.
MCMERICA-25 is synthetic (not a Yahoo ticker), so it is skipped for download and
recomputed from constituents afterwards via refresh.recompute_mcmerica().

Usage (from repo root):
    backend/.venv/Scripts/python.exe -u audit/A7_backfill.py
"""

import os
import sys
import time
from datetime import date, datetime, timedelta

BACKEND = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND)

from db import init_db, upsert_prices, get_all_tickers  # noqa: E402
from refresh import refresh_ticker, recompute_mcmerica  # noqa: E402

START = "2026-03-01"
SYNTHETIC = {"MCMERICA-25"}


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def main() -> None:
    print(f"[{ts()}] A7_backfill pid={os.getpid()}")
    init_db()

    tickers = [t for t in get_all_tickers() if t not in SYNTHETIC]
    end_str = str(date.today() + timedelta(days=1))
    print(f"[{ts()}] Backfilling {len(tickers)} tickers from {START} to {end_str} (skipped synthetic: {sorted(SYNTHETIC)})")

    total_rows: list[dict] = []
    failed: dict[str, str] = {}

    for i, ticker in enumerate(tickers):
        try:
            rows = refresh_ticker(ticker, START, end_str)
            print(f"  [{ts()}] [{i+1}/{len(tickers)}] {ticker}: {len(rows)} rows {[r['date'] for r in rows]}")
            if rows:
                total_rows.extend(rows)
            else:
                failed[ticker] = "empty result (0 rows)"
        except Exception as exc:
            print(f"  [{ts()}] [{i+1}/{len(tickers)}] ERROR {ticker}: {exc}")
            failed[ticker] = f"{type(exc).__name__}: {exc}"
        if i < len(tickers) - 1:
            time.sleep(0.5)

    print(f"\n[{ts()}] SUMMARY attempted={len(tickers)} succeeded={len(tickers) - len(failed)} failed={len(failed)}")
    for t, err in failed.items():
        print(f"  FAILED {t}: {err}")

    if total_rows:
        upsert_prices(total_rows)
        print(f"[{ts()}] Upserted {len(total_rows)} rows into prices.db")
    else:
        print(f"[{ts()}] No rows fetched — nothing upserted.")

    recompute_mcmerica()
    print(f"[{ts()}] A7_backfill done")


if __name__ == "__main__":
    main()
