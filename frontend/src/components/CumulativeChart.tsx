import { useRef, useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import type { CumulativePoint } from '../utils/calculations'

interface CumulativeChartProps {
  data: CumulativePoint[]
  capitalInvested: CumulativePoint[]
  dividendData: CumulativePoint[]
  benchmarkData: CumulativePoint[]
  principal: number
  fixedYMax: number | null
}

const MARGIN = { top: 20, right: 24, bottom: 32, left: 64 }
const EASE = d3.easeCubicOut
const DURATION = 200

const ACCENT = '#990F3D'
const DIVIDEND_COLOR = '#2A6B6B' // deep teal
const BENCHMARK_COLOR = '#7D7168' // muted warm gray
const CAPITAL_COLOR = '#BEB0A3' // warm baseline
const AXIS_TEXT = '#7D7168'
const GRID_LINE = '#E0C9B1'
const BASELINE_COLOR = '#BEB0A3'
const MONO_FONT = "'JetBrains Mono', ui-monospace, monospace"

const TOOLTIP_BG = '#FFF1E5'
const TOOLTIP_BORDER = '#E0C9B1'
const TOOLTIP_TEXT = '#33302E'

const dateFmt = d3.timeFormat('%b %Y')
const dollarFmt = (n: number) => '$' + d3.format(',.0f')(n)
const pctFmt = (n: number) => (n >= 0 ? '+' : '') + d3.format('.2%')(n)

export default function CumulativeChart({ data, capitalInvested, dividendData, benchmarkData, principal, fixedYMax }: CumulativeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const [resizeTick, setResizeTick] = useState(0)

  const parsed = useMemo(() => {
    if (data.length === 0) return []
    return data.map((d) => ({ date: new Date(d.date), value: d.value }))
  }, [data])

  const parsedDividend = useMemo(() => {
    if (dividendData.length === 0) return []
    return dividendData.map((d) => ({ date: new Date(d.date), value: d.value }))
  }, [dividendData])

  const parsedBenchmark = useMemo(() => {
    if (benchmarkData.length === 0) return []
    return benchmarkData.map((d) => ({ date: new Date(d.date), value: d.value }))
  }, [benchmarkData])

  const parsedCapital = useMemo(() => {
    if (capitalInvested.length === 0) return []
    return capitalInvested.map((d) => ({ date: new Date(d.date), value: d.value }))
  }, [capitalInvested])

  // Only show capital line when contributions make it differ from a flat principal
  const showCapital = parsedCapital.length > 1 &&
    parsedCapital[parsedCapital.length - 1].value > parsedCapital[0].value

  const showDividend = parsedDividend.length > 0
  const showBenchmark = parsedBenchmark.length > 0

  useEffect(() => {
    const container = containerRef.current
    const svg = svgRef.current
    if (!container || !svg) return

    const { width: W, height: H } = container.getBoundingClientRect()
    if (W === 0 || H === 0) return

    const w = W - MARGIN.left - MARGIN.right
    const h = H - MARGIN.top - MARGIN.bottom

    const sel = d3.select(svg).attr('width', W).attr('height', H)

    const xExtent = d3.extent(parsed, (d) => d.date) as [Date, Date]

    // Fixed Y range: floor at 0, ceiling from precomputed single-fund max
    const yFloor = 0
    let yCeil = fixedYMax ?? (d3.max(parsed, (d) => d.value) ?? principal)
    // Ensure overlay data (benchmark, capital, dividends) still fits
    if (showBenchmark) {
      const bmMax = d3.max(parsedBenchmark, (d) => d.value) ?? 0
      yCeil = Math.max(yCeil, bmMax)
    }
    if (showCapital) {
      const capMax = d3.max(parsedCapital, (d) => d.value) ?? 0
      yCeil = Math.max(yCeil, capMax)
    }

    const x = d3.scaleTime().domain(xExtent).range([0, w])
    const y = d3.scaleLinear().domain([yFloor, yCeil * 1.05]).nice().range([h, 0])

    const line = d3
      .line<{ date: Date; value: number }>()
      .x((d) => x(d.date))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX)

    const area = d3
      .area<{ date: Date; value: number }>()
      .x((d) => x(d.date))
      .y0(h)
      .y1((d) => y(d.value))
      .curve(d3.curveMonotoneX)

    if (!initialized.current) {
      sel.selectAll('*').remove()

      const defs = sel.append('defs')
      const grad = defs
        .append('linearGradient')
        .attr('id', 'area-grad')
        .attr('x1', '0')
        .attr('x2', '0')
        .attr('y1', '0')
        .attr('y2', '1')
      grad.append('stop').attr('offset', '0%').attr('stop-color', ACCENT).attr('stop-opacity', 0.15)
      grad.append('stop').attr('offset', '100%').attr('stop-color', ACCENT).attr('stop-opacity', 0.02)

      const divGrad = defs
        .append('linearGradient')
        .attr('id', 'div-area-grad')
        .attr('x1', '0')
        .attr('x2', '0')
        .attr('y1', '0')
        .attr('y2', '1')
      divGrad.append('stop').attr('offset', '0%').attr('stop-color', DIVIDEND_COLOR).attr('stop-opacity', 0.15)
      divGrad.append('stop').attr('offset', '100%').attr('stop-color', DIVIDEND_COLOR).attr('stop-opacity', 0.02)

      const g = sel.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`).attr('class', 'chart-g')

      g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${h})`)
      g.append('g').attr('class', 'y-axis')
      g.append('line').attr('class', 'baseline')
      g.append('path').attr('class', 'area-path')
      g.append('path').attr('class', 'line-path')
      g.append('path').attr('class', 'capital-path')
      g.append('path').attr('class', 'benchmark-path')
      g.append('path').attr('class', 'div-area-path')
      g.append('path').attr('class', 'div-line-path')
      g.append('g').attr('class', 'legend')

      // Tooltip overlay elements
      g.append('line').attr('class', 'crosshair')
        .attr('stroke', AXIS_TEXT).attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3').attr('opacity', 0)
        .attr('pointer-events', 'none')
      g.append('circle').attr('class', 'hover-dot')
        .attr('r', 4).attr('fill', ACCENT).attr('stroke', '#fff')
        .attr('stroke-width', 1.5).attr('opacity', 0)
        .attr('pointer-events', 'none')
      g.append('rect').attr('class', 'hover-overlay')
        .attr('width', w).attr('height', h)
        .attr('fill', 'none').attr('pointer-events', 'all')

      initialized.current = true
    }

    const g = sel.select<SVGGElement>('.chart-g')

    const xAxis = d3.axisBottom(x).ticks(Math.min(parsed.length, 8)).tickFormat(d3.timeFormat('%Y') as any).tickSize(0).tickPadding(8)
    const yAxis = d3.axisLeft(y).ticks(5).tickFormat((d) => `$${d3.format(',.0f')(d as number)}`).tickSize(-w).tickPadding(8)

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

    // Static baseline only when no contributions (capital line replaces it)
    g.select('.baseline')
      .transition().duration(DURATION).ease(EASE)
      .attr('x1', 0).attr('x2', w)
      .attr('y1', y(principal)).attr('y2', y(principal))
      .attr('stroke', BASELINE_COLOR)
      .attr('stroke-dasharray', '6,4')
      .attr('stroke-width', 1)
      .attr('opacity', showCapital ? 0 : 1)

    // Capital invested line (rising staircase when contributions active)
    if (showCapital) {
      const capLine = d3
        .line<{ date: Date; value: number }>()
        .x((d) => x(d.date))
        .y((d) => y(d.value))
        .curve(d3.curveStepAfter)

      g.select('.capital-path')
        .datum(parsedCapital)
        .transition().duration(DURATION).ease(EASE)
        .attr('d', capLine)
        .attr('fill', 'none')
        .attr('stroke', CAPITAL_COLOR)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '6,4')
    } else {
      g.select('.capital-path').attr('d', null)
    }

    g.select('.area-path')
      .datum(parsed)
      .transition().duration(DURATION).ease(EASE)
      .attr('d', area)
      .attr('fill', 'url(#area-grad)')

    g.select('.line-path')
      .datum(parsed)
      .transition().duration(DURATION).ease(EASE)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', ACCENT)
      .attr('stroke-width', 2)

    // ── Benchmark line ────────────────────────────────────────────────
    if (showBenchmark) {
      const bmLine = d3
        .line<{ date: Date; value: number }>()
        .x((d) => x(d.date))
        .y((d) => y(d.value))
        .curve(d3.curveMonotoneX)

      g.select('.benchmark-path')
        .datum(parsedBenchmark)
        .transition().duration(DURATION).ease(EASE)
        .attr('d', bmLine)
        .attr('fill', 'none')
        .attr('stroke', BENCHMARK_COLOR)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '6,4')
    } else {
      g.select('.benchmark-path').attr('d', null)
    }

    // ── Dividend line ──────────────────────────────────────────────────
    if (showDividend) {
      const divLine = d3
        .line<{ date: Date; value: number }>()
        .x((d) => x(d.date))
        .y((d) => y(d.value))
        .curve(d3.curveMonotoneX)

      const divArea = d3
        .area<{ date: Date; value: number }>()
        .x((d) => x(d.date))
        .y0(h)
        .y1((d) => y(d.value))
        .curve(d3.curveMonotoneX)

      g.select('.div-area-path')
        .datum(parsedDividend)
        .transition().duration(DURATION).ease(EASE)
        .attr('d', divArea)
        .attr('fill', 'url(#div-area-grad)')

      g.select('.div-line-path')
        .datum(parsedDividend)
        .transition().duration(DURATION).ease(EASE)
        .attr('d', divLine)
        .attr('fill', 'none')
        .attr('stroke', DIVIDEND_COLOR)
        .attr('stroke-width', 2)
    } else {
      g.select('.div-area-path').attr('d', null)
      g.select('.div-line-path').attr('d', null)
    }

    // ── Legend ──────────────────────────────────────────────────────────
    const legend = g.select('.legend')
    legend.selectAll('*').remove()
    const legendItems: { label: string; color: string; dashed?: boolean }[] = []
    if (showDividend) {
      legendItems.push({ label: 'Price Return', color: ACCENT })
      legendItems.push({ label: 'Cumulative Dividends', color: DIVIDEND_COLOR })
    }
    if (showCapital) {
      legendItems.push({ label: 'Capital Invested', color: CAPITAL_COLOR, dashed: true })
    }
    if (showBenchmark) {
      legendItems.push({ label: 'S&P 500 (VOO)', color: BENCHMARK_COLOR, dashed: true })
    }
    if (legendItems.length > 0) {
      legendItems.forEach((item, i) => {
        const lg = legend.append('g').attr('transform', `translate(${i * 150}, 0)`)
        lg.append('line')
          .attr('x1', 0).attr('x2', 16)
          .attr('y1', 0).attr('y2', 0)
          .attr('stroke', item.color)
          .attr('stroke-width', item.dashed ? 1.5 : 2)
          .attr('stroke-dasharray', item.dashed ? '6,4' : 'none')
        lg.append('text')
          .attr('x', 22)
          .attr('y', 0)
          .attr('dy', '0.35em')
          .attr('fill', AXIS_TEXT)
          .attr('font-size', '10px')
          .attr('font-family', MONO_FONT)
          .text(item.label)
      })
    }

    // ── Tooltip interaction ─────────────────────────────────────────────
    const overlay = g.select<SVGRectElement>('.hover-overlay')
      .attr('width', w).attr('height', h)
    const crosshair = g.select<SVGLineElement>('.crosshair')
    const hoverDot = g.select<SVGCircleElement>('.hover-dot')
    const tooltip = tooltipRef.current
    const bisect = d3.bisector<{ date: Date; value: number }, Date>((d) => d.date).left
    const startValue = parsed[0]?.value ?? principal

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
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:3px">${dateFmt(pt.date)}</div>`
        html += `<div>${dollarFmt(pt.value)}</div>`
        html += `<div style="color:${pt.value >= startValue ? '#1D7B45' : '#C0392B'}">${pctFmt(pt.value / startValue - 1)} return</div>`
        if (showCapital && idx < parsedCapital.length) {
          html += `<div style="color:${AXIS_TEXT}">${dollarFmt(parsedCapital[idx].value)} invested</div>`
        }
        tooltip.innerHTML = html
        tooltip.style.opacity = '1'
        // Position: flip if near right edge
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
  }, [parsed, parsedCapital, showCapital, parsedDividend, showDividend, parsedBenchmark, showBenchmark, principal, fixedYMax, resizeTick])

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

  if (data.length === 0) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center">
        <p className="text-xs text-warm-300">No data</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
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
    </div>
  )
}
