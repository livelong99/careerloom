import { useAsync } from '../copilot/api'
import { SkillUpSections } from '../resume/SkillUpSections'
import { careerloom } from '../../lib/ipc'
import type { AtsReport, KbSkillSignal } from '../../lib/types'
import { AtsRunner } from './AtsRunner'
import { Block } from './bits'
import type { JobAts } from './useJobAts'

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9+#]+/g, '')
/** Skills practised in the AI interviewer, weakest first. */
const weakest = (s: KbSkillSignal | null): Array<{ skill: string; avg: number; n: number }> =>
  Object.entries(s?.skills ?? {}).map(([skill, v]) => ({ skill, ...v })).sort((a, b) => a.avg - b.avg || a.skill.localeCompare(b.skill))
/** Gaps you practised badly come first; the rest keep the report's order. */
const reorder = (report: AtsReport, signal: KbSkillSignal | null): AtsReport => {
  const score = new Map(weakest(signal).map(w => [norm(w.skill), w.avg]))
  const rank = (g: AtsReport['skillGaps'][number]): number => score.get(norm(g.canonical)) ?? score.get(norm(g.skill)) ?? Infinity
  return { ...report, skillGaps: [...report.skillGaps].sort((a, b) => rank(a) - rank(b)) } // stable: unpractised gaps keep their order
}

/** Per-job skill gaps, verified courses and a short plan: the same sections as the Resume page, plus what your practice sessions showed. */
export function SkillUpTab({ ats, jobId }: { ats: JobAts; jobId: string }) {
  const report = ats.report?.match ? ats.report : null
  const signal = useAsync(async () => { try { return (await careerloom.interviewSkillSignal(jobId)) ?? null } catch { return null } }, [jobId]).data
  const practised = weakest(signal)
  return (
    <div className="flex flex-col gap-4 p-4">
      {practised.length > 0 && (
        <Block title="From your practice sessions">
          <p className="m-0 mb-2 text-sm text-muted-foreground">Average score per skill from the AI interviewer, weakest first. Skills below are ordered by it.</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {practised.map(w => <li key={w.skill} className="rounded-md border border-border px-2 py-1 text-xs tabular-nums">{w.skill} · {w.avg.toFixed(1)} of 5 · {w.n} {w.n === 1 ? 'answer' : 'answers'}</li>)}
          </ul>
        </Block>
      )}
      {!report && (
        <Block title="What to learn for this job">
          <p className="m-0 mb-3 text-sm text-muted-foreground">Skill gaps, courses whose links were checked, and a short plan are worked out against this posting and your résumé.</p>
          <AtsRunner ats={ats} cta="Work out skill gaps" />
        </Block>
      )}
      {report && <SkillUpSections report={reorder(report, signal ?? null)} />}
      {report && <AtsRunner ats={ats} cta="Run again" />}
    </div>
  )
}
