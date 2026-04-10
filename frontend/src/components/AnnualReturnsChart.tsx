import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import type { AnnualReturn } from '../utils/calculations'

interface AnnualReturnsChartProps {
  data: AnnualReturn[]
  fixedYMax: number | null
}

const MARGIN = { top: 16, right: 16, bottom: 32, left: 48 }
const EASE = d3.easeCubicOut
const DURATION = 200
const POS_COLOR = '#1D7B45'
const NEG_COLOR = '#C0392B'
const AXIS_TEXT = '#7D7168'
const GRID_LINE = '#E0C9B1'
const ZERO_LINE = '#BEB0A3'
const MONO_FONT = "'JetBrains Mono', ui-monospace, monospace"

export default function AnnualReturnsChart({ data, fixedYMax }: AnnualReturnsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const initialized = useRef(false)
  const [resizeTick, setResizeTick] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    const svg = svgRef.current
    if (!container || !svg || data.length === 0) return

    const { width: W, height: H } = container.getBoundingClientRect()
    if (W === 0 || H === 0) return

    const w = W - MARGIN.left - MARGIN.right
    const h = H - MARGIN.top - MARGIN.bottom

    const sel = d3.select(svg).attr('width', W).attr('height', H)

    const x = d3
      .scaleBand()
      .domain(data.map((d) => String(d.year)))
      .range([0, w])
      .padding(0.25)

    const maxAbs = fixedYMax ?? Math.max(
      d3.max(data, (d) => Math.abs(d.return)) ?? 0.1,
      0.02,
    )
    const y = d3.scaleLinear().domain([-maxAbs * 1.15, maxAbs * 1.15]).nice().range([h, 0])

    if (!initialized.current) {
      sel.selectAll('*').remove()
      const g = sel.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`).attr('class', 'chart-g')
      g.append('g').attr('class', 'x-axis')
      g.append('g').attr('class', 'y-axis')
      g.append('line').attr('class', 'zero-line')
      g.append('g').attr('class', 'bars')
      initialized.current = true
    }

    const g = sel.select<SVGGElement>('.chart-g')

    const xAxis = d3.axisBottom(x).tickSize(0).tickPadding(6)
    const yAxis = d3
      .axisLeft(y)
      .ticks(5)
      .tickFormat((d) => `${d3.format('+.0%')(d as number)}`)
      .tickSize(-w)
      .tickPadding(6)

    g.select<SVGGElement>('.x-axis')
      .attr('transform', `translate(0,${h})`)
      .transition().duration(DURATION).ease(EASE)
      .call(xAxis)
      .call((g) => g.select('.domain').remove())
      .call((g) =>
        g.selectAll('.tick text')
          .attr('fill', AXIS_TEXT)
          .attr('font-size', data.length > 12 ? '8px' : '9px')
          .attr('font-family', MONO_FONT),
      )
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
      .attr('stroke', ZERO_LINE)
      .attr('stroke-width', 1)

    const barsG = g.select<SVGGElement>('.bars')
    const bars = barsG.selectAll<SVGRectElement, AnnualReturn>('rect').data(data, (d) => String(d.year))

    const enter = bars
      .enter()
      .append('rect')
      .attr('rx', 2)
      .attr('x', (d) => x(String(d.year))!)
      .attr('width', x.bandwidth())
      .attr('y', y(0))
      .attr('height', 0)

    enter
      .merge(bars)
      .transition().duration(DURATION).ease(EASE)
      .attr('x', (d) => x(String(d.year))!)
      .attr('width', x.bandwidth())
      .attr('y', (d) => (d.return >= 0 ? y(d.return) : y(0)))
      .attr('height', (d) => Math.abs(y(d.return) - y(0)))
      .attr('fill', (d) => (d.return >= 0 ? POS_COLOR : NEG_COLOR))
      .attr('opacity', 0.85)

    bars.exit().transition().duration(DURATION).ease(EASE).attr('height', 0).attr('y', y(0)).remove()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, fixedYMax, resizeTick])

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
