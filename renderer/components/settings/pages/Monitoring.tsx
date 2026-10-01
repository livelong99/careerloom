import { useState } from 'react'

import { errorText, useAsync } from '@/components/copilot/api'
import { Group, Note, Row } from '@/components/copilot/Group'
import { selectClass } from '@/components/copilot/hwControls'
import { SettingChip } from '@/components/settings/SettingChip'
import { applyWithUndo } from '../kit'
import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'
import { ACT_SLOW_MS, REFRESH_OPTIONS, YIELD_SLOW_MS, useRefreshCadence } from '@/lib/refreshCadence'
import { showToast } from '@/lib/toast'
import { Page } from '@/sections/resume/PageStub'
import { usePrefs } from '../usePrefs'

const KEEP = [{ value: 'forever', label: 'Keep forever', days: null }, ...[30, 90, 180, 365].map(d => ({ value: String(d), label: `${d} days`, days: d }))]
/** Titles of the checks in electron/metrics.ts that can raise a finding. */
const FINDINGS = ['Finish setting up your profile', 'Strong matches waiting on you', 'No recent portal scan', 'Inbox is backing up', 'Average fit is low', 'A runner is failing often', 'Follow-ups due', 'Look for rejection patterns', 'Evaluations costing more than they need to']
const minutes = (ms: number) => `${ms / 60_000} min`
const mb = (b: number) => `${(b / 1_048_576).toFixed(1)} MB`

export function MonitoringPage() {
  const { prefs, patch, error } = usePrefs()
  const cadence = useRefreshCadence()
  const stats = useAsync(() => careerloom.dataStats(), [])
  const [pruning, setPruning] = useState(false)
  const label = REFRESH_OPTIONS.find(o => o.value === cadence.value)?.label ?? cadence.value
  const days = prefs?.retention.runLogDays ?? null

  async function prune(): Promise<void> {
    setPruning(true)
    try { const r = await careerloom.retentionPrune(); showToast(r.removedFiles ? `Removed ${r.removedFiles} run logs (${mb(r.freedBytes)})` : 'Nothing to remove'); stats.reload() } catch (e) { showToast(errorText(e), 'error') } finally { setPruning(false) }
  }
  return (
    <Page title="Monitoring" blurb="How often the dashboards refresh, how long run logs are kept, and what raises a finding.">
      {error && <Note tone="warn">{error}</Note>}
      <Group title="Refresh">
        <Row label="Live data" hint={`Set under General. Shown values refresh ${cadence.intervalMs === null ? 'only when you ask (⌘R)' : `every ${label.toLowerCase()}`}, half as often on battery.`}>
          <SettingChip label="Refresh" value={label} page="general" focus="refresh" />
        </Row>
        <Row label="Slow reports" hint="The tracker report and yield report each cost a full agent-CLI call, so they refresh on a longer timer, never faster than live.">
          <span className="text-xs text-muted-foreground">{minutes(YIELD_SLOW_MS)} and {minutes(ACT_SLOW_MS)}</span>
        </Row>
      </Group>
      <Group title="Run logs">
        <Row label="Keep run logs for" htmlFor="mon-retention" hint="Older logs are deleted. Run history and costs stay; only the saved output is removed. Upgrading never deletes anything by itself.">
          <select id="mon-retention" className={selectClass} disabled={!prefs} value={days === null ? 'forever' : String(days)} onChange={e => { const k = KEEP.find(o => o.value === e.target.value); if (k) applyWithUndo(`Run-log retention: ${k.label}`, days, k.days, v => patch({ retention: { runLogDays: v } })) }}>
            {KEEP.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Row>
        <Row label="Now" hint={stats.data ? `${stats.data.runLogFiles} log files, ${mb(stats.data.runLogBytes)}.` : stats.error ?? 'Counting…'}>
          <Button size="sm" variant="outline" disabled={pruning || days === null} onClick={() => void prune()}>{pruning ? 'Cleaning…' : 'Delete older logs now'}</Button>
        </Row>
      </Group>
      <Group title="What raises a finding">
        <ul className="m-0 grid list-none gap-1 p-0 text-sm text-muted-foreground sm:grid-cols-2">{FINDINGS.map(f => <li key={f}>{f}</li>)}</ul>
        <p className="m-0 mt-2 text-xs text-muted-foreground">These checks are built in and read-only.</p>
      </Group>
    </Page>
  )
}
