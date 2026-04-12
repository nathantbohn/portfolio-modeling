import type { CSSProperties } from 'react'
import { FUND_META } from '../types'
import type { Allocation } from '../types'

interface PortfolioSlotProps {
  fund: Allocation
  onSetWeight: (ticker: string, weight: number) => void
  onRemove: (ticker: string) => void
  onToggleLock: (ticker: string) => void
  canRemove: boolean
  nameOverride?: string
  colorOverride?: string
}

export default function PortfolioSlot({ fund, onSetWeight, onRemove, onToggleLock, canRemove, nameOverride, colorOverride }: PortfolioSlotProps) {
  const meta = FUND_META[fund.ticker] ?? { name: fund.ticker, color: '#990F3D' }
  const { ticker, weight, locked } = fund
  const color = colorOverride ?? meta.color
  const name = nameOverride ?? meta.name
  const isCustom = ticker.startsWith('CUSTOM-') || ticker.startsWith('MCMERICA-')

  const sliderStyle: CSSProperties = {
    '--track-fill': color,
    '--pct': `${weight}%`,
  } as CSSProperties

  return (
    <div className={[
      'relative rounded-md bg-surface-1 border border-border p-2.5 transition-colors duration-150',
      locked ? 'opacity-60' : 'hover:border-warm-400',
    ].join(' ')}>
      <div
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
        style={{ backgroundColor: color }}
      />

      <div className="pl-2.5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-baseline gap-1.5 min-w-0">
            {isCustom ? (
              <>
                <span
                  className="text-xs font-semibold tracking-wide truncate"
                  style={{ color }}
                >
                  {name}
                </span>
                <span className="text-[9px] text-warm-400 border border-warm-400/30 rounded px-1 py-px leading-none flex-shrink-0">Custom</span>
              </>
            ) : (
              <>
                <span
                  className="text-xs font-semibold tracking-wide flex-shrink-0"
                  style={{ color }}
                >
                  {ticker}
                </span>
                <span className="text-[10px] text-warm-200 truncate">{name}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
            <button
              onClick={() => onToggleLock(ticker)}
              className={[
                'transition-colors p-0.5 rounded flex-shrink-0',
                locked
                  ? 'text-warm-100 hover:text-warm-50'
                  : 'text-warm-400 hover:text-warm-200 hover:bg-surface-2',
              ].join(' ')}
              aria-label={locked ? `Unlock ${ticker}` : `Lock ${ticker}`}
              type="button"
            >
              {locked ? (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <button
              onClick={() => onRemove(ticker)}
              disabled={!canRemove}
              className="text-warm-300 hover:text-warm-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors p-0.5 rounded hover:bg-surface-2 flex-shrink-0"
              aria-label={`Remove ${ticker}`}
              type="button"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 2l8 8M10 2L2 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Slider + input in one row */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            className="fund-slider flex-1"
            min={0}
            max={100}
            step={0.1}
            value={weight}
            disabled={locked}
            onChange={(e) => onSetWeight(ticker, parseFloat(e.target.value))}
            style={sliderStyle}
          />
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={weight.toFixed(1)}
              disabled={locked}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) onSetWeight(ticker, v)
              }}
              className="w-[52px] bg-surface-1 border border-border rounded px-1.5 py-0.5 text-[11px] font-mono text-warm-50 text-right tabular-nums focus:outline-none focus:border-warm-300 transition-colors disabled:opacity-50"
            />
            <span className="text-warm-300 text-[11px]">%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
