import { useState } from 'react'
import type { Allocation } from '../types'

interface Preset {
  name: string
  subtitle: string
  funds: Allocation[]
}

const PRESETS: Preset[] = [
  {
    name: '60/40 Classic',
    subtitle: 'VOO 60 · BND 40',
    funds: [
      { ticker: 'VOO', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
  },
  {
    name: 'Boglehead 3-Fund',
    subtitle: 'VTI 60 · VXUS 30 · BND 10',
    funds: [
      { ticker: 'VTI', weight: 60 },
      { ticker: 'VXUS', weight: 30 },
      { ticker: 'BND', weight: 10 },
    ],
  },
  {
    name: 'Growth Tilt',
    subtitle: 'VOO 40 · QQQ 40 · VBR 20',
    funds: [
      { ticker: 'VOO', weight: 40 },
      { ticker: 'QQQ', weight: 40 },
      { ticker: 'VBR', weight: 20 },
    ],
  },
  {
    name: 'Dividend Focus',
    subtitle: 'SCHD 50 · VOO 30 · VBR 20',
    funds: [
      { ticker: 'SCHD', weight: 50 },
      { ticker: 'VOO', weight: 30 },
      { ticker: 'VBR', weight: 20 },
    ],
  },
  {
    name: 'All Weather',
    subtitle: 'VOO 30 · BND 40 · VXUS 15 · GLD 7.5 · DBC 7.5',
    funds: [
      { ticker: 'VOO', weight: 30 },
      { ticker: 'BND', weight: 40 },
      { ticker: 'VXUS', weight: 15 },
      { ticker: 'GLD', weight: 7.5 },
      { ticker: 'DBC', weight: 7.5 },
    ],
  },
]

interface PresetPortfoliosProps {
  onSelect: (funds: Allocation[]) => void
}

export default function PresetPortfolios({ onSelect }: PresetPortfoliosProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  return (
    <div>
      <div className="px-3.5 py-2 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-warm-200">
          Presets
        </p>
      </div>
      <div className="p-1.5 flex flex-wrap gap-1">
        {PRESETS.map((preset, i) => (
          <button
            key={preset.name}
            onClick={() => {
              setActiveIdx(i)
              onSelect(preset.funds.map((f) => ({ ...f })))
            }}
            title={preset.subtitle}
            className={[
              'px-2 py-1 rounded text-[11px] leading-tight transition-colors border',
              activeIdx === i
                ? 'bg-warm-50 text-surface-0 border-warm-50'
                : 'text-warm-200 border-border hover:text-warm-50 hover:border-warm-200',
            ].join(' ')}
          >
            <span className="font-medium">{preset.name}</span>
            <span className="block text-[9px] opacity-60 mt-px">{preset.subtitle}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
