// TIER SYSTEM: Currently returns premium for all users. When auth is added,
// getCurrentTier will check the user's subscription status.

export type TierName = 'free' | 'premium'

export interface TierConfig {
  name: TierName
  maxFundsInPortfolio: number
  maxYearsHistory: number
  availableFunds: string[]
  features: string[]
}

const FREE_FUNDS = [
  'VOO', 'BND', 'VXUS', 'SCHD', 'SCHF',
  'SCHI', 'VTI', 'QQQ', 'BNDX', 'VBR',
]

const FREE_FEATURES = [
  'cumulative_chart',
  'annual_returns_chart',
  'basic_stats',
  'pie_chart',
  'rebalance_toggle',
  'dividend_toggle',
  'benchmark_comparison',
]

const PREMIUM_FEATURES = [
  ...FREE_FEATURES,
  'rolling_returns',
  'periodic_contributions',
  'shareable_links',
  'dividend_breakdown',
  'sortino_ratio',
  'correlation_matrix',
  'drawdown_chart',
  'custom_time_range',
  'export_reports',
]

export const TIERS: Record<TierName, TierConfig> = {
  free: {
    name: 'free',
    maxFundsInPortfolio: 4,
    maxYearsHistory: 15,
    availableFunds: FREE_FUNDS,
    features: FREE_FEATURES,
  },
  premium: {
    name: 'premium',
    maxFundsInPortfolio: 8,
    maxYearsHistory: 30,
    availableFunds: FREE_FUNDS, // expand when more funds are added
    features: PREMIUM_FEATURES,
  },
}

/** Returns the current user's tier. Change this when auth is added. */
export function getCurrentTier(): TierConfig {
  return TIERS.premium
}

/** Check whether the current tier includes a given feature. */
export function hasFeature(featureName: string): boolean {
  return getCurrentTier().features.includes(featureName)
}

/** Check whether a value is within the current tier's limit for a given key. */
export function isWithinLimit(
  limitName: 'maxFundsInPortfolio' | 'maxYearsHistory',
  value: number,
): boolean {
  return value <= getCurrentTier()[limitName]
}
