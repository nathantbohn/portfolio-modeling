import { useCallback, useMemo, useState } from 'react'
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { usePortfolio, ALL_TICKERS } from './hooks/usePortfolio'
import { usePriceData } from './hooks/usePriceData'
import { useCustomFunds } from './hooks/useCustomFunds'
import { useStockPrices } from './hooks/useStockPrices'
import { computePortfolio, computeBenchmark, calcRollingReturns, computeChartBounds, type RebalanceFrequency } from './utils/calculations'
import { synthesizePriceData } from './utils/synthesize'
import FundTray from './components/FundTray'
import AllocationPanel from './components/AllocationPanel'
import ToggleSwitch from './components/ToggleSwitch'
import PieChart from './components/PieChart'
import StatsPanel from './components/StatsPanel'
import CumulativeChart from './components/CumulativeChart'
import AnnualReturnsChart from './components/AnnualReturnsChart'
import RollingReturnsChart from './components/RollingReturnsChart'
import ResizablePanel from './components/ResizablePanel'
import PresetPortfolios from './components/PresetPortfolios'
import CustomFundBuilder from './components/CustomFundBuilder'
import TickerBanner from './components/TickerBanner'
import { MCMERICA_25, MCMERICA_25_ID, MCMERICA_25_TICKERS, MCMERICA_25_COLOR } from './config/mcmerica25'
import { parseUrlState, buildShareUrl } from './utils/urlState'

