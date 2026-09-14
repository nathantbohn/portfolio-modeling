# Phase 6 — Security & Dependencies

## npm audit (frontend) — 7 vulnerabilities (1 critical, 4 high, 2 low)
All are in **dev/build tooling**; none ship in the production bundle. Reachability assessment:

| Package | Advisory | Sev | Reachable in prod? |
|---|---|---|---|
| vitest <3.2.6 | UI server arbitrary file read/exec (GHSA-5xrq-8626-4rwp) | critical | **No** — vitest UI is never started; test-time only, local |
| vite ≤6.4.2 | server.fs.deny bypass (Win), launch-editor NTLMv2 hash leak | high | **No** — dev server only; prod is static files on Vercel |
| postcss ≤8.5.22 | XSS via stringify, sourceMappingURL file read (4 advisories) | high | **No** — build-time processing of the project's own CSS |
| browserslist ≤4.28.6 | unbounded memory growth; prototype write via custom stats | high | **No** — build-time, own config |
| nanoid ≤3.3.17 | infinite loop with negative/zero size | high | **No** — transitive of postcss, build-time |
| @babel/core ≤7.29.0 | arbitrary file read via sourceMappingURL | low | **No** — build-time |

All have non-breaking fixes via `npm audit fix` (within current semver ranges). **Nothing upgraded per audit rules**; recommended as routine hygiene since dev-machine exposure (vite dev server on Windows, NTLM leak) is the only real vector.

## pip-audit (backend)
- `starlette 0.38.6` (transitive of fastapi 0.115.0): **9 advisories** (PYSEC-2026-161/248/249/1941/1943/2280/2281…), fix versions 0.40.0 → 1.3.1.
- Reachability: most starlette advisories in this range concern multipart/form parsing, large uploads, or websockets. This API serves **GET-only JSON with no forms, uploads, or websockets**, so the known exploit paths are largely unreachable. Still, the count argues for bumping `fastapi` (0.115.0 → 0.141.x pulls a fixed starlette). Not applied per rules.
- Other backend deps: no advisories reported.

## Dependency freshness (registry data, 2026-09-07)

### Frontend
| Package | Current | Latest | Major bump? | Notes |
|---|---|---|---|---|
| react / react-dom | 19.2.5 | 19.2.8 | no | current major; healthy |
| d3 | 7.9.0 | 7.9.x | no | stable, maintained |
| framer-motion | 12.38.0 | 13.2.0 | **yes** | v13 released; v12 still fine w/ React 19 |
| @dnd-kit/core | 6.3.1 | 6.x | no | chosen for React 19 compat (replaced @hello-pangea/dnd) |
| vite | 6.4.2 | 8.2.2 | **yes (2 majors)** | v6 in maintenance; upgrade eventually |
| vitest | 3.2.4 | 5.0.0 | **yes (2 majors)** | 3.2.7 patches the critical UI advisory |
| typescript | 5.8.3 | 7.0.2 | **yes** | TS 7 (native port) — big jump, low urgency |
| tailwindcss | 3.4.19 | 4.3.3 | **yes** | v4 changes config model — conflicts with CLAUDE.md Tailwind-v3 assumptions; do not casually bump |
| @vitejs/plugin-react | 4.7.0 | 6.1.1 | **yes** | pairs with a vite upgrade |
| postcss/autoprefixer | 8.5.9/10.4.27 | 8.5.28/10.5.5 | no | patch-level fixes available |

### Backend
| Package | Pinned | Latest | Major bump? | Notes |
|---|---|---|---|---|
| fastapi | 0.115.0 | 0.141.1 | no (0.x) | brings patched starlette |
| uvicorn | 0.30.6 | 0.52.4 | no (0.x) | |
| yfinance | 1.2.1 | 1.7.0 | no | ETL only |
| pandas | 2.2.3 | 3.0.5 | **yes** | ETL only; pandas 3 breaking changes |
| numpy | 2.1.2 | 2.4.6 | no | |

React-19 compatibility: **no risks found** — every runtime dependency currently used supports React 19 (the one known incompatibility, @hello-pangea/dnd, was already replaced with @dnd-kit per CLAUDE.md).

## URL-parameter tampering (shareable links)
`parseUrlState` validates tickers against FUND_META, rejects NaN/negative weights, whitelists rebalance/rolling values, and integer-parses principal/contribute. Gaps found (all verified by execution):

- **S-1 (P2)**: `?funds=VOO:Infinity,BND:40` — `parseFloat("Infinity")` passes the `isNaN`/`>=0` checks. Weight normalization then yields NaN for every fund → **entire UI renders NaN** (verified: cumulative values `[10000, NaN, NaN]`, CAGR NaN; D3 paths break silently). Same for weights like `1e308` (overflow to Infinity on sum). Fix: require `Number.isFinite(weight)` and clamp to [0, 100].
- **S-2 (P3)**: `?principal=0` is accepted → CAGR = NaN (0/0) though values render as $0 (verified). UI input already prevents typing 0 being harmful… actually the input allows 0 too. Clamp to ≥1 or guard the CAGR division.
- **S-3 (P3)**: URL can load **up to 18 funds** (one per FUND_META ticker) — bypasses the 4-fund UI limit (and the 5-fund MAX_FUNDS): renders 18 sliders and computes fine, but breaks the product's curated UX and the "n/5" display. Cap parsed funds at the app limit.
- Custom funds (CUSTOM-*) cannot be injected via URL (whitelist) — good.

## XSS / injection review
- The two `innerHTML` sinks (chart tooltips in CumulativeChart/RollingReturnsChart) interpolate **only** internally computed numbers and `d3.timeFormat` output — no user-controlled strings. Not exploitable.
- Custom fund names and search results render through React text nodes (auto-escaped). Fund name length is unbounded (layout stretch only; truncated by CSS in most spots) — cosmetic.
- `buildShareUrl` uses URLSearchParams encoding — safe.
- Backend search endpoint: parameterized SQL, injection attempt returned 0 rows with table intact (verified live in Phase 5). LIKE wildcards (`%`, `_`) leak into the pattern — harmless (read-only, LIMIT 10).

## localStorage tampering
- `sidebar-collapsed`: compared to the string 'true' — any tampered value degrades to a boolean, safe.
- `chart-height:<id>`: parseInt + clamped to [150, 600] before use — safe.
- No `JSON.parse` of storage anywhere; custom funds aren't persisted at all (see quality note in inventory). All reads are try/catch-wrapped. **No issues.**

Nothing was upgraded, per audit rules.
