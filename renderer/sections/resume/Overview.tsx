import { useState } from 'react'

import { act } from '@/components/resume/actions'
import { when } from '@/components/resume/format'
import { ScoreCard } from '@/components/resume/ScoreCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { careerloom } from '@/lib/ipc'
import { showToast } from '@/lib/toast'

import { Page } from './PageStub'
import type { PageId, ResumeCtx } from './ctx'

const base = (file: string) => file.split('/').pop() ?? file

function nextSteps(ctx: ResumeCtx): Array<{ text: string; cta: string; page: PageId }> {
  const { report, cv } = ctx
  if (!cv) return []
  if (!report) return [{ text: 'Run an ATS analysis to see how your résumé parses.', cta: 'Run analysis', page: 'ats' }]
  const open = report.findings.filter(f => f.status === 'open')
  const steps: Array<{ text: string; cta: string; page: PageId }> = []
  if (report.session?.questions.length) steps.push({ text: 'The agent is waiting for your answers.', cta: 'Answer', page: 'ats' })
  if (open.some(f => f.id === 'parse.coverage')) steps.push({ text: 'Your exported PDF leaves out part of your résumé. Rebuild the template data to fix it.', cta: 'Review', page: 'ats' })
  if (!report.match) steps.push({ text: 'Paste a job description to get a job match, skill gaps and courses.', cta: 'Add a job', page: 'ats' })
  const serious = open.filter(f => f.severity === 'critical' || f.severity === 'major').length
  if (serious) steps.push({ text: `${serious} important finding${serious === 1 ? '' : 's'} can improve your score.`, cta: 'Review', page: 'ats' })
  if (report.skillGaps.some(g => g.bucket === 'gap')) steps.push({ text: 'You are missing skills the job asks for. See how to add them and what to learn.', cta: 'Skill up', page: 'skillup' })
  return steps.slice(0, 4)
}

export function OverviewPage({ ctx }: { ctx: ResumeCtx }) {
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const { overview, cv, report, history, profile, refresh, adopt } = ctx
  const latest = overview.sources.filter(s => /^documents\/cv\/[^/]+$/.test(s.file)).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const reExtractFile = profile?.extractedFrom ? base(profile.extractedFrom) : latest ? base(latest.file) : null
  const extract = (file: string) => act(async () => { adopt(await careerloom.extractResume(file)); refresh() }, 'The agent is extracting your résumé')
  const addAndExtract = () => act(async () => {
    setAdding(true)
    try {
      const src = await careerloom.importResume()
      if (src) { refresh(); await extract(base(src.file)) }
    } finally { setAdding(false) }
  })
  const undo = (id: string) => act(async () => {
    setBusy(id)
    try {
      const res = await careerloom.atsUndo(id)
      if (!res.ok) { showToast(res.error ?? 'Could not undo', 'error', 6000); return }
      refresh()
    } finally { setBusy(null) }
  }, 'Change undone')

  if (!cv) {
    return (
      <Page title="Overview" blurb="Where your résumé stands and what to do next.">
        <div role="region" aria-label="Get started" className="flex flex-col items-start gap-3 rounded-xl bg-muted/40 p-6">
          <h3 className="m-0 text-base font-semibold text-foreground">Start with the résumé you already have</h3>
          <p className="m-0 max-w-md text-sm text-muted-foreground">Add a PDF, Word, RTF, Markdown or text file. The agent reads it and fills in your résumé and profile.</p>
          <Button variant="primary" disabled={adding} onClick={() => void addAndExtract()}>{adding ? 'Starting…' : 'Add résumé and extract'}</Button>
        </div>
      </Page>
    )
  }

  const steps = nextSteps(ctx)
  const top = report?.findings.filter(f => f.status === 'open').slice(0, 5) ?? []

  return (
    <Page title="Overview" blurb="Where your résumé stands and what to do next.">
      {report ? (
        <div className="grid gap-4 md:grid-cols-2">
          <ScoreCard compact title="Parse health" block={report.parse} label="A parse-risk heuristic, not a real ATS result" note={report.degraded.pdfText ? 'PDF text layer not measured' : undefined} />
          {report.match
            ? <ScoreCard compact title="Job match" block={report.match} label="Estimated from the job description you pasted" note={report.degraded.embeddings ? 'Install the local model for +accuracy' : undefined} />
            : (
              <section aria-label="Job match" className="flex flex-col justify-center gap-2 rounded-xl border border-dashed border-border p-4">
                <h3 className="m-0 text-[13px] font-semibold text-foreground">Job match</h3>
                <p className="m-0 text-sm text-muted-foreground">Paste a job description to see how well you match, which skills you lack and what to learn.</p>
                <Button size="sm" variant="outline" className="self-start border-border" onClick={() => ctx.go('ats')}>Add a job description</Button>
              </section>
            )}
        </div>
      ) : (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>Not analysed yet</EmptyTitle>
            <EmptyDescription>The old score ignored your real PDF and any job, so it was always high. The new analysis reads the PDF your template produces and can compare it with a job.</EmptyDescription>
          </EmptyHeader>
          <Button variant="primary" onClick={() => ctx.go('ats')}>Run an ATS analysis</Button>
        </Empty>
      )}

      {steps.length > 0 && (
        <section aria-label="Next steps" className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-semibold text-foreground">Next steps</h3>
          <ItemGroup className="gap-2">
            {steps.map(s => (
              <Item key={s.text} variant="outline" size="sm">
                <ItemContent><ItemDescription className="line-clamp-none text-foreground">{s.text}</ItemDescription></ItemContent>
                <ItemActions><Button size="sm" variant="outline" className="border-border" onClick={() => ctx.go(s.page)}>{s.cta}</Button></ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </section>
      )}

      {top.length > 0 && (
        <section aria-label="Top findings" className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-semibold text-foreground">Top findings</h3>
          <ItemGroup className="gap-2">
            {top.map(f => (
              <Item key={f.id} variant="outline" size="sm">
                <ItemContent>
                  <ItemTitle><Badge variant={f.severity === 'critical' ? 'danger' : f.severity === 'major' ? 'warn' : 'neutral'}>{f.severity}</Badge>{f.title}</ItemTitle>
                </ItemContent>
                <ItemActions><Button size="sm" variant="subtle" onClick={() => ctx.go('ats')}>Review</Button></ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </section>
      )}

      <section aria-label="Recent changes" className="flex flex-col gap-2">
        <h3 className="m-0 text-[13px] font-semibold text-foreground">Recent changes</h3>
        {history.length === 0 ? <p className="m-0 text-sm text-muted-foreground">Changes you apply from the analysis show up here and can be undone.</p> : (
          <ItemGroup className="gap-2">
            {history.slice(0, 5).map(h => (
              <Item key={h.undoId} variant="outline" size="sm">
                <ItemContent><ItemTitle>{h.title}</ItemTitle><ItemDescription>{when(h.at)}</ItemDescription></ItemContent>
                <ItemActions><Button size="sm" variant="subtle" disabled={busy === h.undoId} onClick={() => void undo(h.undoId)}>Undo</Button></ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>

      <section aria-label="Your source file" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Built from {reExtractFile ?? 'cv.md'}.</span>
        <Button size="sm" variant="subtle" disabled={adding} onClick={() => void addAndExtract()}>Add another file</Button>
        {reExtractFile && <Button size="sm" variant="subtle" onClick={() => void extract(reExtractFile)}>Re-extract</Button>}
      </section>
    </Page>
  )
}
