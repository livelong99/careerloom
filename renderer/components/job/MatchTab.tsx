import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import type { JobView, MatchStatus } from '../../lib/types'
import { ScoreCard } from '../resume/ScoreCard'
import { AtsRunner } from './AtsRunner'
import { Block, Chips } from './bits'
import type { JobAts } from './useJobAts'

const STATUS: Record<MatchStatus, ['success' | 'warn' | 'danger' | 'neutral', string]> = {
  match: ['success', 'Match'], partial: ['warn', 'Partial'], missing: ['danger', 'Missing'], unknown: ['neutral', '—'],
}

export function MatchTab({ view, ats }: { view: JobView; ats: JobAts }) {
  const r = view.report
  const kw = view.keywords
  const covered = kw.filter(k => k.status === 'covered').map(k => k.keyword)
  const related = kw.filter(k => k.status === 'related')
  const missing = kw.filter(k => k.status === 'missing').map(k => k.keyword)
  return (
    <div className="flex flex-col gap-4 p-4">
      <Block title="Job match score">
        {ats.report?.match
          ? <ScoreCard title="Job match" block={ats.report.match} label="Estimated from this posting against your résumé" />
          : <p className="m-0 mb-3 text-sm text-muted-foreground">A measured match score, skill gaps and courses for this exact posting. The tables below come from the evaluation and cost nothing.</p>}
        <AtsRunner ats={ats} cta={ats.report?.match ? 'Run again' : 'Run job match'} />
      </Block>

      <Block title="Keywords">
        {kw.length === 0 ? <p className="m-0 text-sm text-muted-foreground">No keywords yet: evaluate the job or open the Job tab first.</p> : (
          <div className="space-y-3">
            <div><h4 className="m-0 mb-1.5 text-xs font-medium text-muted-foreground">Missing from your résumé ({missing.length})</h4>{missing.length ? <Chips items={missing} variant="danger" /> : <p className="m-0 text-sm">Nothing missing.</p>}</div>
            {related.length > 0 && <div><h4 className="m-0 mb-1.5 text-xs font-medium text-muted-foreground">Related skills you have ({related.length})</h4><div className="flex flex-wrap gap-1.5">{related.map(k => <Badge key={k.keyword} variant="warn" title={k.via ? `You have ${k.via}` : undefined}>{k.keyword}</Badge>)}</div></div>}
            <div><h4 className="m-0 mb-1.5 text-xs font-medium text-muted-foreground">On your résumé ({covered.length})</h4><Chips items={covered} variant="success" /></div>
          </div>
        )}
      </Block>

      {r && r.cvMatch.length > 0 && (
        <Block title="Requirement by requirement">
          <div className="overflow-x-auto">
            <Table className="tbl">
              <TableHeader><TableRow><TableHead>Requirement</TableHead><TableHead>Importance</TableHead><TableHead>Match</TableHead><TableHead className="w-[40%]">Evidence / gap</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.cvMatch.map((m, i) => (
                  <TableRow key={`${i}-${m.requirement}`}>
                    <TableCell className="whitespace-normal align-top font-medium">{m.requirement}</TableCell>
                    <TableCell className="whitespace-normal align-top">{m.importance ?? '—'}</TableCell>
                    <TableCell className="align-top"><Badge variant={STATUS[m.status][0]}>{STATUS[m.status][1]}</Badge></TableCell>
                    <TableCell className="whitespace-normal align-top text-muted-foreground">{m.evidence ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Block>
      )}

      {r && r.gaps.length > 0 && (
        <Block title="Gaps and how to handle them">
          <ol className="m-0 space-y-3 pl-5 text-sm">
            {r.gaps.map((g, i) => (
              <li key={`${i}-${g.title}`}>
                <div className="font-medium">{g.title}</div>
                {g.risk && <div className="text-muted-foreground"><span className="font-medium text-foreground">Risk:</span> {g.risk}</div>}
                {g.mitigation && <div className="text-muted-foreground"><span className="font-medium text-foreground">Mitigation:</span> {g.mitigation}</div>}
              </li>
            ))}
          </ol>
        </Block>
      )}
      {!r && <p className="m-0 text-sm text-muted-foreground">Evaluate this job to see the requirement-by-requirement table and gap advice.</p>}
    </div>
  )
}
