import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

import { Courses } from '@/components/resume/Courses'
import { SkillGaps } from '@/components/resume/SkillGaps'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

import type { AtsReport } from '../../lib/types'

const H = 'm-0 text-[13px] font-semibold text-foreground'

/** Skill gaps, (optional) add-skill actions, verified courses and the learning plan: shared by the Resume and Job pages. */
export function SkillUpSections({ report, addSkills }: { report: AtsReport; addSkills?: ReactNode }) {
  const courseNote = report.notes?.find(n => /course/i.test(n))
  return (
    <>
      <section aria-label="Skills the job asks for" className="flex flex-col gap-2">
        <h3 className={H}>Skills the job asks for</h3>
        <SkillGaps gaps={report.skillGaps} />
      </section>
      {addSkills}
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
    </>
  )
}
