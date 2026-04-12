import type { CustomFund, PricePoint } from '../types'

/**
 * Synthesize a PricePoint[] for a custom fund from its constituent stock prices.
 * Computes weighted monthly returns and chains them into a synthetic price series.
 * Gracefully skips constituents with missing data and redistributes weights.
 */
export function synthesizePriceData(
  fund: CustomFund,
  stockPrices: Record<string, PricePoint[]>,
): PricePoint[] {
  const { stocks, weightMode } = fund
  if (stocks.length === 0) return []

  // Filter to stocks that have price data available
  const available = stocks.filter(
    (s) => stockPrices[s.ticker] && stockPrices[s.ticker].length > 0,
  )
  if (available.length === 0) return []

  // Normalize weights among available stocks
  const rawWeights = available.map((s) =>
    weightMode === 'equal' ? 1 : s.weight,
  )
  const weightSum = rawWeights.reduce((a, b) => a + b, 0)
  const weights = rawWeights.map((w) => w / weightSum)

  // Build date→price maps for each available constituent
  const maps: { adj: Record<string, number>; close: Record<string, number> }[] = []
  for (const stock of available) {
    const points = stockPrices[stock.ticker]
    const adj: Record<string, number> = {}
    const close: Record<string, number> = {}
    for (const p of points) {
      adj[p.date] = p.adjusted_close
      close[p.date] = p.close
    }
    maps.push({ adj, close })
  }

  // Find intersection of dates (present in all available constituents)
  const firstDates = new Set(Object.keys(maps[0].adj))
  const commonDates: string[] = []
  for (const date of firstDates) {
    if (maps.every((m) => date in m.adj)) commonDates.push(date)
  }
  commonDates.sort()

  if (commonDates.length === 0) return []

  // Synthesize: chain weighted returns from a base of 100
  const BASE = 100
  const result: PricePoint[] = [
    { date: commonDates[0], adjusted_close: BASE, close: BASE },
  ]

  let adjValue = BASE
  let closeValue = BASE

  for (let i = 1; i < commonDates.length; i++) {
    const date = commonDates[i]
    const prevDate = commonDates[i - 1]

    let adjReturn = 0
    let closeReturn = 0
    for (let j = 0; j < available.length; j++) {
      const w = weights[j]
      adjReturn += w * (maps[j].adj[date] / maps[j].adj[prevDate])
      closeReturn += w * (maps[j].close[date] / maps[j].close[prevDate])
    }

    adjValue *= adjReturn
    closeValue *= closeReturn
    result.push({ date, adjusted_close: adjValue, close: closeValue })
  }

  return result
}
