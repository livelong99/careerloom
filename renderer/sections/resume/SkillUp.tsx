import { ChevronDown } from 'lucide-react'

import { Courses } from '@/components/resume/Courses'
import { FindingsPanel } from '@/components/resume/FindingsPanel'
import { SkillGaps } from '@/components/resume/SkillGaps'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

import { Page } from './PageStub'
import type { ResumeCtx } from './ctx'

const H = 'm-0 text-[13px] font-semibold text-foreground'

export function SkillUpPage({ ctx }: { ctx: ResumeCtx }) {
  const { report } = ctx
  if (!report?.match) {
    return (
      <Page title="Skill-up" blurb="Skills to add, courses to take and a plan to get there.">
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>Run an analysis with a job description first</EmptyTitle>
            <EmptyDescription>Skill gaps, courses and a learning plan are worked out against a specific job.</EmptyDescription>
          </EmptyHeader>
          <Button variant="primary" onClick={() => ctx.go('ats')}>Go to ATS analysis</Button>
        </Empty>
      </Page>
    )
  }
  const courseNote = report.notes?.find(n => /course/i.test(n))
  const missing = report.skillGaps.filter(g => g.bucket === 'gap').length

  return (
    <Page title="Skill-up" blurb={missing ? `${missing} skill${missing === 1 ? '' : 's'} the job asks for ${missing === 1 ? 'is' : 'are'} missing from your résumé.` : 'Every skill the job asks for is on your résumé or covered by a related one.'}>
      <section aria-label="Skills the job asks for" className="flex flex-col gap-2">
        <h3 className={H}>Skills the job asks for</h3>
        <SkillGaps gaps={report.skillGaps} />
      </section>

      <section aria-label="Add skills you already have" className="flex flex-col gap-2">
        <h3 className={H}>Add skills you already have</h3>
        <p className="m-0 text-sm text-muted-foreground">Only add a skill you have really used. Each one asks you to confirm first.</p>
        <FindingsPanel report={report} history={ctx.history} categories={['skill']} onChanged={ctx.refresh} onGoContent={() => ctx.go('content')} />
      </section>

      <section aria-label="Courses" className="flex flex-col gap-2">
        <h3 className={H}>Courses</h3>
        {report.courses.length > 0 ? <Courses courses={report.courses} /> : (
          <Empty className="border border-border">
            <EmptyHeader>
              <EmptyTitle>No verified course found</EmptyTitle>
              <EmptyDescription>{courseNote ?? 'The agent found no course whose link still works. Nothing is shown unless it was checked.'}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>

      {report.plan && (
        <Collapsible className="rounded-xl border border-border">
          <CollapsibleTrigger asChild>
            <Button variant="subtle" className="w-full justify-between px-4"><span>Learning plan</span><ChevronDown className="size-4" aria-hidden="true" /></Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4 text-sm"><Markdown source={report.plan} /></CollapsibleContent>
        </Collapsible>
      )}
    </Page>
  )
}
