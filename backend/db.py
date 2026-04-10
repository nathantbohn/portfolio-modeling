import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "prices.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS prices (
                ticker        TEXT    NOT NULL,
                date          TEXT    NOT NULL,
                adjusted_close REAL   NOT NULL,
                close         REAL    NOT NULL,
                PRIMARY KEY (ticker, date)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prices_ticker ON prices (ticker)")
        conn.commit()


def upsert_prices(rows: list[dict]) -> None:
    """Insert or replace rows. Each dict must have ticker, date, adjusted_close, close."""
    with get_connection() as conn:
        conn.executemany(
            """
            INSERT OR REPLACE INTO prices (ticker, date, adjusted_close, close)
            VALUES (:ticker, :date, :adjusted_close, :close)
            """,
            rows,
        )
        conn.commit()


def get_prices_by_ticker(ticker: str) -> list[sqlite3.Row]:
    with get_connection() as conn:
        return conn.execute(
            "SELECT date, adjusted_close, close FROM prices WHERE ticker = ? ORDER BY date ASC",
            (ticker,),
        ).fetchall()


def get_all_tickers() -> list[str]:
    with get_connection() as conn:
        rows = conn.execute("SELECT DISTINCT ticker FROM prices ORDER BY ticker").fetchall()
        return [r["ticker"] for r in rows]
