"""
Export price data from SQLite to a static JSON file for the frontend.
Includes ETFs, McMerica 25 constituents, and a pre-computed MCMERICA-25 synthetic series.
"""

import json
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "prices.db")
OUT_PATH = os.path.join(ROOT, "frontend", "public", "data", "prices.json")

ETFS = ["VOO", "BND", "VXUS", "SCHD", "SCHF", "SCHI", "VTI", "QQQ", "BNDX", "VBR", "GLD", "DBC", "DIA"]
MUTUAL_FUNDS = ["FXAIX", "FSKAX", "FTIHX", "FXNAX", "FBGRX"]

MCMERICA_25 = [
    "CVX", "MCD", "PEP", "COST", "BRK-B", "PM", "WDC", "DD", "JNJ", "F",
    "COP", "WMT", "TAP", "FCX", "HD", "HOG", "AAL", "MAR", "AXP", "JPM",
    "CAT", "GD", "T", "DIS", "DE",
]

EXPORT_TICKERS = sorted(set(ETFS + MUTUAL_FUNDS + MCMERICA_25))


def synthesize_mcmerica(all_data: dict[str, list[dict]]) -> list[dict]:
    """Equal-weight synthesis of McMerica 25 from constituent price data."""
    available = [t for t in MCMERICA_25 if t in all_data and len(all_data[t]) > 0]
    if not available:
        return []

    n = len(available)
    weight = 1.0 / n

    # Build date->price maps
    maps_adj: list[dict[str, float]] = []
    maps_close: list[dict[str, float]] = []
    for t in available:
        adj = {r["date"]: r["adjusted_close"] for r in all_data[t]}
        close = {r["date"]: r["close"] for r in all_data[t]}
        maps_adj.append(adj)
        maps_close.append(close)

    # Common dates
    common = sorted(set.intersection(*(set(m.keys()) for m in maps_adj)))
    if len(common) < 2:
        return []

    # Chain weighted returns from base 100
    base = 100.0
    adj_val = base
    close_val = base
    result = [{"date": common[0], "adjusted_close": base, "close": base}]

    for i in range(1, len(common)):
        d, pd_ = common[i], common[i - 1]
        adj_ret = sum(weight * (maps_adj[j][d] / maps_adj[j][pd_]) for j in range(n))
        close_ret = sum(weight * (maps_close[j][d] / maps_close[j][pd_]) for j in range(n))
        adj_val *= adj_ret
        close_val *= close_ret
        result.append({"date": d, "adjusted_close": adj_val, "close": close_val})

    return result


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
                {"date": r["date"], "adjusted_close": r["adjusted_close"], "close": r["close"]}
                for r in rows
            ]

    conn.close()

    # Pre-compute McMerica 25 synthetic series
    mcmerica = synthesize_mcmerica(result)
    if mcmerica:
        result["MCMERICA-25"] = mcmerica
        print(f"McMerica 25: {len(mcmerica)} data points from {len([t for t in MCMERICA_25 if t in result])} constituents")

        # Write MCMERICA-25 to SQLite so the backend API also serves it
        conn2 = sqlite3.connect(DB_PATH)
        conn2.executemany(
            "INSERT OR REPLACE INTO prices (ticker, date, adjusted_close, close) VALUES (?, ?, ?, ?)",
            [("MCMERICA-25", r["date"], r["adjusted_close"], r["close"]) for r in mcmerica],
        )
        conn2.commit()
        conn2.close()
        print(f"McMerica 25: wrote {len(mcmerica)} rows to prices.db")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(result, f, separators=(",", ":"))

    total = sum(len(v) for v in result.values())
    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"Exported {len(result)} tickers, {total} rows -> {OUT_PATH} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
