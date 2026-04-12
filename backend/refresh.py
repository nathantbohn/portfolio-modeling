"""
Monthly refresh: appends the latest month's data for ALL tickers in the database.

Usage:
    python refresh.py

Safe to run multiple times — uses INSERT OR REPLACE so re-running never duplicates rows.
"""

import sys
import time
from datetime import date, timedelta

import pandas as pd
import yfinance as yf

sys.path.insert(0, __file__.rsplit("/", 1)[0] if "/" in __file__ else ".")

from db import init_db, upsert_prices, get_all_tickers


def refresh_ticker(ticker: str, start: str, end: str) -> list[dict]:
    t = yf.Ticker(ticker)
    df = t.history(
        start=start,
        end=end,
        interval="1mo",
        auto_adjust=False,
        actions=False,
    )
    if df.empty:
        return []

    df.index = pd.to_datetime(df.index).tz_localize(None)
    adj_col = "Adj Close" if "Adj Close" in df.columns else "Close"

    rows = []
    for dt, row in df.iterrows():
        if pd.isna(row["Close"]):
            continue
        rows.append(
            {
                "ticker": ticker,
                "date": dt.strftime("%Y-%m-%d"),
                "adjusted_close": float(row[adj_col]),
                "close": float(row["Close"]),
            }
        )
    return rows


def refresh() -> None:
    init_db()

    tickers = get_all_tickers()
    end_date = date.today()
    start_date = end_date - timedelta(days=90)
    start_str = str(start_date)
    end_str = str(end_date + timedelta(days=1))

    print(f"Refreshing {len(tickers)} tickers from {start_str} to {end_str} ...")

    total_rows: list[dict] = []
    errors = 0

    for i, ticker in enumerate(tickers):
        try:
            rows = refresh_ticker(ticker, start_str, end_str)
            print(f"  [{i+1}/{len(tickers)}] {ticker}: {len(rows)} rows")
            total_rows.extend(rows)
        except Exception as exc:
            print(f"  [{i+1}/{len(tickers)}] ERROR {ticker}: {exc}")
            errors += 1
        if i < len(tickers) - 1:
            time.sleep(0.5)

    if total_rows:
        upsert_prices(total_rows)
        print(f"\nUpserted {len(total_rows)} rows into prices.db ({errors} errors)")
    else:
        print("No rows fetched — check errors above.")


if __name__ == "__main__":
    refresh()
