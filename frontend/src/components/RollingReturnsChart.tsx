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
const TOOLTIP_BG = '#FFF1E5'
const TOOLTIP_BORDER = '#E0C9B1'
const TOOLTIP_TEXT = '#33302E'
const dateFmt = d3.timeFormat('%b %Y')
const pctFmt = (n: number) => (n >= 0 ? '+' : '') + d3.format('.2%')(n)

const WINDOWS: { value: RollingWindow; label: string }[] = [
  { value: 12, label: '1Y' },
  { value: 36, label: '3Y' },
  { value: 60, label: '5Y' },
]

export default function RollingReturnsChart({ data, window: activeWindow, onWindowChange }: RollingReturnsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const [resizeTick, setResizeTick] = useState(0)

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

      // Tooltip overlay elements
      g.append('line').attr('class', 'crosshair')
        .attr('stroke', AXIS_TEXT).attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3').attr('opacity', 0)
        .attr('pointer-events', 'none')
      g.append('circle').attr('class', 'hover-dot')
        .attr('r', 4).attr('fill', LINE_COLOR).attr('stroke', '#fff')
        .attr('stroke-width', 1.5).attr('opacity', 0)
        .attr('pointer-events', 'none')
      g.append('rect').attr('class', 'hover-overlay')
        .attr('width', w).attr('height', h)
        .attr('fill', 'none').attr('pointer-events', 'all')

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

    // ── Tooltip interaction ─────────────────────────────────────────────
    const overlay = g.select<SVGRectElement>('.hover-overlay')
      .attr('width', w).attr('height', h)
    const crosshair = g.select<SVGLineElement>('.crosshair')
    const hoverDot = g.select<SVGCircleElement>('.hover-dot')
    const tooltip = tooltipRef.current
    const bisect = d3.bisector<{ date: Date; value: number }, Date>((d) => d.date).left

    overlay.on('mousemove', (event: MouseEvent) => {
      const [mx] = d3.pointer(event)
      const dateAtMouse = x.invert(mx)
      let idx = bisect(parsed, dateAtMouse, 1)
      if (idx >= parsed.length) idx = parsed.length - 1
      if (idx > 0) {
        const d0 = parsed[idx - 1], d1 = parsed[idx]
        if (+dateAtMouse - +d0.date < +d1.date - +dateAtMouse) idx = idx - 1
      }
      const pt = parsed[idx]
      const px = x(pt.date)
      const py = y(pt.value)

      crosshair.attr('x1', px).attr('x2', px).attr('y1', 0).attr('y2', h).attr('opacity', 1)
      hoverDot.attr('cx', px).attr('cy', py).attr('opacity', 1)

      if (tooltip) {
        const color = pt.value >= 0 ? '#1D7B45' : '#C0392B'
        tooltip.innerHTML =
          `<div style="font-size:11px;font-weight:600;margin-bottom:3px">${dateFmt(pt.date)}</div>` +
          `<div style="color:${color}">${pctFmt(pt.value)}</div>`
        tooltip.style.opacity = '1'
        const tipW = tooltip.offsetWidth
        const tipH = tooltip.offsetHeight
        const left = px + MARGIN.left + 12
        const flipped = left + tipW > W - 8
        tooltip.style.left = (flipped ? px + MARGIN.left - tipW - 12 : left) + 'px'
        tooltip.style.top = Math.max(4, py + MARGIN.top - tipH / 2) + 'px'
      }
    })

    overlay.on('mouseleave', () => {
      crosshair.attr('opacity', 0)
      hoverDot.attr('opacity', 0)
      if (tooltip) tooltip.style.opacity = '0'
    })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, resizeTick])

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
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-xs text-warm-300">Not enough data for this window</p>
          </div>
        ) : (
          <>
            <svg ref={svgRef} className="w-full h-full" />
            <div
              ref={tooltipRef}
              style={{
                position: 'absolute', top: 0, left: 0, opacity: 0,
                pointerEvents: 'none', transition: 'opacity 0.1s',
                background: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`,
                borderRadius: 6, padding: '6px 10px',
                fontFamily: MONO_FONT, fontSize: 11, lineHeight: 1.5,
                color: TOOLTIP_TEXT, whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
