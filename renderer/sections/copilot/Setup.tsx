import { Group } from '@/components/copilot/Group'
import { ContextTiles } from '@/components/copilot/ContextTiles'
import { JobPicker } from '@/components/copilot/JobPicker'
import { ReadinessStrip } from '@/components/copilot/ReadinessStrip'
import { SessionsNote } from '@/components/copilot/SessionsNote'
import { Pills } from '@/components/copilot/hwControls'
import { careerloom } from '@/lib/ipc'
import type { InterviewType } from '@/lib/types'
import { orNull, useAsync } from '@/components/copilot/api'
import { setSelection, useSelection } from '@/components/copilot/selection'
import { Page } from '../resume/PageStub'

const TYPES: Array<{ value: InterviewType; label: string }> = [
  { value: 'recruiter', label: 'Recruiter screen' }, { value: 'behavioural', label: 'Behavioural' }, { value: 'technical', label: 'Technical' },
  { value: 'system-design', label: 'System design' }, { value: 'mixed', label: 'Mixed' },
]

export function SetupPage() {
  const { jobId, interviewType } = useSelection()
  const readiness = useAsync(async () => (jobId ? careerloom.copilotReadiness(jobId) : null), [jobId])
  const preview = useAsync(async () => (jobId ? orNull(await careerloom.copilotContextPreview(jobId)) : null), [jobId])
  const r = readiness.data
  return (
    <Page title="Set up the interview" blurb="Pick the job and the kind of interview. The copilot only uses what you choose here, plus your résumé.">
      <ReadinessStrip readiness={r ? { ...r.context, mic: r.mic, system: r.system, stt: r.stt, engine: r.engine } : null} />
      <JobPicker summary={jobId ? <SessionsNote jobId={jobId} title={r?.context.title} /> : null} />
      <Group title="Interview type">
        <Pills label="Interview type" options={TYPES} value={interviewType} onChange={v => setSelection({ interviewType: v })} />
        <p className="m-0 mt-2 text-xs text-muted-foreground">Sets how questions are classified and which answer shape is offered first. Mixed detects the type per question.</p>
      </Group>
      <ContextTiles preview={preview.data} />
    </Page>
  )
}
