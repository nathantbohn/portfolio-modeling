import type { CustomFund } from '../types'

export const MCMERICA_25_ID = 'MCMERICA-25'
export const MCMERICA_25_COLOR = '#B8960C' // gold

export const MCMERICA_25_TICKERS = [
  'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META',
  'JPM', 'JNJ', 'PG', 'KO', 'DIS',
  'HD', 'MCD', 'NKE', 'BA', 'CAT',
  'DE', 'F', 'GM', 'XOM', 'CVX',
  'WMT', 'COST', 'UNH', 'V', 'MA',
] as const

export const MCMERICA_25: CustomFund = {
  id: MCMERICA_25_ID,
  name: 'McMerica 25',
  color: MCMERICA_25_COLOR,
  weightMode: 'equal',
  stocks: MCMERICA_25_TICKERS.map((ticker) => ({
    ticker,
    name: ticker,
    weight: 100 / 25,
  })),
}
