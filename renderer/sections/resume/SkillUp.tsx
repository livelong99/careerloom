import { FindingsPanel } from '@/components/resume/FindingsPanel'
import { SkillUpSections } from '@/components/resume/SkillUpSections'
import { Button } from '@/components/ui/button'
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
  const missing = report.skillGaps.filter(g => g.bucket === 'gap').length

  return (
    <Page title="Skill-up" blurb={missing ? `${missing} skill${missing === 1 ? '' : 's'} the job asks for ${missing === 1 ? 'is' : 'are'} missing from your résumé.` : 'Every skill the job asks for is on your résumé or covered by a related one.'}>
      <SkillUpSections
        report={report}
        addSkills={(
          <section aria-label="Add skills you already have" className="flex flex-col gap-2">
            <h3 className={H}>Add skills you already have</h3>
            <p className="m-0 text-sm text-muted-foreground">Only add a skill you have really used. Each one asks you to confirm first.</p>
            <FindingsPanel report={report} history={ctx.history} categories={['skill']} onChanged={ctx.refresh} onGoContent={() => ctx.go('content')} />
          </section>
        )}
      />
    </Page>
  )
}
