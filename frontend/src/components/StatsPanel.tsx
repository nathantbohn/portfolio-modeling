import type { PortfolioResult } from '../utils/calculations'

interface StatsPanelProps {
  result: PortfolioResult | null
  principal: number
}

interface StatCardProps {
  label: string
  value: string
  color: 'green' | 'red' | 'neutral'
  sub?: string
}

function StatCard({ label, value, color, sub }: StatCardProps) {
  const colorClass =
    color === 'green'
      ? 'text-[#1D7B45]'
      : color === 'red'
        ? 'text-[#C0392B]'
        : 'text-warm-50'

  return (
    <div className="rounded-lg bg-surface-1 border border-border px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-widest text-warm-200 mb-1">
        {label}
      </p>
      <p className={`font-mono text-base font-semibold tabular-nums leading-none ${colorClass}`}>
        {value}
      </p>
      {sub && (
        <p className="font-mono text-[10px] text-warm-300 tabular-nums mt-1">{sub}</p>
      )}
    </div>
  )
}

function fmt(n: number, decimals = 2): string {
  return (n * 100).toFixed(decimals) + '%'
}

function fmtDollar(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function StatsPanel({ result, principal }: StatsPanelProps) {
  if (!result || result.cumulativeValues.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-2 h-full content-center">
        {['CAGR', 'Volatility', 'Max Drawdown', 'Sharpe Ratio'].map((label) => (
          <StatCard key={label} label={label} value="--" color="neutral" />
        ))}
      </div>
    )
  }

  const { cagr, useIRR, totalContributed, annualizedVolatility, maxDrawdown, sharpeRatio, cumulativeValues } = result
  const finalValue = cumulativeValues[cumulativeValues.length - 1]?.value ?? principal

  return (
    <div className="grid grid-cols-2 gap-2 h-full content-center">
      <StatCard
        label={useIRR ? 'IRR' : 'CAGR'}
        value={fmt(cagr)}
        color={cagr >= 0 ? 'green' : 'red'}
        sub={fmtDollar(finalValue) + (useIRR ? ' · ' + fmtDollar(totalContributed) + ' in' : '')}
      />
      <StatCard
        label="Volatility"
        value={fmt(annualizedVolatility)}
        color="neutral"
      />
      <StatCard
        label="Max Drawdown"
        value={fmt(maxDrawdown)}
        color={maxDrawdown > 0.2 ? 'red' : maxDrawdown > 0.1 ? 'neutral' : 'green'}
      />
      <StatCard
        label="Sharpe Ratio"
        value={sharpeRatio.toFixed(2)}
        color={sharpeRatio >= 0.5 ? 'green' : sharpeRatio < 0 ? 'red' : 'neutral'}
      />
    </div>
  )
}
