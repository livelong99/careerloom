import { Badge } from '@/components/ui/badge'
import type { Scorecard } from '@/lib/types'
import { Group } from './Group'

const DIMS: Array<[keyof Pick<Scorecard, 'structure' | 'specifics' | 'evidence' | 'concision'>, string]> = [
  ['structure', 'Structure'], ['specifics', 'Specific examples'], ['evidence', 'Evidence from your résumé'], ['concision', 'Conciseness'],
]

export function ScoreCard({ card, delta, pending }: { card: Scorecard | null; delta: number | null; pending: boolean }) {
  const badge = delta === null ? null : <Badge variant={delta >= 0 ? 'success' : 'warn'}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)} vs last</Badge>
  return (
    <Group title="Scorecard" action={badge}>
      {!card ? <p className="m-0 text-sm text-muted-foreground">{pending ? 'Scoring this session…' : 'Not scored. Sessions without spoken answers, or without a working agent runner, stay unscored.'}</p> : (
        <div className="grid gap-3">
          {DIMS.map(([key, label]) => (
            <div key={key}>
              <div className="flex justify-between text-sm"><span>{label}</span><b className="tabular-nums">{card[key].toFixed(1)}</b></div>
              <div role="meter" aria-label={label} aria-valuemin={1} aria-valuemax={5} aria-valuenow={card[key]} className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(card[key] / 5) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Group>
  )
}
