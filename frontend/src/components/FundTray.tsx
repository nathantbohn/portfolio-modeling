import { Droppable, Draggable } from '@hello-pangea/dnd'
import { ALL_TICKERS } from '../hooks/usePortfolio'
import { FUND_META } from '../types'

interface FundTrayProps {
  activeTickers: Set<string>
  isFull: boolean
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

      <Droppable droppableId="tray" isDropDisabled>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="p-1.5 space-y-px"
          >
            {ALL_TICKERS.map((ticker, index) => {
              const meta = FUND_META[ticker] ?? { name: ticker, color: '#990F3D' }
              const isActive = activeTickers.has(ticker)
              const disabled = isActive || isFull

              return (
                <Draggable
                  key={ticker}
                  draggableId={ticker}
                  index={index}
                  isDragDisabled={disabled}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={[
                        'flex items-center gap-2 px-2.5 py-[7px] rounded-md transition-colors duration-100 select-none',
                        snapshot.isDragging
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

                      {!disabled && !snapshot.isDragging && (
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
                  )}
                </Draggable>
              )
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
