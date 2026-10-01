// Spend/time caps and the cost meter; the pipeline degrades to a partial KB instead of overrunning (plan §10).
export type Budget = {
  spend(usd: number): void
  spentUsd(): number
  /** True when one more call of `usd` would break the cap. */
  wouldExceed(usd: number): boolean
  exhausted(): boolean
  elapsedMs(): number
}

/** `spentUsd` seeds a resumed run so the cap covers the whole job, not just this attempt. */
export function createBudget(caps: { usd: number; minutes: number; spentUsd?: number }, now: () => number = Date.now): Budget {
  const start = now()
  let spent = caps.spentUsd ?? 0
  const elapsed = () => now() - start
  return {
    spend(usd) { if (Number.isFinite(usd) && usd > 0) spent += usd },
    spentUsd: () => spent,
    wouldExceed: usd => spent + Math.max(0, usd) > caps.usd + 1e-9,
    exhausted: () => spent >= caps.usd - 1e-9 || elapsed() >= caps.minutes * 60_000,
    elapsedMs: elapsed,
  }
}
