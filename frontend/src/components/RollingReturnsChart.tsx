import { useRef, useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import type { RollingReturnPoint } from '../utils/calculations'

type RollingWindow = 12 | 36 | 60

interface RollingReturnsChartProps {
  data: RollingReturnPoint[]
  window: RollingWindow
  onWindowChange: (w: RollingWindow) => void
}

const MARGIN = { top: 12, right: 24, bottom: 32, left: 56 }
const EASE = d3.easeCubicOut
const DURATION = 200

const LINE_COLOR = '#C4692E' // burnt orange from palette
const AXIS_TEXT = '#7D7168'
const GRID_LINE = '#E0C9B1'
const ZERO_COLOR = '#BEB0A3'
const MONO_FONT = "'JetBrains Mono', ui-monospace, monospace"

const WINDOWS: { value: RollingWindow; label: string }[] = [
  { value: 12, label: '1Y' },
  { value: 36, label: '3Y' },
  { value: 60, label: '5Y' },
]

export default function RollingReturnsChart({ data, window: activeWindow, onWindowChange }: RollingReturnsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const initialized = useRef(false)
  const [, setResizeTick] = useState(0)

  const parsed = useMemo(() => {
    if (data.length === 0) return []
    return data.map((d) => ({ date: new Date(d.date), value: d.return }))
  }, [data])

  useEffect(() => {
    const container = containerRef.current
    const svg = svgRef.current
    if (!container || !svg || parsed.length === 0) return

    const { width: W, height: H } = container.getBoundingClientRect()
    if (W === 0 || H === 0) return

    const w = W - MARGIN.left - MARGIN.right
    const h = H - MARGIN.top - MARGIN.bottom

    const sel = d3.select(svg).attr('width', W).attr('height', H)

    const xExtent = d3.extent(parsed, (d) => d.date) as [Date, Date]
    const yMax = d3.max(parsed, (d) => d.value) ?? 0.1
    const yMin = d3.min(parsed, (d) => d.value) ?? -0.1
    const absMax = Math.max(Math.abs(yMax), Math.abs(yMin), 0.02) * 1.15

    const x = d3.scaleTime().domain(xExtent).range([0, w])
    const y = d3.scaleLinear().domain([-absMax, absMax]).nice().range([h, 0])

    const line = d3
      .line<{ date: Date; value: number }>()
      .x((d) => x(d.date))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX)

    if (!initialized.current) {
      sel.selectAll('*').remove()

      const g = sel.append('g')
        .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)
        .attr('class', 'chart-g')

      g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${h})`)
      g.append('g').attr('class', 'y-axis')
      g.append('line').attr('class', 'zero-line')
      g.append('path').attr('class', 'line-path')

      initialized.current = true
    }

    const g = sel.select<SVGGElement>('.chart-g')

    const xAxis = d3.axisBottom(x)
      .ticks(Math.min(parsed.length, 8))
      .tickFormat(d3.timeFormat('%Y') as any)
      .tickSize(0)
      .tickPadding(8)

    const yAxis = d3.axisLeft(y)
      .ticks(5)
      .tickFormat((d) => `${d3.format('+.0%')(d as number)}`)
      .tickSize(-w)
      .tickPadding(6)

    g.select<SVGGElement>('.x-axis')
      .transition().duration(DURATION).ease(EASE)
      .call(xAxis)
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick text').attr('fill', AXIS_TEXT).attr('font-size', '9px').attr('font-family', MONO_FONT))
      .call((g) => g.selectAll('.tick line').remove())

    g.select<SVGGElement>('.y-axis')
      .transition().duration(DURATION).ease(EASE)
      .call(yAxis)
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick text').attr('fill', AXIS_TEXT).attr('font-size', '10px').attr('font-family', MONO_FONT))
      .call((g) => g.selectAll('.tick line').attr('stroke', GRID_LINE).attr('stroke-opacity', 0.4).attr('stroke-dasharray', '2,3'))

    g.select('.zero-line')
      .transition().duration(DURATION).ease(EASE)
      .attr('x1', 0).attr('x2', w)
      .attr('y1', y(0)).attr('y2', y(0))
      .attr('stroke', ZERO_COLOR)
      .attr('stroke-dasharray', '6,4')
      .attr('stroke-width', 1)

    g.select('.line-path')
      .datum(parsed)
      .transition().duration(DURATION).ease(EASE)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', LINE_COLOR)
      .attr('stroke-width', 2)

  }, [parsed])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      initialized.current = false
      setResizeTick((t) => t + 1)
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="w-full h-full flex flex-col">
      {/* Window selector */}
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 flex-shrink-0">
        <span className="text-[10px] text-warm-300 mr-1">Rolling</span>
        {WINDOWS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onWindowChange(value)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
              activeWindow === value
                ? 'bg-warm-50 text-surface-0'
                : 'text-warm-300 hover:text-warm-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="flex-1 min-h-0">
        {data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-xs text-warm-300">Not enough data for this window</p>
          </div>
        ) : (
          <svg ref={svgRef} className="w-full h-full" />
        )}
      </div>
    </div>
  )
}
