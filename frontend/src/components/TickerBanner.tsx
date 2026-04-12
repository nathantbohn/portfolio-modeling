import { useMemo } from 'react'
import type { PricePoint } from '../types'

const MONO = "'JetBrains Mono', ui-monospace, monospace"

// Base date for McMerica 25 (April 10, 2026 close → monthly data uses 2026-04-01)
const MCMERICA_BASE_DATE = '2026-04-01'
const MCMERICA_BASE_VALUE = 1000

// Scale factors to map ETF prices to approximate real index levels
// VOO ~$625 → S&P ~5,800 → multiplier ≈ 9.28
// DIA ~$479 → Dow ~42,000 → multiplier ≈ 87.7
const SP500_SCALE = 9.28
const DOW_SCALE = 87.7

interface IndexData {
  label: string
  value: number
  change: number
  changePct: number
}

function computeIndex(
  data: PricePoint[] | undefined,
  scale: number,
): IndexData | null {
  if (!data || data.length < 2) return null
  const last = data[data.length - 1].adjusted_close * scale
  const prev = data[data.length - 2].adjusted_close * scale
  const change = last - prev
  return { label: '', value: last, change, changePct: (change / prev) * 100 }
}

function computeMcmerica(data: PricePoint[] | undefined): IndexData | null {
  if (!data || data.length < 2) return null
  const basePoint = data.find((p) => p.date === MCMERICA_BASE_DATE)
  const basePrice = basePoint ? basePoint.adjusted_close : data[data.length - 1].adjusted_close
  const last = MCMERICA_BASE_VALUE * (data[data.length - 1].adjusted_close / basePrice)
  const prev = MCMERICA_BASE_VALUE * (data[data.length - 2].adjusted_close / basePrice)
  const change = last - prev
  return { label: '', value: last, change, changePct: (change / prev) * 100 }
}

interface TickerBannerProps {
  priceData: Record<string, PricePoint[]> | null
}

function IndexItem({ label, idx, decimals = 2 }: { label: string; idx: IndexData; decimals?: number }) {
  const isUp = idx.change >= 0
  const color = isUp ? '#10B981' : '#EF4444'
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-white/70">{label}</span>
      <span className="text-[11px] font-semibold text-white tabular-nums" style={{ fontFamily: MONO }}>
        {idx.value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      </span>
      <span className="text-[11px] tabular-nums" style={{ fontFamily: MONO, color }}>
        {isUp ? '\u25B2' : '\u25BC'} {isUp ? '+' : ''}{idx.changePct.toFixed(2)}%
      </span>
    </div>
  )
}

export default function TickerBanner({ priceData }: TickerBannerProps) {
  const indices = useMemo(() => {
    if (!priceData) return null
    const mc = computeMcmerica(priceData['MCMERICA-25'])
    const sp = computeIndex(priceData['VOO'], SP500_SCALE)
    const dow = computeIndex(priceData['DIA'], DOW_SCALE)
    return { mc, sp, dow }
  }, [priceData])

  if (!indices || (!indices.mc && !indices.sp && !indices.dow)) {
    return (
      <div className="flex-shrink-0 h-7 bg-[#1a1a1a] flex items-center justify-center">
        <span className="text-[11px] text-white/40 font-mono">Loading indices...</span>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 h-7 bg-[#1a1a1a] flex items-center justify-center gap-6 px-4 overflow-hidden whitespace-nowrap">
      {indices.mc && <IndexItem label="McMerica 25" idx={indices.mc} />}
      {indices.mc && indices.sp && <span className="text-white/20">|</span>}
      {indices.sp && <IndexItem label="S&P 500" idx={indices.sp} />}
      {indices.sp && indices.dow && <span className="text-white/20">|</span>}
      {indices.dow && <IndexItem label="Dow" idx={indices.dow} decimals={0} />}
    </div>
  )
}
