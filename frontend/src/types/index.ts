export interface Fund {
  ticker: string
  name: string
  color: string
}

export const FUND_META: Record<string, { name: string; color: string }> = {
  VOO:  { name: 'Vanguard S&P 500',            color: '#8B1A2B' },  // burgundy
  BND:  { name: 'Vanguard Total Bond',          color: '#2A6B6B' },  // deep teal
  VXUS: { name: 'Vanguard Total Intl Stock',    color: '#C4692E' },  // burnt orange
  SCHD: { name: 'Schwab US Dividend Equity',    color: '#7A7A2E' },  // olive gold
  SCHF: { name: 'Schwab Intl Equity',           color: '#1E3A5F' },  // navy
  SCHI: { name: 'Schwab Intl Bond',             color: '#6B7F56' },  // sage green
  VTI:  { name: 'Vanguard Total Stock Market',  color: '#B5574A' },  // terracotta
  QQQ:  { name: 'Invesco NASDAQ-100',           color: '#6B3A5E' },  // warm plum
  BNDX: { name: 'Vanguard Total Intl Bond',     color: '#A15E30' },  // copper
  VBR:  { name: 'Vanguard Small-Cap Value',     color: '#8B5E3C' },  // sienna
}

export interface Allocation {
  ticker: string
  weight: number // 0–100
}

export interface PricePoint {
  date: string
  adjusted_close: number
  close: number
}

export type PriceData = Record<string, PricePoint[]>

export type ReturnSeries = { date: string; value: number }[]

export interface PortfolioStats {
  cagr: number
  annualizedVolatility: number
  maxDrawdown: number
  sharpeRatio: number
}
