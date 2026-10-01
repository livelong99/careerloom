import { useState } from 'react'

import { FindingsPanel } from '@/components/resume/FindingsPanel'
import { PhaseStepper } from '@/components/resume/PhaseStepper'
import { QuestionsPanel } from '@/components/resume/QuestionsPanel'
import { ScoreCard } from '@/components/resume/ScoreCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { goToSettings } from '@/lib/nav'
import { Page } from './PageStub'
import type { ResumeCtx } from './ctx'

// The pasted job description outlives tab switches (in memory only).
let draftJd = ''

export function AtsPage({ ctx }: { ctx: ResumeCtx }) {
  const [jd, setJd] = useState(draftJd)
  const { report, live } = ctx
  const pending = report?.session?.questions.length ? report.session.questions : live.questions
  const waiting = pending.length > 0
  const busy = live.running && !waiting
  const edit = (v: string) => { draftJd = v; setJd(v) }

  return (
    <Page title="ATS analysis" blurb="How applicant tracking systems read your résumé, and how well it matches a job.">
      <section aria-label="Run an analysis" className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="ats-jd">Job description</FieldLabel>
          <FieldDescription>Paste the posting to get a job match, skill gaps and courses. Leave it empty to check only how your résumé parses.</FieldDescription>
          <Textarea id="ats-jd" rows={6} value={jd} onChange={e => edit(e.target.value)} placeholder="Paste the job description here" maxLength={40_000} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={busy || waiting || !ctx.cv} onClick={() => void ctx.analyze(jd)}>{busy ? 'Analysing…' : report ? 'Run again' : 'Run analysis'}</Button>
          {!ctx.cv && <span className="text-xs text-muted-foreground">Add your résumé on the Overview page first.</span>}
          {waiting && <span className="text-xs text-muted-foreground">Answer the agent's questions below to finish this analysis first.</span>}
          {jd.trim() && !waiting && <span className="text-xs text-muted-foreground">One agent run, plus a follow-up only if it needs to ask you something.</span>}
        </div>
      </section>

      <PhaseStepper live={live} />

      {waiting && report && <QuestionsPanel questions={pending} busy={live.running} onSend={a => void ctx.answer(report.id, a)} />}

      {report && (
        <Tabs defaultValue={report.match || report.findings.length ? 'findings' : 'parse'} className="gap-4">
          <TabsList aria-label="Analysis results">
            <TabsTrigger value="parse">Parse health</TabsTrigger>
            <TabsTrigger value="match">Job match</TabsTrigger>
            <TabsTrigger value="findings">Findings ({report.findings.filter(f => f.status === 'open').length})</TabsTrigger>
          </TabsList>
          <TabsContent value="parse" className="flex flex-col gap-3">
            <ScoreCard title="Parse health" block={report.parse} label="A parse-risk heuristic, measured on the PDF your template produces" note={report.degraded.pdfText ? 'The PDF could not be read here, so the text-layer part is an estimate' : undefined} />
          </TabsContent>
          <TabsContent value="match" className="flex flex-col gap-3">
            {report.match ? (
              <>
                <ScoreCard title="Job match" block={report.match} label="A parse-risk heuristic estimate from the job description, not a prediction of any real ATS" />
                {report.degraded.embeddings && (
                  <Alert>
                    <AlertTitle>Running without the local model</AlertTitle>
                    <AlertDescription>The meaning-based part (20 points) is left out and the rest is rescaled, so confidence is lower. Install the local model for a more accurate match.</AlertDescription>
                    <Button variant="link" size="sm" className="h-auto px-0" onClick={() => goToSettings('local-models', 'local:prescreen')}>Manage in Settings</Button>
                  </Alert>
                )}
              </>
            ) : (
              <Empty className="border border-border"><EmptyHeader><EmptyTitle>No job match yet</EmptyTitle><EmptyDescription>Paste a job description above and run the analysis.</EmptyDescription></EmptyHeader></Empty>
            )}
          </TabsContent>
          <TabsContent value="findings">
            <FindingsPanel report={report} history={ctx.history} onChanged={ctx.refresh} onGoContent={() => ctx.go('content')} />
          </TabsContent>
        </Tabs>
      )}
      {report?.notes?.map(n => <p key={n} className="m-0 text-xs text-muted-foreground">{n}</p>)}
    </Page>
  )
}
