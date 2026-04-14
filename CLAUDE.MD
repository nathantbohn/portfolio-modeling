Portfolio Backtester & Custom Index Platform
What This Is
A real-time, interactive portfolio backtesting tool with a custom index builder. Users drag sliders to adjust fund allocations and watch charts, stats, and a pie chart animate continuously during the drag — not on release, not on submit. The core differentiator vs. competitors (Portfolio Visualizer, PortfolioMetrics, Testfolio) is the tactile, slider-driven exploration loop where everything updates live.
The deeper value proposition: users can build their own indices from individual stocks, backtest those custom indices against real benchmarks (Dow, S&P 500), and slot them into a portfolio model as simulated ETFs alongside real ones. This two-layer abstraction — pick stocks → build index → slot into portfolio — is what makes the product genuinely different.
Live at: callibratedindex.space (working domain)
Frontend: Vercel (auto-deploys from main branch)
Backend: Render free tier (auto-deploys from backend-deploy branch)
Tech Stack
Frontend

React 19 + TypeScript
Vite 6 (build tool + dev server)
Tailwind CSS v3
Framer Motion (pie chart animations, transitions)
D3.js (cumulative returns line chart, annual returns bar chart, rolling returns chart)
@dnd-kit (drag-and-drop fund selection — replaced @hello-pangea/dnd due to React 19 incompatibility)

Backend

Python + FastAPI
SQLite (prices.db — ETFs, mutual funds, ~500 S&P 500 stocks, McMerica 25 constituents)
yfinance (data download and monthly refresh)
Backend serves individual stock price data for custom index builder
Frontend also loads 12 ETFs + 5 mutual funds from static JSON (frontend/public/data/prices.json)

Deployment

Frontend: Vercel, build command npx vite build, output dist, root frontend
Backend: Render, auto-deploys from backend-deploy branch
Frontend reaches backend via VITE_API_URL environment variable
CORS configured between Vercel and Render origins

Critical Constraints — Read Before Every Change
1. Slider Interaction Is Sacred

Slider onChange fires on every frame during drag. NO debouncing. NO "apply" buttons. NO delayed recomputation.
The entire product promise is real-time feedback. If a change would add latency to the slider → chart update loop, it must be justified explicitly.
Portfolio calculations must run in <16ms to maintain 60fps during drag.

2. Animation Rules

Pie chart: Framer Motion animate prop. Animate arc angles. Do NOT unmount/remount slices — this causes flicker during fast drags.
Line/bar charts: D3.js direct DOM manipulation.
All chart animations: cubic-bezier(0.16, 1, 0.3, 1) easing.
Fixed Y-axis ranges on charts are INTENTIONAL — they prevent rescaling during drag, which preserves visual stability and gives stronger comparative feedback. Do not "fix" this.

3. Visual Design — Financial Times Warm Palette

Background: salmon/cream (#FFF1E5)
Cards: white with warm borders
Accent: crimson
This is NOT a dark theme product. It is warm, editorial, approachable.
Do not introduce cold grays, dark backgrounds, or generic dashboard aesthetics.

4. Tailwind Config Changes Require Dev Server Restart

Hot reload does NOT pick up changes to tailwind.config.js
After any Tailwind config change, restart the dev server
This has caused multiple debugging sessions — do not skip this step

5. Vite Environment Variables

VITE_ prefixed env vars are baked in at BUILD time, not runtime
Changing them on Vercel requires a fresh build (not just redeploy)
Clear cache if values seem stale after a new build

6. Build Script

frontend/package.json "build" script should be just "vite build"
Do NOT add "tsc -b" to the build script — it causes permission errors on Vercel's Linux build server due to Windows-generated package-lock.json

Data Layer
Available Funds

12 ETFs: VOO, BND, VXUS, SCHD, SCHF, SCHI, VTI, QQQ, BNDX, VBR, GLD, DBC
5 Fidelity mutual funds: FXAIX, FSKAX, FTIHX, FXNAX, FBGRX
~500 S&P 500 stocks (via backend, for custom index builder)
McMerica 25 constituent stocks (25 individual stocks, some outside S&P 500)

Data Serving

ETFs and mutual funds: static JSON shipped with frontend (frontend/public/data/prices.json)
Individual stocks: fetched from backend API (FastAPI reading from SQLite)
Monthly granularity, both adjusted close and regular close stored
15 years of history for ETFs, variable depth for individual stocks

Custom Index Builder

Users select individual stocks, assign weightings (manual or equal-weight)
Two-layer calculation: compute custom fund return series from constituent stocks, then feed into portfolio engine as a single fund
McMerica 25 is a pre-built custom fund available in the fund tray
Cap-weighted indices are deferred (no historical market cap data yet)

Calculation Engine (calculations.ts)
Pure functions that accept allocations, price data, and configuration flags. Returns cumulative values, annual returns, and key stats.
Stats Computed

CAGR (Compound Annual Growth Rate)
Annualized Volatility (std dev of monthly returns × √12)
Max Drawdown (largest peak-to-trough decline)
Sharpe Ratio

Key Behaviors

Auto-rebalance: adjusting one fund proportionally adjusts others to keep total at 100%
Rebalancing frequencies: monthly, quarterly, semi-annual, annual
Fund locking: locked funds are excluded from auto-rebalance redistribution
Contributions: monthly additions with capital-invested baseline
Benchmark: 100% VOO overlay, adjusts for contributions and dividend toggle for apples-to-apples comparison
Dividend toggle: switches between adjusted close (total return) and regular close (price only)

Features Currently Live

Drag-and-drop fund selection (max 4 active funds)
Real-time sliders with continuous update
Pie/donut chart with toggle (Framer Motion)
Cumulative returns line chart (D3) — "Growth of $X"
Annual returns bar chart (D3)
Rolling returns chart (1yr, 3yr, 5yr toggle)
Stats panel (CAGR, volatility, max drawdown, Sharpe)
5 preset portfolios (60/40 Classic, Boglehead 3-Fund, Growth Tilt, Dividend Focus, All Weather)
Fund locking (lock icon per fund)
Starting principal input + periodic monthly contributions
Shareable links (portfolio state encoded in URL query params)
Resizable chart containers (drag handle, persists to localStorage)
Interactive tooltips on line charts (crosshair, date, value, return %)
Ticker banner at top (McMerica 25, S&P 500, Dow Jones)
Custom index builder (search stocks, add, name fund, set weights)
McMerica 25 as pre-built fund in tray
Mobile responsiveness (vertical stacking, collapsible sidebar)
Tier system scaffolded (returns premium for all users currently)

Prompting Guidelines
When making changes to this codebase:

Diagnose before prescribing — grep/search for the relevant code before making changes. Understand what exists before modifying it.
Name the technology layer — be specific about whether a change targets Tailwind config, inline styles, CSS variables, React component logic, or D3 rendering code.
Restart dev server after Tailwind config changes — this is not optional.
Preserve the slider interaction loop — any change that adds latency between slider input and visual output must be flagged and justified.
Preserve the warm palette — #FFF1E5 background, white cards, crimson accents. No dark themes, no cold grays.
Test on mobile — the product must work well on phone screens. Sliders need adequate touch targets.
Do not introduce debouncing on slider onChange unless explicitly asked and the performance justification is documented.
