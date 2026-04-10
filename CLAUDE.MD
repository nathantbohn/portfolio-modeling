# Portfolio Backtester

## Project Overview

A real-time, interactive portfolio backtesting tool. The core interaction: users drag sliders to adjust fund allocations and watch performance charts, stats, and a pie chart animate continuously during the drag — not on release. Everything feels alive and connected. Think Anduril, Linear, Vercel-level polish.

This is NOT a form-and-submit backtester like Portfolio Visualizer. The differentiator is the tactile, slider-driven exploration experience that builds intuition about how allocation shifts affect returns and risk.

## Design Benchmarks

Reference these sites for motion, typography, and overall feel:
- Anduril.com (sleek transitions, premium feel)
- Linear.app (snappy, responsive UI)
- Vercel.com (clean data presentation)

All chart and pie animations must use easing curves (e.g. `cubic-bezier(0.16, 1, 0.3, 1)`) for a snappy-but-smooth feel. Pie chart wedges should morph/interpolate between states, not redraw. Line graph should smoothly transition between states. Target 60fps — portfolio calculations must run in under 16ms.

## Tech Stack

### Frontend
- **React + TypeScript**
- **Framer Motion** for continuous, smooth animations (pie chart morphing, chart transitions, slider interactions)
- **D3.js** for the cumulative returns line graph and annualized returns bar chart (full control over per-frame animation; do NOT use off-the-shelf chart libraries that resist mid-drag animation)
- **Tailwind CSS** for styling
- **react-beautiful-dnd** (or equivalent) for drag-and-drop fund selection

### Backend
- **Python + FastAPI** — thin API layer that serves stored price data as JSON
- **SQLite** — single-file storage for price data; simple, zero-config, built into Python
- **yfinance** — for bulk historical data download and monthly refresh script

## Data Layer

### Funds (V1 — 10 ETFs)
VOO, BND, VXUS, SCHD, SCHF, SCHI, VTI, QQQ, BNDX, VBR

### Data Requirements
- 15 years of monthly data per fund
- Store BOTH adjusted close (total return, dividends reinvested) AND regular close (price return only) — the dividend toggle needs both series
- Bulk download via `yfinance` on initial setup
- Monthly refresh script (cron job or manual) that appends the latest month's data for all 10 funds — this is ~10 API calls, essentially free
- Serve to frontend as JSON via FastAPI endpoint

### Storage Schema (SQLite)
- Table: `prices`
- Columns: `ticker`, `date`, `adjusted_close`, `close`
- ~1,800 rows total (10 funds × 180 months) — trivially small

## V1 Features

### Fund Selection
- All 10 funds displayed in a tray/sidebar
- **Drag and drop** a fund from the tray into the portfolio area (max 4 active funds)
- Each active fund shows: a slider, a precision input box, and a remove button
- When a fund is **removed**, its allocation is distributed **evenly** across remaining funds
- When a fund is **added**, it starts at 0% (user adjusts from there)

### Allocation Controls
- **Slider** per fund: dragging adjusts that fund's weight
- **Input box** per fund: type a precise percentage; slider thumb moves to match
- **Auto-rebalance on adjust**: when one fund's weight changes (via slider or input), the other active funds adjust **proportionally to their current weights** to keep total at exactly 100%
- Pie chart animates **continuously during drag**, not on release

### Visualizations (all animate live during slider drag)
1. **Pie chart** — shows current allocation; wedges morph smoothly as sliders move
2. **Cumulative returns line graph** (D3) — "Growth of $10,000" over the full 15-year period; line smoothly interpolates between states on each slider change
3. **Annualized returns bar chart** (D3) — bar heights animate on allocation change

### Stats Panel
- **CAGR** (Compound Annual Growth Rate)
- **Annualized Volatility** (standard deviation of monthly returns × √12)
- **Max Drawdown** (largest peak-to-trough decline)
- **Sharpe Ratio** (assume risk-free rate of current 3-month T-bill, or a sensible default like 2%)

