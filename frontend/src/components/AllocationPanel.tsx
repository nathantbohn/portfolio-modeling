import { Droppable } from '@hello-pangea/dnd'
import type { Allocation } from '../types'
import PortfolioSlot from './PortfolioSlot'

interface AllocationPanelProps {
  activeFunds: Allocation[]
  onSetWeight: (ticker: string, weight: number) => void
  onRemove: (ticker: string) => void
}

export default function AllocationPanel({ activeFunds, onSetWeight, onRemove }: AllocationPanelProps) {
  const total = activeFunds.reduce((s, f) => s + f.weight, 0)
  const sumOk = Math.abs(total - 100) < 0.01

  return (
    <div>
      <div className="px-3.5 py-2 border-b border-border flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-warm-200">Portfolio</p>
        <div className="flex items-center gap-2">
          <span
            className={[
              'text-[11px] font-mono tabular-nums transition-colors',
              sumOk ? 'text-warm-300' : 'text-[#C0392B]',
            ].join(' ')}
          >
            {total.toFixed(1)}%
          </span>
          <span className="text-[10px] text-warm-300">{activeFunds.length}/4</span>
        </div>
      </div>

      <Droppable droppableId="portfolio">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={[
              'p-2 transition-colors duration-200',
              snapshot.isDraggingOver ? 'bg-surface-2/50' : '',
            ].join(' ')}
          >
            {activeFunds.length === 0 ? (
              <div className="py-6 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-warm-200 text-xs">Drag funds here</p>
                  <p className="text-warm-300 text-[11px] mt-0.5">Up to 4 funds</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {activeFunds.map((fund) => (
                  <PortfolioSlot
                    key={fund.ticker}
                    fund={fund}
                    onSetWeight={onSetWeight}
                    onRemove={onRemove}
                    canRemove={activeFunds.length > 1}
                  />
                ))}
              </div>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
