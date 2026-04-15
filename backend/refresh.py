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

from db import init_db, upsert_prices, get_all_tickers, get_prices_by_ticker


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


MCMERICA_25 = [
    "CVX", "MCD", "PEP", "COST", "BRK-B", "PM", "WDC", "DD", "JNJ", "F",
    "COP", "WMT", "TAP", "FCX", "HD", "HOG", "AAL", "MAR", "AXP", "JPM",
    "CAT", "GD", "T", "DIS", "DE",
]


def recompute_mcmerica() -> None:
    """Recompute MCMERICA-25 composite from constituent stock data in the DB."""
    all_data: dict[str, list[dict]] = {}
    for t in MCMERICA_25:
        rows = get_prices_by_ticker(t)
        if rows:
            all_data[t] = [{"date": r["date"], "adjusted_close": r["adjusted_close"], "close": r["close"]} for r in rows]

    available = [t for t in MCMERICA_25 if t in all_data and len(all_data[t]) > 0]
    if not available:
        print("McMerica 25: no constituent data found, skipping")
        return

    n = len(available)
    weight = 1.0 / n

    maps_adj = [{r["date"]: r["adjusted_close"] for r in all_data[t]} for t in available]
    maps_close = [{r["date"]: r["close"] for r in all_data[t]} for t in available]

    common = sorted(set.intersection(*(set(m.keys()) for m in maps_adj)))
    if len(common) < 2:
        print("McMerica 25: insufficient common dates, skipping")
        return

    base = 100.0
    adj_val = base
    close_val = base
    mc_rows = [{"ticker": "MCMERICA-25", "date": common[0], "adjusted_close": base, "close": base}]

    for i in range(1, len(common)):
        d, pd_ = common[i], common[i - 1]
        adj_ret = sum(weight * (maps_adj[j][d] / maps_adj[j][pd_]) for j in range(n))
        close_ret = sum(weight * (maps_close[j][d] / maps_close[j][pd_]) for j in range(n))
        adj_val *= adj_ret
        close_val *= close_ret
        mc_rows.append({"ticker": "MCMERICA-25", "date": d, "adjusted_close": adj_val, "close": close_val})

    upsert_prices(mc_rows)
    print(f"McMerica 25: recomputed {len(mc_rows)} rows from {n} constituents")


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

    # Recompute McMerica 25 composite from updated constituent data
    recompute_mcmerica()


if __name__ == "__main__":
    refresh()
