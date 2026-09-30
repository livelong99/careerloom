import { Badge } from '@/components/ui/badge'
import type { CopilotConfig } from '@/lib/types'
import { Group } from './Group'

type Coaching = CopilotConfig['coaching']
export type Sample = { say: string; bullets: string[]; star: { s: string; t: string; a: string; r: string } | null; script: string | null; proof: string | null }

const SAY: Record<Coaching['tone'], string> = {
  direct: 'I moved 40 services to Kubernetes and cut release lead time from 4 days to 6 hours.',
  warm: "I'm proud of the platform migration I led: 40 services, and releases went from 4 days to 6 hours.",
  formal: 'I led the migration of 40 services to Kubernetes, reducing release lead time from four days to six hours.',
}
const BULLETS = ['Why the old setup was slow', 'How you staged the rollout', 'What you would change next time']

/** Static, clearly fictional sample reshaped by the coaching settings (no model call). */
export function sampleSuggestion(c: Coaching): Sample {
  const say = SAY[c.tone]
  return {
    say,
    bullets: BULLETS.slice(0, c.length),
    star: c.shape === 'cues+star' ? { s: 'Releases took 4 days', t: 'Cut lead time', a: 'Staged migration to Kubernetes', r: '6 hours, 40 services' } : null,
    script: c.shape === 'script' ? `${say} ${BULLETS.slice(0, c.length).join('. ')}. That is how I would approach this role too.` : null,
    proof: c.quoteResume ? 'Cut release lead time from 4 days to 6 hours across 40 services · cv.md' : null,
  }
}

export function CoachingPreview({ coaching }: { coaching: Coaching }) {
  const s = sampleSuggestion(coaching)
  return (
    <Group title="Preview" action={<Badge>Sample</Badge>} className="sticky top-0">
      <div aria-live="polite" className="flex flex-col gap-3 text-sm text-foreground">
        <div><div className="text-xs font-medium text-muted-foreground">Say first</div><p className="m-0">{s.say}</p></div>
        {s.script
          ? <div><div className="text-xs font-medium text-muted-foreground">Full script</div><p className="m-0">{s.script}</p></div>
          : <div><div className="text-xs font-medium text-muted-foreground">Then cover</div><ul className="m-0 pl-5">{s.bullets.map(b => <li key={b}>{b}</li>)}</ul></div>}
        {s.star && <div><div className="text-xs font-medium text-muted-foreground">STAR skeleton</div><ul className="m-0 pl-5"><li>S: {s.star.s}</li><li>T: {s.star.t}</li><li>A: {s.star.a}</li><li>R: {s.star.r}</li></ul></div>}
        {s.proof && <div><div className="text-xs font-medium text-muted-foreground">Proof from your résumé</div><p className="m-0 italic">“{s.proof}”</p></div>}
      </div>
    </Group>
  )
}