export default function App() {
  const {
    activeFunds,
    setFunds,
    addFund,
    removeFund,
    setWeight,
    toggleLock,
    rebalanceFrequency,
    setRebalanceFrequency,
    useTotalReturn,
    setUseTotalReturn,
    principal,
    setPrincipal,
    monthlyContribution,
    setMonthlyContribution,
  } = usePortfolio()

  const { data: priceData, loading, error } = usePriceData()
  const { customFunds, addCustomFund } = useCustomFunds()
  const [showBuilder, setShowBuilder] = useState(false)

  // Determine which stock tickers need fetching — always include McMerica 25 + active custom funds
  const stockTickersToFetch = useMemo(() => {
    const tickers = new Set<string>(MCMERICA_25_TICKERS)
    const activeCustomIds = new Set(activeFunds.map((f) => f.ticker).filter((t) => t.startsWith('CUSTOM-')))
    for (const fund of customFunds) {
      if (activeCustomIds.has(fund.id)) {
        for (const s of fund.stocks) tickers.add(s.ticker)
      }
    }
    return [...tickers]
  }, [activeFunds, customFunds])

  const { data: stockPrices } = useStockPrices(stockTickersToFetch)

  // Synthesize McMerica 25 price data
  const mcmericaPriceData = useMemo(() => {
    if (Object.keys(stockPrices).length === 0) return null
    const synth = synthesizePriceData(MCMERICA_25, stockPrices)
    return synth.length > 0 ? synth : null
  }, [stockPrices])

  // Merge synthesized custom fund + McMerica price data with base price data
  const mergedPriceData = useMemo(() => {
    if (!priceData) return null
    const merged = { ...priceData }

    // Always include McMerica 25
    if (mcmericaPriceData) merged[MCMERICA_25_ID] = mcmericaPriceData

    // Include active custom funds
    const activeCustomIds = new Set(
      activeFunds.map((f) => f.ticker).filter((t) => t.startsWith('CUSTOM-')),
    )
    for (const fund of customFunds) {
      if (activeCustomIds.has(fund.id)) {
        const synth = synthesizePriceData(fund, stockPrices)
        if (synth.length > 0) merged[fund.id] = synth
      }
    }
    return merged
  }, [priceData, mcmericaPriceData, activeFunds, customFunds, stockPrices])

  // Build metadata map for custom funds + McMerica (used by AllocationPanel, PieChart)
  const customFundMeta = useMemo(() => {
    const map: Record<string, { name: string; color: string }> = {
      [MCMERICA_25_ID]: { name: 'McMerica 25', color: MCMERICA_25_COLOR },
    }
    for (const f of customFunds) map[f.id] = { name: f.name, color: f.color }
    return map
  }, [customFunds])

  const [urlInit] = useState(() => parseUrlState())
  const [showBenchmark, setShowBenchmark] = useState(urlInit.benchmark ?? false)
  const [rollingWindow, setRollingWindow] = useState<12 | 36 | 60>(urlInit.rolling ?? 12)
  const [copied, setCopied] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
  })

  const handleShare = useCallback(() => {
    const url = buildShareUrl({
      funds: activeFunds,
      principal,
      contribute: monthlyContribution,
      rebalanceFrequency,
      totalReturn: useTotalReturn,
      benchmark: showBenchmark,
      rolling: rollingWindow,
    })
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [activeFunds, principal, monthlyContribution, rebalanceFrequency, useTotalReturn, showBenchmark, rollingWindow])

  const activeTickers = new Set(activeFunds.map((f) => f.ticker))
  const isFull = activeFunds.length >= 4

  const result = useMemo(() => {
    if (!mergedPriceData) return null
    return computePortfolio(
      activeFunds,
      mergedPriceData,
      { rebalanceFrequency, useTotalReturn, monthlyContribution },
      principal,
    )
  }, [activeFunds, mergedPriceData, rebalanceFrequency, useTotalReturn, monthlyContribution, principal])

  const chartBounds = useMemo(() => {
    if (!priceData) return null
    return computeChartBounds(
      priceData,
      { rebalanceFrequency, useTotalReturn, monthlyContribution },
      principal,
      [...ALL_TICKERS],
    )
  }, [priceData, rebalanceFrequency, useTotalReturn, monthlyContribution, principal])

  const rollingData = useMemo(() => {
    if (!result) return []
    return calcRollingReturns(result.cumulativeValues, rollingWindow)
  }, [result, rollingWindow])

  const benchmarkData = useMemo(() => {
    if (!showBenchmark || !mergedPriceData || !result || result.cumulativeValues.length === 0) return []
    const dates = result.cumulativeValues.map((p) => p.date)
    return computeBenchmark(mergedPriceData, useTotalReturn, dates, principal, monthlyContribution)
  }, [showBenchmark, mergedPriceData, result, useTotalReturn, principal, monthlyContribution])

  function onDragEnd(event: DragEndEvent) {
    const { over, active } = event
    if (over?.id === 'portfolio') {
      addFund(String(active.id))
    }
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="h-screen flex flex-col bg-surface-0 text-warm-50 overflow-hidden">

        {/* ── Ticker Banner ────────────────────────────────────────── */}
        <TickerBanner priceData={mcmericaPriceData} />

        {/* ── Header ────────────────────────────────────────────────── */}
        <header className="flex-shrink-0 flex items-center justify-between px-5 h-11 border-b border-border">
          <div className="flex items-center gap-3">
            <h1 className="text-[13px] font-semibold tracking-tight text-warm-50">
              Pioneer Backtesting
            </h1>
            {loading && (
              <span className="text-[11px] text-warm-300 animate-pulse">Loading…</span>
            )}
            {error && (
              <span className="text-[11px] text-accent" title={error}>
                API error
              </span>
            )}
          </div>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-warm-200 hover:text-warm-50 hover:bg-surface-1 border border-border transition-colors"
          >
            {copied ? 'Copied!' : 'Share'}
          </button>
        </header>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">

          {/* ── Left Control Panel ──────────────────────────────────── */}
          <aside
            className="flex-shrink-0 border-r border-border flex min-h-0 bg-surface-1 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] relative"
            style={{ width: sidebarCollapsed ? 32 : 320 }}
          >
            {/* Collapse toggle */}
            <button
              onClick={() => {
                const next = !sidebarCollapsed
                setSidebarCollapsed(next)
                try { localStorage.setItem('sidebar-collapsed', String(next)) } catch { /* */ }
              }}
              className="absolute top-2 right-0 translate-x-1/2 z-10 w-5 h-5 rounded-full bg-surface-1 border border-border flex items-center justify-center text-warm-300 hover:text-warm-50 hover:bg-surface-2 transition-colors"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              type="button"
            >
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none"
                className="transition-transform duration-300"
                style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : '' }}
              >
                <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <div className={[
              'flex flex-col min-h-0 flex-1 transition-opacity duration-200',
              sidebarCollapsed ? 'opacity-0 pointer-events-none overflow-hidden' : 'opacity-100',
            ].join(' ')}>

            {/* Toggles + Principal */}
            <div className="px-3.5 py-2.5 border-b border-border flex-shrink-0 space-y-2.5">
              <div className="flex items-center gap-4">
                <ToggleSwitch
                  checked={useTotalReturn}
                  onChange={setUseTotalReturn}
                  label="Total Return"
                />
                <div className="w-px h-3.5 bg-border" />
                <ToggleSwitch
                  checked={showBenchmark}
                  onChange={setShowBenchmark}
                  label="Benchmark"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-warm-200 flex-shrink-0">Rebalance</label>
                <select
                  value={rebalanceFrequency}
                  onChange={(e) => setRebalanceFrequency(e.target.value as RebalanceFrequency)}
                  className="flex-1 bg-surface-0 border border-border rounded-md px-2 py-1 text-xs font-mono text-warm-50 focus:outline-none focus:border-warm-300 transition-colors cursor-pointer appearance-none"
                >
                  <option value="none">None (Buy &amp; Hold)</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semi-annual">Semi-Annual</option>
                  <option value="annual">Annual</option>
                </select>
              </div>

              {/* Starting principal + monthly contribution */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-warm-200 flex-shrink-0">Starting</label>
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-warm-200 pointer-events-none font-mono">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={principal.toLocaleString('en-US')}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      const v = parseInt(raw, 10)
                      if (!isNaN(v) && v >= 0) setPrincipal(v)
                      if (raw === '') setPrincipal(0)
                    }}
                    className="w-full bg-surface-0 border border-border rounded-md px-2 py-1 pl-5 text-xs font-mono text-warm-50 tabular-nums focus:outline-none focus:border-warm-300 transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-warm-200 flex-shrink-0">Monthly</label>
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-warm-200 pointer-events-none font-mono">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={monthlyContribution === 0 ? '0' : monthlyContribution.toLocaleString('en-US')}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      const v = parseInt(raw, 10)
                      if (!isNaN(v) && v >= 0) setMonthlyContribution(v)
                      if (raw === '') setMonthlyContribution(0)
                    }}
                    className="w-full bg-surface-0 border border-border rounded-md px-2 py-1 pl-5 text-xs font-mono text-warm-50 tabular-nums focus:outline-none focus:border-warm-300 transition-colors"
                  />
                </div>
                {result && result.totalContributed > principal && (
                  <span className="text-[10px] text-warm-300 font-mono tabular-nums flex-shrink-0">
                    {'Σ $' + result.totalContributed.toLocaleString('en-US')}
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable controls area */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <PresetPortfolios onSelect={setFunds} />
              <FundTray
                activeTickers={activeTickers}
                isFull={isFull}
                customFunds={customFunds}
                mcmerica={{
                  id: MCMERICA_25_ID,
                  name: 'McMerica 25',
                  color: MCMERICA_25_COLOR,
                  ready: mcmericaPriceData != null,
                }}
                onOpenBuilder={() => setShowBuilder(true)}
              />
              <AllocationPanel
                activeFunds={activeFunds}
                onSetWeight={setWeight}
                onRemove={removeFund}
                onToggleLock={toggleLock}
                customFundMeta={customFundMeta}
              />
            </div>
            </div>
          </aside>

          {/* ── Visualization Area ──────────────────────────────────── */}
          <main className="flex-1 min-w-0 overflow-y-auto p-4 space-y-0">

            {/* Top row: pie chart + stats */}
            <div className="flex gap-3 flex-shrink-0 mb-3" style={{ height: '240px' }}>
              <div className="flex items-center justify-center flex-shrink-0 w-[220px]">
                <PieChart allocations={activeFunds} />
              </div>
              <div className="flex-1 min-w-0">
                <StatsPanel result={result} principal={principal} />
              </div>
            </div>

            {/* Cumulative returns */}
            <ResizablePanel id="cumulative" defaultHeight={320}>
              <CumulativeChart
                data={result?.cumulativeValues ?? []}
                capitalInvested={result?.capitalInvested ?? []}
                dividendData={result?.dividendValues ?? []}
                benchmarkData={benchmarkData}
                principal={principal}
                fixedYMax={chartBounds?.cumulativeMax ?? null}
              />
            </ResizablePanel>

            {/* Annual returns bar chart */}
            <ResizablePanel id="annual" defaultHeight={180}>
              <AnnualReturnsChart data={result?.annualReturns ?? []} fixedYMax={chartBounds?.annualReturnMax ?? null} />
            </ResizablePanel>

            {/* Rolling returns chart */}
            <ResizablePanel id="rolling" defaultHeight={200}>
              <RollingReturnsChart
                data={rollingData}
                window={rollingWindow}
                onWindowChange={setRollingWindow}
              />
            </ResizablePanel>
          </main>
        </div>
      </div>
      {showBuilder && (
        <CustomFundBuilder
          onClose={() => setShowBuilder(false)}
          onCreate={(draft) => {
            addCustomFund(draft)
            setShowBuilder(false)
          }}
        />
      )}
    </DndContext>
  )
}
