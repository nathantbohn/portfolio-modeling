"""
Export price data from SQLite to a static JSON file for the frontend.
Includes ETFs + McMerica 25 constituents (not the full S&P 500 universe).
Output matches the FastAPI /prices endpoint format:
  { "VOO": [{"date": "...", "adjusted_close": ..., "close": ...}, ...], ... }
"""

import json
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "prices.db")
OUT_PATH = os.path.join(ROOT, "frontend", "public", "data", "prices.json")

# ETFs available in the fund tray
ETFS = ["VOO", "BND", "VXUS", "SCHD", "SCHF", "SCHI", "VTI", "QQQ", "BNDX", "VBR", "GLD", "DBC"]

# McMerica 25 constituents
MCMERICA_25 = [
    "CVX", "MCD", "PEP", "COST", "BRK-B", "PM", "WDC", "DD", "JNJ", "F",
    "COP", "WMT", "TAP", "FCX", "HD", "HOG", "AAL", "MAR", "AXP", "JPM",
    "CAT", "GD", "T", "DIS", "DE",
]

EXPORT_TICKERS = sorted(set(ETFS + MCMERICA_25))


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    result: dict[str, list[dict]] = {}
    for ticker in EXPORT_TICKERS:
        rows = conn.execute(
            "SELECT date, adjusted_close, close FROM prices WHERE ticker = ? ORDER BY date ASC",
            (ticker,),
        ).fetchall()
        if rows:
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
