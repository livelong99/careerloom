// Tokens x dated price table (prices.json, refreshed from OpenRouter; user-overridable) -> overlay cost and the per-session ceiling.
import prices from './prices.json'

export type PriceTable = { asOf: string; models: Record<string, { promptUsdPerM: number; completionUsdPerM: number }> }
export interface CostMeter {
  /** Returns this call's cost. A provider-billed figure wins over the estimate. */
  add(model: string, promptTokens: number, completionTokens: number, billedUsd?: number | null): number
  totalUsd(): number
  exceeds(ceilingUsd: number): boolean
  /** Models used without a price entry: their cost is unknown, not zero. */
  unpriced(): string[]
}

export const defaultPrices: PriceTable = prices as PriceTable

export function estimateUsd(table: PriceTable, model: string, promptTokens: number, completionTokens: number): number | null {
  const p = table.models[model]
  return p ? (promptTokens * p.promptUsdPerM + completionTokens * p.completionUsdPerM) / 1e6 : null
}

export function createCostMeter(table: PriceTable = defaultPrices): CostMeter {
  let total = 0
  const missing = new Set<string>()
  return {
    add(model, promptTokens, completionTokens, billedUsd) {
      const cost = billedUsd ?? estimateUsd(table, model, promptTokens, completionTokens)
      if (cost === null) { missing.add(model); return 0 }
      total += cost
      return cost
    },
    totalUsd: () => total,
    exceeds: ceilingUsd => total >= ceilingUsd,
    unpriced: () => [...missing],
  }
}
