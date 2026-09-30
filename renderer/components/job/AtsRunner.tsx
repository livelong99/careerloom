import { Button } from '@/components/ui/button'

import { PhaseStepper } from '../resume/PhaseStepper'
import { QuestionsPanel } from '../resume/QuestionsPanel'
import type { JobAts } from './useJobAts'

/** "Run job match" + progress + the agent's questions, shared by the Match and Skill-up tabs. */
export function AtsRunner({ ats, cta }: { ats: JobAts; cta: string }) {
  const { report, live } = ats
  const pending = report?.session?.questions.length ? report.session.questions : live.questions
  const waiting = pending.length > 0
  const busy = live.running && !waiting
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={busy || waiting} onClick={() => void ats.run()}>{busy ? 'Analysing…' : cta}</Button>
        <span className="text-xs text-muted-foreground">{waiting ? 'Answer the questions below to finish.' : 'One text-only agent run against your résumé (plus a follow-up only if it needs to ask you something).'}</span>
      </div>
      {live.error && <p role="alert" className="m-0 text-sm text-destructive">{live.error}</p>}
      <PhaseStepper live={live} />
      {waiting && report && <QuestionsPanel questions={pending} busy={live.running} onSend={a => void ats.answer(report.id, a)} />}
    </div>
  )
}
