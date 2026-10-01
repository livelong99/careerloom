// WP2 owns this file. Spend/time caps and the cost meter; degrades to a partial KB (plan §10).
import { todo } from '../todo'

export type Budget = { spend(usd: number): void; spentUsd(): number; exhausted(): boolean; elapsedMs(): number }
export const createBudget = (_caps: { usd: number; minutes: number }, _now?: () => number): Budget => todo('WP2')
