// Contract stub (WP0): interface only. The owning work package implements it in this file.
export type PriceTable = { asOf: string; models: Record<string, { promptUsdPerM: number; completionUsdPerM: number }> }
/** Owner: WP2. Tokens x dated price table; drives the overlay cost figure and the per-session ceiling. */
export interface CostMeter {
  add(model: string, promptTokens: number, completionTokens: number): number
  totalUsd(): number
  exceeds(ceilingUsd: number): boolean
}
