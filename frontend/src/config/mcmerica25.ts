import type { CustomFund } from '../types'

export const MCMERICA_25_ID = 'MCMERICA-25'
export const MCMERICA_25_COLOR = '#B8960C' // gold

/**
 * The McMerica 25 — "The 25 Most American Stocks"
 * Constituents per MCMERICA_25.txt
 */
export const MCMERICA_25_TICKERS = [
  'CVX',   // Chevron
  'MCD',   // McDonalds
  'PEP',   // Pepsi
  'COST',  // Costco
  'BRK-B', // Berkshire Hathaway
  'PM',    // Philip Morris
  'WDC',   // Western Digital
  'DD',    // DuPont
  'JNJ',   // Johnson & Johnson
  'F',     // Ford
  'COP',   // ConocoPhillips
  'WMT',   // Walmart
  'TAP',   // Molson Coors
  'FCX',   // Freeport-McMoRan
  'HD',    // Home Depot
  'HOG',   // Harley-Davidson
  'AAL',   // American Airlines
  'MAR',   // Marriott
  'AXP',   // American Express
  'JPM',   // JPMorgan Chase
  'CAT',   // Caterpillar
  'GD',    // General Dynamics
  'T',     // AT&T
  'DIS',   // Disney
  'DE',    // Deere & Company
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
