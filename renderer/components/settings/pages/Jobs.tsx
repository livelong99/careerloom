import { PrescreenModelPanel, PrescreenPolicyEditor } from '@/components/jobs/PrescreenPolicy'
import { errorText, useAsync } from '@/components/copilot/api'
import { Group, Note, Row } from '@/components/copilot/Group'
import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'
import { navigate } from '@/lib/nav'
import { showToast } from '@/lib/toast'
import { Page } from '@/sections/resume/PageStub'

/** Limits that are fixed in code today (read-only here): web boards in electron/integrations, per-request caps in electron/jobs.ts. */
const LIMITS: Array<[string, string]> = [
  ['Scans and evaluations', 'Run only when you start them (from Boards or Jobs). There is no background schedule.'],
  ['Jobs per evaluate or pre-screen request', 'Up to 200.'],
  ['Web boards', 'Up to 5 addresses per board, 3 pages and 200 jobs per scan.'],
]

export function JobsPage() {
  const status = useAsync(() => careerloom.prescreenStatus(), [])
  // Re-screening is local (no agent tokens): the same call the Jobs screen makes after saving a policy.
  const rescreen = async (): Promise<void> => {
    try { const r = await careerloom.prescreenJobs(); showToast(`Re-screened ${Object.keys(r.results).length} jobs`) } catch (e) { showToast(errorText(e), 'error', 6000) }
  }
  const s = status.data
  return (
    <Page title="Jobs & boards" blurb="How jobs are filtered before the agent spends tokens on them, and the limits scans work within.">
      <div data-setting-id="prescreen" className="flex flex-col gap-4">
        {status.error && <Note tone="warn">{status.error}</Note>}
        {s && <PrescreenPolicyEditor key={JSON.stringify(s.policy)} status={s} busy={false} reload={async () => status.reload()} rescreen={rescreen} />}
        {s && <PrescreenModelPanel status={s} busy={false} reload={async () => status.reload()} rescreen={rescreen} />}
      </div>
      <Group title="Scans and limits" focus="pipeline-limits">
        {LIMITS.map(([label, hint]) => <Row key={label} label={label} hint={hint} />)}
        <Row label="Boards" hint="Which boards are scanned, and how, is set per board.">
          <Button size="sm" variant="outline" onClick={() => navigate('boards')}>Open Boards</Button>
        </Row>
      </Group>
    </Page>
  )
}
