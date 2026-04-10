import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ALL_TICKERS } from '../hooks/usePortfolio'
import { FUND_META } from '../types'

interface FundTrayProps {
  activeTickers: Set<string>
  isFull: boolean
}

function DraggableFund({
  ticker,
  disabled,
  isActive,
}: {
  ticker: string
  disabled: boolean
  isActive: boolean
}) {
  const meta = FUND_META[ticker] ?? { name: ticker, color: '#990F3D' }
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticker,
    disabled,
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={[
        'flex items-center gap-2 px-2.5 py-[7px] rounded-md transition-colors duration-100 select-none',
        isDragging
          ? 'bg-surface-2 shadow-lg ring-1 ring-border'
          : disabled
            ? 'opacity-30 cursor-not-allowed'
            : 'hover:bg-surface-0 cursor-grab active:cursor-grabbing',
      ].join(' ')}
    >
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: meta.color }}
      />
      <span className="text-xs font-medium text-warm-50 leading-none">
        {ticker}
      </span>
      <span className="text-[11px] text-warm-200 truncate flex-1">
        {meta.name}
      </span>

      {isActive && (
        <span className="text-[10px] text-warm-300 flex-shrink-0">In use</span>
      )}

      {!disabled && !isDragging && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          className="flex-shrink-0 text-warm-400"
        >
          <circle cx="4" cy="3" r="1" fill="currentColor" />
          <circle cx="4" cy="6" r="1" fill="currentColor" />
          <circle cx="4" cy="9" r="1" fill="currentColor" />
          <circle cx="8" cy="3" r="1" fill="currentColor" />
          <circle cx="8" cy="6" r="1" fill="currentColor" />
          <circle cx="8" cy="9" r="1" fill="currentColor" />
        </svg>
      )}
    </div>
  )
}

export default function FundTray({ activeTickers, isFull }: FundTrayProps) {
  return (
    <div>
      <div className="px-3.5 py-2 border-b border-border flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-warm-200">
          Funds
        </p>
        {isFull && (
          <p className="text-[10px] text-warm-300">Full</p>
        )}
      </div>

      <div className="p-1.5 space-y-px">
        {ALL_TICKERS.map((ticker) => {
          const isActive = activeTickers.has(ticker)
          const disabled = isActive || isFull
          return (
            <DraggableFund
              key={ticker}
              ticker={ticker}
              disabled={disabled}
              isActive={isActive}
            />
          )
        })}
      </div>
    </div>
  )
}