All stats update live during slider interaction.

### Dividend Toggle
- Toggle switch: **Total Return** (dividends reinvested) vs **Price Return** (price only)
- Switching recalculates everything using the appropriate data series (adjusted_close vs close)
- This is especially meaningful for dividend-heavy funds like SCHD

### Rebalancing Toggle
- Toggle switch: **Annual Rebalance** on/off
- When on, portfolio is rebalanced to target allocation at the start of each calendar year
- When off, portfolio drifts with market performance (buy-and-hold)

### Time Period
- V1: Fixed at full 15-year history. No custom date range selector yet.

## V1 Explicitly NOT Included (V2+)
- Comparison mode (Portfolio A vs Portfolio B side by side)
- Fund locking (prevent a fund from auto-adjusting when others change)
- Custom time range selection / period presets
- More than 4 active funds
- More than 10 available funds
- Rebalancing frequencies other than annual
- User accounts, saving portfolios, sharing links
- Deployment infrastructure (start local)

## Project Structure

```
portfolio-backtester/
├── CLAUDE.md
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── public/
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── FundTray.tsx          # Available funds, drag source
│       │   ├── PortfolioSlot.tsx     # Single fund: slider + input + remove
│       │   ├── AllocationPanel.tsx   # Portfolio area: drop target, up to 4 slots
│       │   ├── PieChart.tsx          # Animated pie chart (Framer Motion)
│       │   ├── CumulativeChart.tsx   # D3 line chart
│       │   ├── AnnualReturnsChart.tsx# D3 bar chart
│       │   ├── StatsPanel.tsx        # CAGR, vol, drawdown, Sharpe
│       │   └── ToggleSwitch.tsx      # Reusable toggle for rebalance + dividends
│       ├── hooks/
│       │   ├── usePortfolio.ts       # Allocation state, auto-rebalance logic
│       │   └── usePriceData.ts       # Fetch + cache price data from API
│       ├── utils/
│       │   ├── calculations.ts       # Portfolio return math, stats, drawdown
│       │   └── animations.ts         # Shared easing curves, transition configs
│       └── types/
│           └── index.ts              # Fund, Allocation, PriceData types
├── backend/
│   ├── requirements.txt              # fastapi, uvicorn, yfinance, sqlite3
│   ├── main.py                       # FastAPI app, serves price data
│   ├── db.py                         # SQLite connection + queries
│   ├── download.py                   # Initial bulk download script
│   └── refresh.py                    # Monthly refresh script
└── data/
    └── prices.db                     # SQLite database file
```

## Critical Implementation Notes

### Performance
- The portfolio calculation engine (in `calculations.ts`) MUST run in <16ms for 4 funds × 180 months. This is easily achievable but must not regress — no unnecessary allocations or re-renders during drag.
- Slider `onChange` fires on every frame during drag. Debouncing is NOT acceptable — the whole point is real-time feedback. Instead, keep the math fast.
- Use `useMemo` and `useCallback` strategically. Memoize price data; recalculate returns only when allocations or toggles change.

### Auto-Rebalance Logic (Proportional)
When fund X's weight changes by delta:
1. Calculate the total weight of all OTHER active funds
2. Each other fund absorbs a share of -delta proportional to its current weight relative to that total
3. Clamp all weights to [0, 100], ensure sum is exactly 100
4. Edge case: if all other funds are at 0%, distribute evenly instead

### Animation
- Pie chart: animate arc angles via Framer Motion's `animate` prop. Do NOT unmount/remount slices.
- Line chart: D3 path interpolation between old and new data points. Use `d3.interpolatePath` or manual point interpolation.
- Bar chart: animate bar heights via D3 transitions or Framer Motion.
- All transitions: `cubic-bezier(0.16, 1, 0.3, 1)` default easing, ~200ms duration for slider-driven updates.
