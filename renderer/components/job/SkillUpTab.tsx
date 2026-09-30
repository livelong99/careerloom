import { SkillUpSections } from '../resume/SkillUpSections'
import { AtsRunner } from './AtsRunner'
import { Block } from './bits'
import type { JobAts } from './useJobAts'

/** Per-job skill gaps, verified courses and a short plan: the same sections as the Resume page. */
export function SkillUpTab({ ats }: { ats: JobAts }) {
  const report = ats.report?.match ? ats.report : null
  return (
    <div className="flex flex-col gap-4 p-4">
      {!report && (
        <Block title="What to learn for this job">
          <p className="m-0 mb-3 text-sm text-muted-foreground">Skill gaps, courses whose links were checked, and a short plan are worked out against this posting and your résumé.</p>
          <AtsRunner ats={ats} cta="Work out skill gaps" />
        </Block>
      )}
      {report && <SkillUpSections report={report} />}
      {report && <AtsRunner ats={ats} cta="Run again" />}
    </div>
  )
}
