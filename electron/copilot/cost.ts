// Tokens x dated price table (prices.json, refreshed from OpenRouter; user-overridable) -> overlay cost and the per-session ceiling.
import prices from './prices.json'

export type PriceTable = { asOf: string; models: Record<string, { promptUsdPerM: number; completionUsdPerM: number; cachedUsdPerM?: number }> }
export interface CostMeter {
  /** Returns this call's cost. A provider-billed figure wins over the estimate. */
  add(model: string, promptTokens: number, completionTokens: number, billedUsd?: number | null, cachedTokens?: number): number
  totalUsd(): number
  exceeds(ceilingUsd: number): boolean
  /** Models used without a price entry: their cost is unknown, not zero. */
  unpriced(): string[]
}

export const defaultPrices: PriceTable = prices as PriceTable

/** `promptTokens` includes the cached ones (OpenRouter reports cached_tokens as a subset); those bill at the cached rate when the table has one. */
export function estimateUsd(table: PriceTable, model: string, promptTokens: number, completionTokens: number, cachedTokens = 0): number | null {
  const p = table.models[model]
  if (!p) return null
  const cached = p.cachedUsdPerM === undefined ? 0 : Math.min(Math.max(cachedTokens, 0), promptTokens)
  return ((promptTokens - cached) * p.promptUsdPerM + cached * (p.cachedUsdPerM ?? 0) + completionTokens * p.completionUsdPerM) / 1e6
}

/** Plan §10 shape of one interview, shared by Settings pills and the cost report. */
export type InterviewShape = { answers: number; prefixTokens: number; freshTokens: number; outTokens: number }
export const DEFAULT_INTERVIEW: InterviewShape = { answers: 15, prefixTokens: 5000, freshTokens: 800, outTokens: 300 }

/** USD for one interview. `cacheHitRate` = share of calls after the first whose prefix is served from cache; `autoFalsePositive` = share of auto-asks that fire on a non-question (0 = on demand only). */
export function interviewUsd(table: PriceTable, model: string, o: { shape?: InterviewShape; cacheHitRate?: number; autoFalsePositive?: number } = {}): number | null {
  const { answers, prefixTokens, freshTokens, outTokens } = o.shape ?? DEFAULT_INTERVIEW
  const fp = Math.min(Math.max(o.autoFalsePositive ?? 0, 0), 0.95)
  const calls = answers / (1 - fp)
  const hit = Math.min(Math.max(o.cacheHitRate ?? 0, 0), 1)
  const cold = estimateUsd(table, model, prefixTokens + freshTokens, outTokens, 0)
  const warm = estimateUsd(table, model, prefixTokens + freshTokens, outTokens, prefixTokens)
  if (cold === null || warm === null) return null
  return cold + (calls - 1) * (hit * warm + (1 - hit) * cold)
}

export function createCostMeter(table: PriceTable = defaultPrices): CostMeter {
  let total = 0
  const missing = new Set<string>()
  return {
    add(model, promptTokens, completionTokens, billedUsd, cachedTokens) {
      const cost = billedUsd ?? estimateUsd(table, model, promptTokens, completionTokens, cachedTokens)
      if (cost === null) { missing.add(model); return 0 }
      total += cost
      return cost
    },
    totalUsd: () => total,
    exceeds: ceilingUsd => total >= ceilingUsd,
    unpriced: () => [...missing],
  }
}
