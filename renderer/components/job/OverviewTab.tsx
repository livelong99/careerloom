import { Badge } from '@/components/ui/badge'

import type { JobView } from '../../lib/types'
import type { ScreenedJob } from '../jobs/filters'
import { Block, Bullets, Chips, Facts, Meter } from './bits'

const decisionTone = (d: string) => (/^(apply|go|yes)/i.test(d) ? 'success' : /skip|no|pass|reject/i.test(d) ? 'danger' : 'warn')

export function OverviewTab({ job, view, goTab }: { job: ScreenedJob; view: JobView; goTab: (t: string) => void }) {
  const r = view.report
  const p = view.posting
  if (!r) {
    return (
      <div className="space-y-4 p-4">
        <Block title="Not evaluated yet">
          <p className="m-0 text-sm text-muted-foreground">Evaluate this job to get a score, a CV match and a tailoring plan. The posting below is already tidied up.</p>
          {job.screen && <p className="m-0 mt-2 text-sm">Pre-screen: {job.screen.reason}</p>}
        </Block>
        {p?.summary && <Block title="The role"><p className="m-0 text-sm">{p.summary}</p><button type="button" className="mt-2 cursor-pointer text-xs text-(--accent-text) underline" onClick={() => goTab('job')}>See the full posting</button></Block>}
      </div>
    )
  }
  const dims = r.scores.filter(s => !/^global$/i.test(s.dimension))
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <Block title="Verdict" className="lg:col-span-2">
        <div className="flex flex-wrap items-center gap-3">
          {r.decision && <Badge variant={decisionTone(r.decision)} >{r.decision}</Badge>}
          {r.archetype && <span className="text-sm text-muted-foreground">{r.archetype}</span>}
          {r.riskLevel && <span className="text-sm text-muted-foreground">Risk: {r.riskLevel}</span>}
        </div>
        {r.nextAction && <p className="m-0 mt-2 text-sm">{r.nextAction}</p>}
      </Block>
      <Block title="Scores">
        {dims.length
          ? <div className="space-y-3">{dims.map(d => <Meter key={d.dimension} label={d.dimension} value={d.value} note={d.note} />)}</div>
          : r.score !== null ? <Meter label="Overall fit" value={r.score} /> : <p className="m-0 text-sm text-muted-foreground">No score breakdown in this report.</p>}
      </Block>
      <Block title="Key facts">
        <Facts rows={[
          ['Pay', r.advertisedComp ?? (p?.salary?.text ?? null)], ['Work mode', p?.workMode], ['Type', p?.employmentType], ['Level in the posting', p?.seniority],
          ['Work authorisation', r.workAuth], ['Legitimacy', r.legitimacy], ['Evaluated', r.date],
          ...r.roleAttributes.slice(0, 8).map(a => [/seniority|level/i.test(a.label) ? `${a.label} (evaluation)` : a.label, a.value] as [string, string]),
        ]} />
      </Block>
      <Block title="Top strengths"><Bullets items={r.topStrengths} empty="None listed." /></Block>
      <Block title="Hard stops">
        {r.hardStops.length ? <Bullets items={r.hardStops} /> : <p className="m-0 text-sm text-muted-foreground">None — nothing rules this job out.</p>}
      </Block>
      <Block title="Soft gaps" className="lg:col-span-2"><Bullets items={r.softGaps} empty="None listed." /></Block>
      {r.workAuthCheck && <Block title="Work authorisation" className="lg:col-span-2"><p className="m-0 whitespace-pre-line text-sm">{r.workAuthCheck}</p></Block>}
      {r.keywords.length > 0 && <Block title="Keywords" className="lg:col-span-2"><Chips items={r.keywords.slice(0, 24)} /></Block>}
      {r.warnings.length > 0 && <p className="m-0 text-xs text-muted-foreground lg:col-span-2">Parts of this report were not recognised: {r.warnings.join('; ')}.</p>}
    </div>
  )
}
