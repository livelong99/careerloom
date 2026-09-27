import { useState } from 'react'

import { useRuns } from '../../hooks/useRuns'
import { asOfLabel } from '../../lib/format'
import { careerloom } from '../../lib/ipc'
import type { AtsIssue, AtsResult } from '../../lib/types'
import { Icon, type IconName } from '../icons'
import { Button } from '../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { act } from './actions'
import { AtsGauge } from './AtsGauge'

const SEVERITY: Array<{ id: string; label: string; icon: IconName; tone: string }> = [
  { id: 'critical', label: 'Must fix', icon: 'triangle-alert', tone: 'text-destructive' },
  { id: 'warning', label: 'Should fix', icon: 'triangle-alert', tone: 'text-warning' },
  { id: 'info', label: 'Good to know', icon: 'info', tone: 'text-muted-foreground' },
]
const groupOf = (i: AtsIssue) => (SEVERITY.some(x => x.id === i.severity) ? i.severity : 'info')

function Heading({ children }: { children: string }) {
  return <h3 className="m-0 text-[13px] font-semibold text-foreground">{children}</h3>
}

export function InsightsTab({ ats, hasCv, onScored }: { ats: AtsResult | null; hasCv: boolean; onScored: () => void }) {
  const { adopt } = useRuns()
  const [role, setRole] = useState('')
  const [keywords, setKeywords] = useState('')
  const [job, setJob] = useState('')
  const [busy, setBusy] = useState<'score' | 'job' | null>(null)

  const score = () => act(async () => {
    setBusy('score')
    try { await careerloom.scoreAts({ role: role.trim() || undefined, keywords: keywords.trim() || undefined }); onScored() } finally { setBusy(null) }
  })
  const checkJob = () => act(async () => {
    setBusy('job')
    try { adopt(await careerloom.rankAgainstJob(job.trim())); setJob('') } finally { setBusy(null) }
  }, 'Checking your résumé against the job')

  if (!hasCv) return <p className="m-0 text-sm text-muted-foreground">Insights appear once your résumé is extracted.</p>

  return (
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex flex-col gap-3">
        {ats ? (
          <div className="flex items-center gap-4">
            <AtsGauge score={ats.score} grade={ats.grade} />
            <div className="flex flex-col gap-1">
              <p className="m-0 font-medium text-foreground">{ats.pass ? 'Readable by applicant tracking systems' : `Below the pass mark of ${ats.minScore}`}</p>
              <p className="m-0 text-xs text-muted-foreground">Checked {asOfLabel(ats.checkedAt)}</p>
            </div>
          </div>
        ) : (
          <p className="m-0 text-muted-foreground">No ATS score yet. Score your résumé to see what trips up applicant tracking systems.</p>
        )}
        <Collapsible>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" disabled={busy === 'score'} onClick={() => void score()}>{busy === 'score' ? 'Scoring…' : ats ? 'Score again' : 'Score résumé'}</Button>
            <CollapsibleTrigger asChild><Button size="sm" variant="subtle">Target a role</Button></CollapsibleTrigger>
          </div>
          <CollapsibleContent className="mt-2 flex flex-col gap-2">
            <Input aria-label="Target role" placeholder="Role, for example Staff platform engineer" value={role} onChange={e => setRole(e.target.value)} />
            <Input aria-label="Keywords" placeholder="Keywords, comma separated" value={keywords} onChange={e => setKeywords(e.target.value)} />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {ats && ats.issues.length > 0 && SEVERITY.map(sev => {
        const items = ats.issues.filter(i => groupOf(i) === sev.id)
        if (!items.length) return null
        return (
          <div key={sev.id} className="flex flex-col gap-2">
            <Heading>{`${sev.label} (${items.length})`}</Heading>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {items.map((i, n) => (
                <li key={n} className="flex gap-2">
                  <Icon name={sev.icon} className={`mt-0.5 size-3.5 shrink-0 ${sev.tone}`} aria-hidden="true" />
                  <span className="text-foreground">{i.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      {ats?.keywordCoverage && (
        <div className="flex flex-col gap-2">
          <Heading>{`Keywords found: ${ats.keywordCoverage.found} of ${ats.keywordCoverage.total}`}</Heading>
          {ats.keywordCoverage.missing.length > 0 && (
            <ul aria-label="Missing keywords" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {ats.keywordCoverage.missing.map(k => <li key={k} className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground">{k}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Heading>Check against a job</Heading>
        <p className="m-0 text-xs text-muted-foreground">The agent compares your résumé with the posting and lists what to change.</p>
        <Textarea aria-label="Job link or description" placeholder="Paste a job link or the full description" rows={3} value={job} onChange={e => setJob(e.target.value)} />
        <Button size="sm" variant="outline" className="self-start border-border" disabled={!job.trim() || busy === 'job'} onClick={() => void checkJob()}>Check fit</Button>
      </div>
    </div>
  )
}
