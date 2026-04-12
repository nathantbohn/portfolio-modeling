import type { PricePoint } from '../types'

const MONO = "'JetBrains Mono', ui-monospace, monospace"
const BASE_VALUE = 1000

interface TickerBannerProps {
  priceData: PricePoint[] | null
}

export default function TickerBanner({ priceData }: TickerBannerProps) {
  if (!priceData || priceData.length < 2) {
    return (
      <div className="flex-shrink-0 h-7 bg-[#1a1a1a] flex items-center justify-center">
        <span className="text-[11px] text-white/40 font-mono">McMerica 25</span>
      </div>
    )
  }

  const first = priceData[0].adjusted_close
  const last = priceData[priceData.length - 1].adjusted_close
  const prev = priceData[priceData.length - 2].adjusted_close

  const currentValue = BASE_VALUE * (last / first)
  const prevValue = BASE_VALUE * (prev / first)
  const change = currentValue - prevValue
  const changePct = (change / prevValue) * 100
  const isUp = change >= 0
  const changeColor = isUp ? '#10B981' : '#EF4444'

  return (
    <div className="flex-shrink-0 h-7 bg-[#1a1a1a] flex items-center justify-center gap-3 px-4">
      <span className="text-[11px] font-semibold text-white tracking-wide">McMerica 25</span>
      <span className="text-[11px] font-semibold text-white tabular-nums" style={{ fontFamily: MONO }}>
        {currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span className="text-[11px] tabular-nums" style={{ fontFamily: MONO, color: changeColor }}>
        {isUp ? '\u25B2' : '\u25BC'} {Math.abs(change).toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
      </span>
    </div>
  )
}
