"""
Download 15 years of monthly price data + metadata for S&P 500 stocks.
Skips tickers that already have price data in the database.

Usage:
    python download_stocks.py
"""

import json
import os
import sys
import time
from datetime import date, timedelta

import pandas as pd
import yfinance as yf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import init_db, upsert_prices, upsert_metadata, get_tickers_in_db

TICKERS_FILE = os.path.join(os.path.dirname(__file__), "data", "sp500_tickers.json")

END_DATE = date.today()
START_DATE = END_DATE.replace(year=END_DATE.year - 15)

SLEEP_BETWEEN = 1.0  # seconds between requests


def load_tickers() -> list[str]:
    with open(TICKERS_FILE) as f:
        return json.load(f)


def download_one(ticker: str, start: str, end: str) -> tuple[list[dict], dict | None]:
    """Download price data and metadata for a single ticker.
    Returns (price_rows, metadata_dict_or_None).
    """
    t = yf.Ticker(ticker)

    # Price data
    df = t.history(start=start, end=end, interval="1mo", auto_adjust=False, actions=False)
    price_rows: list[dict] = []
    if not df.empty:
        df.index = pd.to_datetime(df.index).tz_localize(None)
        adj_col = "Adj Close" if "Adj Close" in df.columns else "Close"
        for dt, row in df.iterrows():
            if pd.isna(row["Close"]):
                continue
            price_rows.append({
                "ticker": ticker,
                "date": dt.strftime("%Y-%m-%d"),
                "adjusted_close": float(row[adj_col]),
                "close": float(row["Close"]),
            })

    # Metadata
    info = t.info or {}
    name = info.get("shortName") or info.get("longName") or ticker
    sector = info.get("sector") or "Unknown"
    meta = {"ticker": ticker, "name": name, "sector": sector}

    return price_rows, meta


def main() -> None:
    init_db()
    tickers = load_tickers()
    existing = get_tickers_in_db()

    to_download = [t for t in tickers if t not in existing]
    print(f"S&P 500 tickers: {len(tickers)}")
    print(f"Already in DB: {len(existing & set(tickers))}")
    print(f"To download: {len(to_download)}")

    if not to_download:
        print("Nothing to download.")
        return

    start_str = str(START_DATE)
    end_str = str(END_DATE + timedelta(days=1))

    successes = 0
    failures: list[str] = []
    total_rows = 0
    all_meta: list[dict] = []

    for i, ticker in enumerate(to_download):
        pct = f"[{i + 1}/{len(to_download)}]"
        try:
            rows, meta = download_one(ticker, start_str, end_str)
            if rows:
                upsert_prices(rows)
                total_rows += len(rows)
            if meta:
                all_meta.append(meta)
            print(f"  {pct} {ticker}: {len(rows)} rows")
            successes += 1
        except Exception as exc:
            print(f"  {pct} ERROR {ticker}: {exc}")
            failures.append(ticker)

        if i < len(to_download) - 1:
            time.sleep(SLEEP_BETWEEN)

    # Also fetch metadata for tickers already in DB but not in metadata table
    print("\nFetching metadata for existing tickers...")
    for ticker in sorted(existing):
        if any(m["ticker"] == ticker for m in all_meta):
            continue
        try:
            info = yf.Ticker(ticker).info or {}
            all_meta.append({
                "ticker": ticker,
                "name": info.get("shortName") or info.get("longName") or ticker,
                "sector": info.get("sector") or "ETF",
            })
            time.sleep(0.5)
        except Exception:
            all_meta.append({"ticker": ticker, "name": ticker, "sector": "ETF"})

    if all_meta:
        upsert_metadata(all_meta)
        print(f"Upserted {len(all_meta)} metadata rows")

    print(f"\nDone. {successes} succeeded, {len(failures)} failed, {total_rows} price rows inserted.")
    if failures:
        print(f"Failed tickers: {', '.join(failures)}")


if __name__ == "__main__":
    main()
