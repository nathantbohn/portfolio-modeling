import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ALL_TICKERS } from '../hooks/usePortfolio'
import { FUND_META } from '../types'
import type { CustomFund } from '../types'

interface FundTrayProps {
  activeTickers: Set<string>
  isFull: boolean
  customFunds: CustomFund[]
  mcmerica: { id: string; name: string; color: string; ready: boolean } | null
  onOpenBuilder: () => void
}

function DraggableFund({
  ticker,
  disabled,
  isActive,
  nameOverride,
  colorOverride,
  isCustom,
}: {
  ticker: string
  disabled: boolean
  isActive: boolean
  nameOverride?: string
  colorOverride?: string
  isCustom?: boolean
}) {
  const meta = FUND_META[ticker]
  const name = nameOverride ?? meta?.name ?? ticker
  const color = colorOverride ?? meta?.color ?? '#990F3D'
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
        isCustom ? 'border border-dashed border-warm-400/30' : '',
        isDragging
          ? 'bg-surface-2 shadow-lg ring-1 ring-border'
          : disabled
            ? 'opacity-30 cursor-not-allowed'
            : 'hover:bg-surface-0 cursor-grab active:cursor-grabbing',
      ].join(' ')}
    >
      {isCustom ? (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
          <rect x="1" y="1" width="8" height="8" rx="2" stroke={color} strokeWidth="1.5" fill="none" />
          <path d="M3.5 5h3M5 3.5v3" stroke={color} strokeWidth="1" strokeLinecap="round" />
        </svg>
      ) : (
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="text-xs font-medium text-warm-50 leading-none truncate" style={isCustom ? { color } : undefined}>
        {isCustom ? name : ticker}
      </span>
      {!isCustom && (
        <span className="text-[11px] text-warm-200 truncate flex-1">
          {name}
        </span>
      )}

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

function McMericaDraggable({
  id, name, color, ready, disabled, isActive,
}: {
  id: string; name: string; color: string; ready: boolean; disabled: boolean; isActive: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled: disabled || !ready,
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
        'flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-150 select-none',
        isDragging
          ? 'bg-[#3D3520] shadow-lg border-[#B8960C]/50'
          : disabled
            ? 'opacity-40 cursor-not-allowed border-[#B8960C]/20 bg-[#33302E]'
            : 'border-[#B8960C]/30 bg-[#33302E] hover:border-[#B8960C]/60 hover:bg-[#3D3520] cursor-grab active:cursor-grabbing',
      ].join(' ')}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
        <path d="M8 1L10.5 6H5.5L8 1Z" fill={color} />
        <rect x="3" y="7" width="10" height="7" rx="1" fill={color} fillOpacity="0.8" />
        <path d="M5.5 9.5H10.5M5.5 11.5H10.5" stroke="#33302E" strokeWidth="0.8" />
      </svg>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold tracking-wide" style={{ color }}>
            {name}
          </span>
          {!ready && <span className="text-[9px] text-warm-400 animate-pulse">Loading…</span>}
        </div>
        <span className="text-[9px] text-warm-300 leading-none">The 25 Most American Stocks</span>
      </div>
      {isActive && (
        <span className="text-[9px] text-warm-300 flex-shrink-0">In use</span>
      )}
      {!disabled && ready && !isDragging && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="flex-shrink-0 text-warm-400">
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

export default function FundTray({ activeTickers, isFull, customFunds, mcmerica, onOpenBuilder }: FundTrayProps) {
  return (
    <div>
      {/* McMerica 25 — flagship index */}
      {mcmerica && (
        <div className="px-1.5 pt-1.5 pb-0.5">
          <McMericaDraggable
            id={mcmerica.id}
            name={mcmerica.name}
            color={mcmerica.color}
            ready={mcmerica.ready}
            disabled={activeTickers.has(mcmerica.id) || isFull}
            isActive={activeTickers.has(mcmerica.id)}
          />
        </div>
      )}

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

        {/* Custom funds */}
        {customFunds.length > 0 && (
          <>
            <div className="h-px bg-border my-1.5" />
            {customFunds.map((fund) => {
              const isActive = activeTickers.has(fund.id)
              const disabled = isActive || isFull
              return (
                <DraggableFund
                  key={fund.id}
                  ticker={fund.id}
                  disabled={disabled}
                  isActive={isActive}
                  nameOverride={fund.name}
                  colorOverride={fund.color}
                  isCustom
                />
              )
            })}
          </>
        )}

        {/* Build custom fund button */}
        <button
          onClick={onOpenBuilder}
          className="w-full flex items-center gap-2 px-2.5 py-[7px] rounded-md text-warm-300 hover:text-warm-100 hover:bg-surface-0 transition-colors mt-1"
          type="button"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="text-[11px]">Build Custom Fund</span>
        </button>
      </div>
    </div>
  )
}
