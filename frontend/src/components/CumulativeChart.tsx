import { useRef, useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import type { CumulativePoint } from '../utils/calculations'

interface CumulativeChartProps {
  data: CumulativePoint[]
  dividendData: CumulativePoint[]
  benchmarkData: CumulativePoint[]
  principal: number
}

const MARGIN = { top: 20, right: 24, bottom: 32, left: 64 }
const EASE = d3.easeCubicOut
const DURATION = 200

const ACCENT = '#990F3D'
const DIVIDEND_COLOR = '#2A6B6B' // deep teal
const BENCHMARK_COLOR = '#7D7168' // muted warm gray
const AXIS_TEXT = '#7D7168'
const GRID_LINE = '#E0C9B1'
const BASELINE_COLOR = '#BEB0A3'
const MONO_FONT = "'JetBrains Mono', ui-monospace, monospace"

export default function CumulativeChart({ data, dividendData, benchmarkData, principal }: CumulativeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const initialized = useRef(false)
  const [, setResizeTick] = useState(0)

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
    let yMax = d3.max(parsed, (d) => d.value) ?? principal
    let yMin = Math.min(d3.min(parsed, (d) => d.value) ?? principal, principal)
    if (showDividend) {
      const divMax = d3.max(parsedDividend, (d) => d.value) ?? 0
      const divMin = d3.min(parsedDividend, (d) => d.value) ?? 0
      yMax = Math.max(yMax, divMax)
      yMin = Math.min(yMin, divMin)
    }
    if (showBenchmark) {
      const bmMax = d3.max(parsedBenchmark, (d) => d.value) ?? principal
      const bmMin = d3.min(parsedBenchmark, (d) => d.value) ?? principal
      yMax = Math.max(yMax, bmMax)
      yMin = Math.min(yMin, bmMin)
    }

    const x = d3.scaleTime().domain(xExtent).range([0, w])
    const y = d3.scaleLinear().domain([yMin * 0.95, yMax * 1.05]).nice().range([h, 0])

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
      g.append('path').attr('class', 'benchmark-path')
      g.append('path').attr('class', 'div-area-path')
      g.append('path').attr('class', 'div-line-path')
      g.append('g').attr('class', 'legend')

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

    g.select('.baseline')
      .transition().duration(DURATION).ease(EASE)
      .attr('x1', 0).attr('x2', w)
      .attr('y1', y(principal)).attr('y2', y(principal))
      .attr('stroke', BASELINE_COLOR)
      .attr('stroke-dasharray', '6,4')
      .attr('stroke-width', 1)

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

  }, [parsed, parsedDividend, showDividend, parsedBenchmark, showBenchmark, principal])

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
    <div ref={containerRef} className="w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  )
}
