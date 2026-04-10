import { useMemo, useState, useEffect, useRef } from 'react'
import { animate } from 'framer-motion'
import type { Allocation } from '../types'
import { FUND_META } from '../types'

interface PieChartProps {
  allocations: Allocation[]
}

interface Wedge {
  ticker: string
  weight: number
  color: string
  startAngle: number
  endAngle: number
}

const SIZE = 200
const RADIUS = SIZE / 2
const DONUT_INNER = RADIUS * 0.58
const PIE_INNER = 0.5
const MIN_LABEL_ANGLE = 0.4
const EASING = [0.16, 1, 0.3, 1] as const

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle - Math.PI / 2),
    y: cy + r * Math.sin(angle - Math.PI / 2),
  }
}

function arcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle
  const ir = Math.max(innerR, 0.5)

  if (sweep >= Math.PI * 2 - 0.001) {
    const half = Math.PI
    const o1 = polarToCartesian(cx, cy, outerR, startAngle)
    const o2 = polarToCartesian(cx, cy, outerR, startAngle + half)
    const i1 = polarToCartesian(cx, cy, ir, startAngle)
    const i2 = polarToCartesian(cx, cy, ir, startAngle + half)
    return [
      `M ${o1.x} ${o1.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${o2.x} ${o2.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${o1.x} ${o1.y}`,
      `L ${i1.x} ${i1.y}`,
      `A ${ir} ${ir} 0 1 0 ${i2.x} ${i2.y}`,
      `A ${ir} ${ir} 0 1 0 ${i1.x} ${i1.y}`,
      'Z',
    ].join(' ')
  }

  const largeArc = sweep > Math.PI ? 1 : 0
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle)
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle)
  const innerStart = polarToCartesian(cx, cy, ir, startAngle)
  const innerEnd = polarToCartesian(cx, cy, ir, endAngle)

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${ir} ${ir} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function WedgePath({ wedge, innerR }: { wedge: Wedge; innerR: number }) {
  const d = arcPath(RADIUS, RADIUS, RADIUS - 2, innerR, wedge.startAngle, wedge.endAngle)
  const labelR = innerR < 2 ? RADIUS * 0.6 : (RADIUS + innerR) / 2
  const midAngle = (wedge.startAngle + wedge.endAngle) / 2
  const labelPos = polarToCartesian(RADIUS, RADIUS, labelR, midAngle)
  const showLabel = wedge.endAngle - wedge.startAngle >= MIN_LABEL_ANGLE

  return (
    <g>
      <path
        d={d}
        fill={wedge.color}
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
      />
      {showLabel && (
        <text
          x={labelPos.x}
          y={labelPos.y}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-white font-mono text-[10px] font-semibold pointer-events-none select-none"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
        >
          {Math.round(wedge.weight)}%
        </text>
      )}
    </g>
  )
}

export default function PieChart({ allocations }: PieChartProps) {
  const [isDonut, setIsDonut] = useState(true)
  const [innerR, setInnerR] = useState(DONUT_INNER)
  const controlRef = useRef<ReturnType<typeof animate> | null>(null)

  useEffect(() => {
    const target = isDonut ? DONUT_INNER : PIE_INNER
    controlRef.current?.stop()
    controlRef.current = animate(innerR, target, {
      duration: 0.3,
      ease: EASING,
      onUpdate: setInnerR,
    })
    return () => controlRef.current?.stop()
  }, [isDonut]) // eslint-disable-line react-hooks/exhaustive-deps

  const wedges = useMemo<Wedge[]>(() => {
    const nonZero = allocations.filter((a) => a.weight > 0)
    if (nonZero.length === 0) return []

    const total = nonZero.reduce((s, a) => s + a.weight, 0)
    let cursor = 0
    return nonZero.map((a) => {
      const fraction = a.weight / total
      const startAngle = cursor * Math.PI * 2
      cursor += fraction
      const endAngle = cursor * Math.PI * 2
      const meta = FUND_META[a.ticker]
      return {
        ticker: a.ticker,
        weight: a.weight,
        color: meta?.color ?? '#990F3D',
        startAngle,
        endAngle,
      }
    })
  }, [allocations])

  if (wedges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ width: SIZE, height: SIZE }}>
        <p className="text-[11px] text-warm-300">No funds allocated</p>
      </div>
    )
  }

  const holeR = Math.max(innerR - 1, 0)

  return (
    <div className="relative flex flex-col items-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="overflow-visible"
      >
        {wedges.map((w) => (
          <WedgePath key={w.ticker} wedge={w} innerR={innerR} />
        ))}

        <circle
          cx={RADIUS}
          cy={RADIUS}
          r={holeR}
          fill="#FFF1E5"
        />
      </svg>

      {/* Donut / Pie toggle */}
      <button
        type="button"
        onClick={() => setIsDonut((v) => !v)}
        className="mt-2 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] text-warm-300 hover:text-warm-100 hover:bg-surface-2 transition-colors duration-150"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="opacity-60">
          {isDonut ? (
            <>
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </>
          ) : (
            <>
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="8" y1="8" x2="8" y2="1" stroke="currentColor" strokeWidth="1.5" />
              <line x1="8" y1="8" x2="14" y2="11" stroke="currentColor" strokeWidth="1.5" />
            </>
          )}
        </svg>
        {isDonut ? 'Pie' : 'Donut'}
      </button>
    </div>
  )
}
