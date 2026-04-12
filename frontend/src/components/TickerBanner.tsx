import type { PricePoint } from '../types'

const MONO = "'JetBrains Mono', ui-monospace, monospace"
const BASE_VALUE = 1000

interface TickerBannerProps {
  priceData: PricePoint[] | null
}

export default function TickerBanner({ priceData }: TickerBannerProps) {
  if (!priceData || priceData.length < 2) {
    return (
      <div className="flex-shrink-0 h-7 bg-[#33302E] flex items-center justify-center">
        <span className="text-[11px] text-warm-300 font-mono">McMerica 25</span>
      </div>
    )
  }

  // Scale from base: last value relative to first, normalized to BASE_VALUE
  const first = priceData[0].adjusted_close
  const last = priceData[priceData.length - 1].adjusted_close
  const prev = priceData[priceData.length - 2].adjusted_close

  const currentValue = BASE_VALUE * (last / first)
  const prevValue = BASE_VALUE * (prev / first)
  const change = currentValue - prevValue
  const changePct = (change / prevValue) * 100
  const isUp = change >= 0

  return (
    <div className="flex-shrink-0 h-7 bg-[#33302E] flex items-center justify-center gap-4 px-4 border-b border-[#4A4540]">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-wide" style={{ color: '#B8960C' }}>
          McMerica 25
        </span>
        <span className="text-[12px] font-semibold text-[#FFF1E5] tabular-nums" style={{ fontFamily: MONO }}>
          {currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span
          className="text-[11px] tabular-nums"
          style={{ fontFamily: MONO, color: isUp ? '#1D7B45' : '#C0392B' }}
        >
          {isUp ? '\u25B2' : '\u25BC'} {Math.abs(change).toFixed(2)}
        </span>
        <span
          className="text-[10px] tabular-nums"
          style={{ fontFamily: MONO, color: isUp ? '#1D7B45' : '#C0392B' }}
        >
          ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
        </span>
      </div>
    </div>
  )
}
