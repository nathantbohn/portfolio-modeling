"""
FastAPI backend — serves historical price data for the portfolio backtester.

Endpoints:
  GET /prices           → all tickers, all dates
  GET /prices/{ticker}  → single ticker
  GET /tickers          → list of available tickers
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import get_all_tickers, get_prices_by_ticker, init_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    yield


app = FastAPI(title="Portfolio Backtester API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


class PricePoint(BaseModel):
    date: str
    adjusted_close: float
    close: float


@app.get("/tickers", response_model=list[str])
def list_tickers() -> list[str]:
    return get_all_tickers()


@app.get("/prices/{ticker}", response_model=list[PricePoint])
def get_ticker_prices(ticker: str) -> list[PricePoint]:
    ticker = ticker.upper()
    rows = get_prices_by_ticker(ticker)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No data found for ticker '{ticker}'")
    return [PricePoint(date=r["date"], adjusted_close=r["adjusted_close"], close=r["close"]) for r in rows]


@app.get("/prices", response_model=dict[str, list[PricePoint]])
def get_all_prices() -> dict[str, list[PricePoint]]:
    tickers = get_all_tickers()
    return {
        ticker: [
            PricePoint(date=r["date"], adjusted_close=r["adjusted_close"], close=r["close"])
            for r in get_prices_by_ticker(ticker)
        ]
        for ticker in tickers
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
