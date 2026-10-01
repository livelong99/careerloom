import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { interviewUsd } from '../../../electron/copilot/cost'
import { TIERS, type TierId } from './catalog'

export type TierPrice = { prompt: number; completion: number; cached?: number | null } | null

// Plan §10 interview shape and the cached-token pricing live in electron/copilot/cost.ts (interviewUsd); the cost report uses the same function.
// Caching only counts when the model has a known cached rate (bundled prices.json); the share of calls that hit the cache is an assumption.
const CACHE_HIT_RATE = 0.9
const MODEL = 'm'

/** USD per interview from $/million-token prices, or null when either price is unknown. */
export function estimateInterviewUsd(promptUsdPerM: number | null, completionUsdPerM: number | null, cachedUsdPerM?: number | null): number | null {
  if (promptUsdPerM === null || completionUsdPerM === null) return null
  const table = { asOf: '', models: { [MODEL]: { promptUsdPerM, completionUsdPerM, ...(cachedUsdPerM != null ? { cachedUsdPerM } : {}) } } }
  return interviewUsd(table, MODEL, { cacheHitRate: CACHE_HIT_RATE })
}

const usd = (v: number): string => `$${v < 0.01 ? v.toFixed(3) : v.toFixed(2)}`

export function TierCards({ tier, onTier, prices }: { tier: TierId; onTier: (t: TierId) => void; prices: Record<TierId, TierPrice> }) {
  return (
    <div role="group" aria-label="Speed and cost" className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
      {TIERS.map(t => {
        const p = prices[t.id]
        const est = p ? estimateInterviewUsd(p.prompt, p.completion, p.cached) : null
        return (
          <button
            key={t.id} type="button" aria-pressed={tier === t.id} onClick={() => onTier(t.id)}
            className={cn('flex flex-col items-start gap-1 rounded-lg border bg-card/60 p-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50', tier === t.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-accent/40')}
          >
            <b className="text-sm text-foreground">{t.label}</b>
            <small className="text-xs text-muted-foreground">{t.hint}</small>
            <Badge variant={tier === t.id ? 'brand' : 'neutral'} className="mt-2 h-auto max-w-full whitespace-normal py-0.5 text-left">
              {est === null ? 'price shown after you pick a model' : `about ${usd(est)} per interview`}
            </Badge>
          </button>
        )
      })}
    </div>
  )
}
