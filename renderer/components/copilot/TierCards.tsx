import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TIERS, type TierId } from './catalog'

export type TierPrice = { prompt: number; completion: number } | null

// Plan §10 assumptions: 15 answers per interview, each 5,000 cached-prefix + 800 fresh input tokens and 300 output tokens.
// ponytail: cached tokens priced at 10% of the prompt price (typical cache discount); real cost is shown in the overlay.
const ANSWERS = 15
const CACHED = 5000, FRESH = 800, OUT = 300
const CACHE_FACTOR = 0.1

/** USD per interview from $/million-token prices, or null when either price is unknown. */
export function estimateInterviewUsd(promptUsdPerM: number | null, completionUsdPerM: number | null): number | null {
  if (promptUsdPerM === null || completionUsdPerM === null) return null
  return (ANSWERS * ((CACHED * CACHE_FACTOR + FRESH) * promptUsdPerM + OUT * completionUsdPerM)) / 1_000_000
}

const usd = (v: number): string => `$${v < 0.01 ? v.toFixed(3) : v.toFixed(2)}`

export function TierCards({ tier, onTier, prices }: { tier: TierId; onTier: (t: TierId) => void; prices: Record<TierId, TierPrice> }) {
  return (
    <div role="group" aria-label="Speed and cost" className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
      {TIERS.map(t => {
        const p = prices[t.id]
        const est = p ? estimateInterviewUsd(p.prompt, p.completion) : null
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
