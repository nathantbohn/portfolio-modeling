import { FUND_META, type Allocation } from '../types'

/**
 * URL format:
 *   ?funds=VOO:60,BND:40&principal=10000&contribute=500
 *    &rebalance=true&totalReturn=true&benchmark=false&rolling=12
 */

export interface UrlState {
  funds?: Allocation[]
  principal?: number
  contribute?: number
  rebalance?: boolean
  totalReturn?: boolean
  benchmark?: boolean
  rolling?: 12 | 36 | 60
}

const validTickers = new Set<string>(Object.keys(FUND_META))

export function parseUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search)
  const state: UrlState = {}

  const fundsStr = params.get('funds')
  if (fundsStr) {
    const parsed: Allocation[] = []
    for (const part of fundsStr.split(',')) {
      const [ticker, weightStr] = part.split(':')
      if (!ticker || !validTickers.has(ticker)) continue
      const weight = parseFloat(weightStr)
      if (isNaN(weight) || weight < 0) continue
      if (!parsed.some((f) => f.ticker === ticker)) {
        parsed.push({ ticker, weight })
      }
    }
    if (parsed.length > 0) state.funds = parsed
  }

  const principal = params.get('principal')
  if (principal != null) {
    const v = parseInt(principal, 10)
    if (!isNaN(v) && v >= 0) state.principal = v
  }

  const contribute = params.get('contribute')
  if (contribute != null) {
    const v = parseInt(contribute, 10)
    if (!isNaN(v) && v >= 0) state.contribute = v
  }

  const rebalance = params.get('rebalance')
  if (rebalance != null) state.rebalance = rebalance !== 'false'

  const totalReturn = params.get('totalReturn')
  if (totalReturn != null) state.totalReturn = totalReturn !== 'false'

  const benchmark = params.get('benchmark')
  if (benchmark != null) state.benchmark = benchmark === 'true'

  const rolling = params.get('rolling')
  if (rolling != null) {
    const v = parseInt(rolling, 10)
    if (v === 12 || v === 36 || v === 60) state.rolling = v
  }

  return state
}

export function buildShareUrl(state: {
  funds: Allocation[]
  principal: number
  contribute: number
  rebalance: boolean
  totalReturn: boolean
  benchmark: boolean
  rolling: 12 | 36 | 60
}): string {
  const params = new URLSearchParams()

  const fundsStr = state.funds
    .map((f) => `${f.ticker}:${Math.round(f.weight * 100) / 100}`)
    .join(',')
  params.set('funds', fundsStr)

  params.set('principal', String(state.principal))

  if (state.contribute > 0) params.set('contribute', String(state.contribute))
  if (!state.rebalance) params.set('rebalance', 'false')
  if (!state.totalReturn) params.set('totalReturn', 'false')
  if (state.benchmark) params.set('benchmark', 'true')
  if (state.rolling !== 12) params.set('rolling', String(state.rolling))

  return `${window.location.origin}${window.location.pathname}?${params.toString()}`
}
