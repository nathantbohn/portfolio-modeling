import { useCallback, useMemo, useState } from 'react'
import { DragDropContext, type DropResult } from '@hello-pangea/dnd'
import { usePortfolio } from './hooks/usePortfolio'
import { usePriceData } from './hooks/usePriceData'
import { computePortfolio, computeBenchmark, calcRollingReturns, computeChartBounds } from './utils/calculations'
import FundTray from './components/FundTray'
import AllocationPanel from './components/AllocationPanel'
import ToggleSwitch from './components/ToggleSwitch'
import PieChart from './components/PieChart'
import StatsPanel from './components/StatsPanel'
import CumulativeChart from './components/CumulativeChart'
import AnnualReturnsChart from './components/AnnualReturnsChart'
import RollingReturnsChart from './components/RollingReturnsChart'
import ResizablePanel from './components/ResizablePanel'
import { parseUrlState, buildShareUrl } from './utils/urlState'

export default function App() {
  const {
    activeFunds,
    addFund,
    removeFund,
    setWeight,
    rebalance,
    setRebalance,
    useTotalReturn,
    setUseTotalReturn,
    principal,
    setPrincipal,
    monthlyContribution,
    setMonthlyContribution,
  } = usePortfolio()

  const { data: priceData, loading, error } = usePriceData()

  const [urlInit] = useState(() => parseUrlState())
  const [showBenchmark, setShowBenchmark] = useState(urlInit.benchmark ?? false)
  const [rollingWindow, setRollingWindow] = useState<12 | 36 | 60>(urlInit.rolling ?? 12)
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(() => {
    const url = buildShareUrl({
      funds: activeFunds,
      principal,
      contribute: monthlyContribution,
      rebalance,
      totalReturn: useTotalReturn,
      benchmark: showBenchmark,
      rolling: rollingWindow,
    })
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [activeFunds, principal, monthlyContribution, rebalance, useTotalReturn, showBenchmark, rollingWindow])

  const activeTickers = new Set(activeFunds.map((f) => f.ticker))
  const isFull = activeFunds.length >= 4

  const result = useMemo(() => {
    if (!priceData) return null
    return computePortfolio(
      activeFunds,
      priceData,
      { rebalance, useTotalReturn, monthlyContribution },
      principal,
    )
  }, [activeFunds, priceData, rebalance, useTotalReturn, monthlyContribution, principal])

  const chartBounds = useMemo(() => {
    if (!priceData) return null
    return computeChartBounds(
      priceData,
      { rebalance, useTotalReturn, monthlyContribution },
      principal,
    )
  }, [priceData, rebalance, useTotalReturn, monthlyContribution, principal])

  const rollingData = useMemo(() => {
    if (!result) return []
    return calcRollingReturns(result.cumulativeValues, rollingWindow)
  }, [result, rollingWindow])

  const benchmarkData = useMemo(() => {
    if (!showBenchmark || !priceData || !result || result.cumulativeValues.length === 0) return []
    const dates = result.cumulativeValues.map((p) => p.date)
    return computeBenchmark(priceData, useTotalReturn, dates, principal, monthlyContribution)
  }, [showBenchmark, priceData, result, useTotalReturn, principal, monthlyContribution])

  function onDragEnd(r: DropResult) {
    const { destination, draggableId } = r
    if (!destination) return
    if (destination.droppableId === 'portfolio') {
      addFund(draggableId)
    }
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="h-screen flex flex-col bg-surface-0 text-warm-50 overflow-hidden">

        {/* ── Header ────────────────────────────────────────────────── */}
        <header className="flex-shrink-0 flex items-center justify-between px-5 h-11 border-b border-border">
          <div className="flex items-center gap-3">
            <h1 className="text-[13px] font-semibold tracking-tight text-warm-50">
              Portfolio Backtester
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
          <aside className="w-[320px] flex-shrink-0 border-r border-border flex flex-col min-h-0 bg-surface-1">

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
                  checked={rebalance}
                  onChange={setRebalance}
                  label="Rebalance"
                />
                <div className="w-px h-3.5 bg-border" />
                <ToggleSwitch
                  checked={showBenchmark}
                  onChange={setShowBenchmark}
                  label="Benchmark"
                />
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
              <FundTray activeTickers={activeTickers} isFull={isFull} />
              <AllocationPanel
                activeFunds={activeFunds}
                onSetWeight={setWeight}
                onRemove={removeFund}
              />
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
    </DragDropContext>
  )
}
