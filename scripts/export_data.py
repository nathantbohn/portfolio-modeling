"""
Export price data from SQLite to a static JSON file for the frontend.
Output matches the FastAPI /prices endpoint format:
  { "VOO": [{"date": "...", "adjusted_close": ..., "close": ...}, ...], ... }
"""

import json
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "prices.db")
OUT_PATH = os.path.join(ROOT, "frontend", "public", "data", "prices.json")


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    tickers = [
        r["ticker"]
        for r in conn.execute(
            "SELECT DISTINCT ticker FROM prices ORDER BY ticker"
        ).fetchall()
    ]

    result: dict[str, list[dict]] = {}
    for ticker in tickers:
        rows = conn.execute(
            "SELECT date, adjusted_close, close FROM prices WHERE ticker = ? ORDER BY date ASC",
            (ticker,),
        ).fetchall()
        result[ticker] = [
            {
                "date": r["date"],
                "adjusted_close": r["adjusted_close"],
                "close": r["close"],
            }
            for r in rows
        ]

    conn.close()

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(result, f, separators=(",", ":"))

    total = sum(len(v) for v in result.values())
    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"Exported {len(result)} tickers, {total} rows -> {OUT_PATH} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
