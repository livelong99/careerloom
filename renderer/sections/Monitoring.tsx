import { useMemo, useState } from 'react'

import { EmptyNote } from '../components/EmptyState'
import { contiguousDaily, dailyChartWindow } from '../components/monitoring/dailyWindow'
import { Findings } from '../components/monitoring/Findings'
import { cumulativeFunnel, hasUnknownDepth } from '../components/monitoring/funnel'
import { HealthGauge } from '../components/monitoring/HealthGauge'
import { colorForRunner, RunnerBars } from '../components/monitoring/RunnerBars'
import { RunPunchcard } from '../components/monitoring/RunPunchcard'
import { ListRow } from '../components/ListRow'
import { Panel } from '../components/Panel'
import { SectionSkeleton } from '../components/Skeleton'
import { SegTabs } from '../components/SegTabs'
import type { Section } from '../components/Sidebar'
import { Stat } from '../components/Stat'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { careerloom } from '../lib/ipc'
import { formatCompact, formatCount, formatDuration, formatUsd } from '../lib/format'
import { localDateKey } from '../lib/period'
import type { DateRange, MetricBucket } from '../lib/types'

const POLL_MS = 15_000
type RangeOpt = '7d' | '30d' | 'all'
const RANGE_OPTIONS = [{ value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'all', label: 'All time' }]

function rangeFor(opt: RangeOpt): DateRange | null {
  if (opt === 'all') return null
  const days = opt === '7d' ? 7 : 30
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
  return { from: localDateKey(from), to: localDateKey(now) }
}

/** career-ops' funnel-velocity.mjs `waiting` block, read defensively (Metrics.velocity is `unknown`). */
function velocitySummary(velocity: unknown): string | null {
  if (!velocity || typeof velocity !== 'object') return null
  const waiting = (velocity as { waiting?: { inFlight?: number; windowDays?: [number, number] } }).waiting
  if (!waiting?.inFlight) return null
  const window = waiting.windowDays
  return `${formatCount(waiting.inFlight, 'application')} waiting on a response${window ? ` — typical window is ${window[0]}–${window[1]} days` : ''}.`
}

function BreakdownRow({ bucket, color }: { bucket: MetricBucket & { share: number }; color?: string }) {
  return (
    <ListRow
      dotColor={color}
      title={bucket.id}
      sub={<span className="mt-1 block h-1 w-24 rounded-full bg-[var(--fill)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${bucket.share}%`, background: color }} /></span>}
      value={`${formatCount(bucket.runs, 'run')} · ${formatUsd(bucket.costUsd)}`}
    />
  )
}

export function Monitoring({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const { generation } = useRuns()
  const [rangeOpt, setRangeOpt] = useState<RangeOpt>('30d')
  const range = useMemo(() => rangeFor(rangeOpt), [rangeOpt])
  const metrics = usePolled(() => careerloom.getMetrics(range), [generation, range?.from, range?.to], { intervalMs: POLL_MS })
  const tracker = usePolled(() => careerloom.getTracker(), [generation], { intervalMs: POLL_MS, memoKey: 'tracker' })
  const profile = usePolled(() => careerloom.profileStatus(), [generation], { intervalMs: null })

  if (metrics.error) {
    return (
      <Panel title="Couldn't read run history">
        <EmptyNote>{metrics.error.message}</EmptyNote>
        <div className="error-actions"><button type="button" className="btnp" onClick={() => void metrics.refresh()}>Try again</button></div>
      </Panel>
    )
  }
  if (!metrics.data) return <SectionSkeleton label="Reading run history" chart />

  const m = metrics.data
  const apps = tracker.data ?? []
  const funnelCounts = cumulativeFunnel(apps)
  const evaluatedTotal = funnelCounts[0]?.count ?? 0
  const appliedTotal = funnelCounts[1]?.count ?? 0
  const applyRate = evaluatedTotal ? appliedTotal / evaluatedTotal : 0
  const profileFraction = profile.data ? (['cv', 'profile', 'portals'] as const).filter(k => profile.data![k]).length / 3 : 0
  const velocityLine = velocitySummary(m.velocity)

  const chartWindow = dailyChartWindow(range, m.daily)
  const chartDaily = chartWindow ? contiguousDaily(m.daily, chartWindow.from, chartWindow.to) : m.daily
  const maxRunnerRuns = Math.max(1, ...m.byRunner.map(b => b.runs))
  const maxModeRuns = Math.max(1, ...m.byMode.map(b => b.runs))
  const withShare = (buckets: MetricBucket[], max: number) => buckets.map(b => ({ ...b, share: (b.runs / max) * 100 }))

  return (
    <>
      <Panel title="Agent runs" right={<SegTabs options={RANGE_OPTIONS} value={rangeOpt} onChange={v => setRangeOpt(v as RangeOpt)} />}>
        {m.totals.runs === 0 ? (
          <>
            <EmptyNote>No runs in this period. Evaluate a job or scan portals and the activity shows up here.</EmptyNote>
            <div className="error-actions"><button type="button" className="btnp btnp-primary" onClick={() => onNavigate('agent')}>Open Agent</button></div>
          </>
        ) : (
          <div className="stats">
            <Stat label="Runs" value={m.totals.runs} delta={`${m.totals.failed} failed · ${m.totals.cancelled} cancelled`} />
            <Stat label="Success rate" value={`${Math.round(m.totals.successRate * 100)}%`} />
            <Stat label="Total cost" value={formatUsd(m.totals.costUsd)} delta={`${formatCompact(m.totals.tokens)} tokens`} />
            <Stat label="Avg duration" value={formatDuration(m.totals.avgDurationMs)} />
          </div>
        )}
      </Panel>

      <Panel title="Search health">
        <HealthGauge profileFraction={profileFraction} applyRate={applyRate} successRate={m.totals.runs > 0 ? m.totals.successRate : null} />
      </Panel>

      {m.totals.runs > 0 && (
        <>
          <Panel title="Daily runs">
            <RunnerBars daily={chartDaily} />
          </Panel>
          <Panel title="When you run the agent">
            <RunPunchcard starts={m.starts} />
          </Panel>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Panel title="By runner">
              {withShare(m.byRunner, maxRunnerRuns).map(b => <BreakdownRow key={b.id} bucket={b} color={colorForRunner(b.id)} />)}
            </Panel>
            <Panel title="By mode">
              {withShare(m.byMode, maxModeRuns).map(b => <BreakdownRow key={b.id} bucket={b} color="var(--accent)" />)}
            </Panel>
          </div>
        </>
      )}

      <Panel title="Job funnel" right={velocityLine ?? undefined}>
        {apps.length === 0 ? (
          <EmptyNote>No applications tracked yet. Evaluated jobs from Jobs fill this funnel.</EmptyNote>
        ) : (
          <>
            {funnelCounts.map(stage => (
              <ListRow
                key={stage.id}
                title={stage.label}
                value={`${stage.count} · ${evaluatedTotal ? Math.round((stage.count / evaluatedTotal) * 100) : 0}%`}
              />
            ))}
            {hasUnknownDepth(apps) && (
              <p className="empty-note">Rejected, discarded and skipped roles count only toward Evaluated — how far they got before that isn't recorded.</p>
            )}
          </>
        )}
      </Panel>

      <Panel title="Steps to improve">
        <Findings findings={m.findings} onNavigate={onNavigate} />
      </Panel>
    </>
  )
}
