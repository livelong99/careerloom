import { useMemo } from 'react'

import '../components/overview/overview.css'
import { ActivityHeatmap } from '../components/ActivityHeatmap'
import { EmptyNote } from '../components/EmptyState'
import { Icon } from '../components/icons'
import { Panel } from '../components/Panel'
import { Actions, type NextAction } from '../components/overview/Actions'
import { Goal } from '../components/overview/Goal'
import { Kpis, type Kpi } from '../components/overview/Kpis'
import { Widget, type WidgetState } from '../components/overview/kit'
import { openJobsWith, openScoreBand, openStage } from '../components/overview/jobsLink'
import { Pipeline } from '../components/overview/Pipeline'
import { ScoreHistogram, ScoreTable } from '../components/overview/ScoreHistogram'
import { Sources } from '../components/overview/Sources'
import { Spend, SpendTable } from '../components/overview/Spend'
import { Timeline, TimelineTable } from '../components/overview/Timeline'
import { useRange } from '../components/overview/useRange'
import type { Section } from '../components/Sidebar'
import { SectionSkeleton } from '../components/Skeleton'
import { usePolled, type Polled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { formatUsd } from '../lib/format'
import { careerloom } from '../lib/ipc'
import { navigate, openRuns } from '../lib/nav'
import {
  RANGES, STRONG_SCORE, actionSignals, dailyCountsTo, dayOf, delta, evaluatedDay, inPrev, inWindow, mean, pipeline, rangeWindow, responseRate,
  scoreBins, sourceYield, spendSeries, sparkDays, timeline, weekStart, type RangeId,
} from '../lib/overviewData'
import { dailyCounts, stageOf } from '../lib/stages'
import { localDateKey } from '../lib/period'

const POLL_MS = 30_000
const none = <T,>(p: Polled<T>) => !p.data && !p.error
const failed = (...ps: Array<Polled<unknown>>) => ps.find(p => p.error && !p.data)?.error?.message
function state(ps: Array<Polled<unknown>>, empty: boolean): WidgetState {
  if (ps.some(p => p.error && !p.data)) return 'error'
  if (ps.some(none)) return 'loading'
  return empty ? 'empty' : 'ready'
}

export function Overview({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const { generation, start } = useRuns()
  const [range, setRange] = useRange()
  const w = useMemo(() => rangeWindow(range), [range])
  const dep = [generation]
  const opts = { intervalMs: POLL_MS }
  const tracker = usePolled(() => careerloom.getTracker(), dep, { ...opts, memoKey: 'tracker' })
  const jobsP = usePolled(() => careerloom.listJobs(), dep, { ...opts, memoKey: 'ov-jobs' })
  const screens = usePolled(() => careerloom.readPrescreen(), dep, { ...opts, memoKey: 'ov-screens' })
  const portals = usePolled(() => careerloom.listPortals(), dep, { ...opts, memoKey: 'ov-portals' })
  const scans = usePolled(() => careerloom.listScans(), dep, { ...opts, memoKey: 'ov-scans' })
  const profile = usePolled(() => careerloom.profileStatus(), dep, { intervalMs: null })
  const metrics = usePolled(() => careerloom.getMetrics(w.days === null ? null : { from: w.from, to: w.to }), [w.from, generation], { ...opts, memoKey: `ov-metrics-${w.from}` })
  const prevMetrics = usePolled(() => (w.prevFrom && w.prevTo ? careerloom.getMetrics({ from: w.prevFrom, to: w.prevTo }) : Promise.resolve(null)), [w.prevFrom, generation], { ...opts, memoKey: `ov-metrics-prev-${w.prevFrom}` })
  const all = [tracker, jobsP, screens, portals, scans, metrics, prevMetrics]
  const refreshAll = () => { for (const p of all) p.refresh() }
  const asOf = Math.max(0, ...all.map(p => p.lastSuccessAt ?? 0))

  const apps = tracker.data ?? []
  const jobs = jobsP.data ?? []
  const cur = useMemo(() => (d: string | null) => inWindow(d, w), [w])
  const prev = useMemo(() => (d: string | null) => inPrev(d, w), [w])
  const names = useMemo(() => new Map((portals.data ?? []).map(p => [p.id, p.name])), [portals.data])
  const screened = useMemo(() => new Set(Object.keys(screens.data ?? {})), [screens.data])

  const stages = useMemo(() => pipeline(jobs, screened, apps, cur), [jobs, screened, apps, cur])
  const bins = useMemo(() => scoreBins(jobs.filter(j => cur(evaluatedDay(j))).map(j => j.score)), [jobs, cur])
  const buckets = useMemo(() => timeline(apps, w, apps.map(a => dayOf(a.date)).filter((d): d is string => !!d).sort()[0] ?? null), [apps, w])
  const sources = useMemo(() => sourceYield(jobs, names, cur), [jobs, names, cur])
  const spend = useMemo(() => spendSeries(metrics.data?.daily ?? [], w), [metrics.data, w])
  const heat = useMemo(() => dailyCounts(apps.filter(a => cur(dayOf(a.date)))), [apps, cur])
  const weekDone = useMemo(() => { const from = weekStart(); const to = localDateKey(new Date()); return apps.filter(a => { const d = dayOf(a.date); return d !== null && d >= from && d <= to && stageOf(a.status) !== 'evaluated' }).length }, [apps])

  const kpis: Kpi[] = useMemo(() => {
    const n = sparkDays(w)
    const found = (f: (d: string | null) => boolean) => jobs.filter(j => f(dayOf(j.firstSeen))).length
    const evald = (f: (d: string | null) => boolean) => jobs.filter(j => f(evaluatedDay(j)))
    const sent = (f: (d: string | null) => boolean) => apps.filter(a => f(dayOf(a.date)) && stageOf(a.status) !== 'evaluated').length
    const avg = (f: (d: string | null) => boolean) => mean(evald(f).map(j => j.score ?? 0))
    const base = w.prevFrom !== null
    const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`)
    const rr = responseRate(apps, cur)
    const cost = metrics.data?.totals.costUsd ?? 0
    const loadingJobs = none(jobsP) || none(tracker)
    return [
      { id: 'new', label: 'New jobs', value: String(found(cur)), delta: base ? delta(found(cur), found(prev)) : null, spark: dailyCountsTo(jobs.map(j => dayOf(j.firstSeen)), w.to, n), loading: none(jobsP) },
      { id: 'eval', label: 'Evaluated', value: String(evald(cur).length), delta: base ? delta(evald(cur).length, evald(prev).length) : null, spark: dailyCountsTo(jobs.map(evaluatedDay), w.to, n), loading: none(jobsP) },
      { id: 'fit', label: 'Avg fit score', value: avg(cur) === null ? '—' : avg(cur)!.toFixed(1), delta: base ? delta(avg(cur), avg(prev)) : null, fmt: x => x.toFixed(1), spark: dailyCountsTo(evald(cur).filter(j => (j.score ?? 0) >= STRONG_SCORE).map(evaluatedDay), w.to, n), loading: none(jobsP) },
      { id: 'apps', label: 'Applications', value: String(sent(cur)), delta: base ? delta(sent(cur), sent(prev)) : null, spark: dailyCountsTo(apps.filter(a => stageOf(a.status) !== 'evaluated').map(a => dayOf(a.date)), w.to, n), loading: loadingJobs && none(tracker) },
      { id: 'resp', label: 'Response rate', value: pct(rr), delta: base ? delta(rr === null ? null : rr * 100, responseRate(apps, prev) === null ? null : responseRate(apps, prev)! * 100) : null, fmt: x => `${x.toFixed(0)} pts`, spark: dailyCountsTo(apps.filter(a => stageOf(a.status) !== 'evaluated' && stageOf(a.status) !== 'applied').map(a => dayOf(a.date)), w.to, n), loading: none(tracker) },
      { id: 'spend', label: 'Agent spend', value: formatUsd(cost), delta: base && prevMetrics.data ? delta(cost, prevMetrics.data.totals.costUsd) : null, good: 'down', fmt: formatUsd, spark: spend.map(d => d.costUsd), loading: none(metrics) },
    ]
  }, [w, jobs, apps, cur, prev, metrics.data, prevMetrics.data, spend, jobsP, tracker, metrics])

  const lastScan = Math.max(0, ...(scans.data ?? []).filter(s => s.status === 'done').map(s => s.startedAt))
  const actions: NextAction[] = useMemo(() => {
    const out: NextAction[] = []
    for (const s of actionSignals(jobs, apps, lastScan || null)) {
      if (s.id === 'strong') out.push({ id: s.id, icon: 'sparkles', title: `${s.count} strong ${s.count === 1 ? 'match' : 'matches'} waiting`, sub: `Evaluated at ${STRONG_SCORE}+ and not applied yet.`, label: 'Review', run: () => openJobsWith({ states: ['evaluated'], scoreMin: STRONG_SCORE }) })
      else if (s.id === 'followups') out.push({ id: s.id, icon: 'calendar-range', title: `${s.count} ${s.count === 1 ? 'application needs' : 'applications need'} a follow-up`, sub: 'Applied a week or more ago with no reply.', label: 'Open', run: () => openJobsWith({ states: ['applied'] }) })
      else out.push({ id: s.id, icon: 'refresh-cw', title: s.daysSince === null ? 'No scan yet' : `Last scan was ${s.daysSince} days ago`, sub: 'Scan your boards for new roles.', label: 'Scan now', run: () => void start('scan').then(r => openRuns(r?.id)) })
    }
    for (const f of (metrics.data?.findings ?? []).filter(x => x.severity !== 'low' && x.action).slice(0, 2)) {
      const a = f.action!
      out.push({ id: f.id, icon: 'trending-up', title: f.title, sub: f.detail, label: a.label, run: () => (a.kind === 'mode' ? void start(a.mode, a.input).then(r => openRuns(r?.id)) : onNavigate(a.section as Section)) })
    }
    return out
  }, [jobs, apps, lastScan, metrics.data, start, onNavigate])

  if (tracker.error && !tracker.data) {
    return (
      <Panel title="Couldn't read your tracker">
        <EmptyNote>{tracker.error.message} Check that your career-ops folder in Settings still has data/applications.md.</EmptyNote>
        <div className="error-actions">
          <button type="button" className="btnp" onClick={() => tracker.refresh()}>Try again</button>
          <button type="button" className="btnp" onClick={() => onNavigate('settings')}>Open Settings</button>
        </div>
      </Panel>
    )
  }
  if (!tracker.data && !jobsP.data) return <SectionSkeleton label="Reading your tracker" chart />

  const missing = profile.data ? (['cv', 'profile', 'portals'] as const).filter(k => !profile.data![k]) : []
  const jobsEmpty = (xs: unknown[]) => xs.length === 0
  const findJobs = <button type="button" className="btnp btnp-primary" onClick={() => onNavigate('jobs')}>Find jobs</button>
  const weekly = (w.days ?? 91) > 31
  const hasSpend = (metrics.data?.totals.runs ?? 0) > 0

  return (
    <div className="ovx">
      <header className="ovx-head">
        <div role="radiogroup" aria-label="Date range" className="ovx-range">
          {RANGES.map(r => (
            <button key={r.id} type="button" role="radio" aria-checked={range === r.id} className={range === r.id ? 'on' : undefined} onClick={() => setRange(r.id as RangeId)}>{r.label}</button>
          ))}
        </div>
        <span className="ovx-asof" aria-live="polite">{asOf ? `As of ${new Date(asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading'}</span>
        <button type="button" className="btnp ovx-refresh" onClick={refreshAll} aria-label="Refresh overview"><Icon name="refresh-cw" />Refresh</button>
      </header>

      {missing.length > 0 && (
        <Panel title="Finish setting up career-ops" right={<button type="button" className="btnp btnp-primary" onClick={() => void start('interview').then(r => openRuns(r?.id))}>Build my profile with the agent</button>}>
          {missing.map(k => <div key={k} className="check miss"><Icon name="circle" />{{ cv: 'cv.md — your CV in markdown', profile: 'config/profile.yml — targets, comp range, location', portals: 'portals.yml — companies and boards to scan' }[k]}</div>)}
        </Panel>
      )}

      <Kpis items={kpis} />

      <Widget className="ovx-s12" title="Pipeline" height={190} state={state([jobsP, tracker], jobsEmpty(jobs) && jobsEmpty(apps))} error={failed(jobsP, tracker)} onRetry={refreshAll}
        emptyText="Nothing in the pipeline yet. Paste a job link or scan your boards and the agent fills this in." emptyAction={findJobs}
        extra={<span className="ovx-hint">Click a stage to open it in Jobs</span>}
        chart={<Pipeline stages={stages} onStage={openStage} />} />

      <Widget className="ovx-s5" title="Score distribution" height={210} state={state([jobsP], bins.every(b => b.count === 0))} error={failed(jobsP)} onRetry={refreshAll}
        emptyText="No evaluated jobs in this range yet." emptyAction={<button type="button" className="btnp" onClick={() => onNavigate('jobs')}>Evaluate a role</button>}
        chart={<ScoreHistogram bins={bins} onBin={b => openScoreBand(b.lo, b.hi)} />} table={<ScoreTable bins={bins} />} />

      <Widget className="ovx-s7" title="Applications over time" height={210} state={state([tracker], buckets.every(b => b.total === 0))} error={failed(tracker)} onRetry={refreshAll}
        extra={<span className="ovx-hint">{weekly ? 'per week' : 'per day'}</span>}
        emptyText="No applications in this range. Mark a role as applied in Jobs and it shows up here." emptyAction={findJobs}
        chart={<Timeline buckets={buckets} weekly={weekly} />} table={<TimelineTable buckets={buckets} weekly={weekly} />} />

      <Widget className="ovx-s6" title="Source yield" height={250} state={state([jobsP, portals], sources.length === 0)} error={failed(jobsP, portals)} onRetry={refreshAll}
        emptyText="No jobs found in this range. Scan your boards to see which ones pay off." emptyAction={<button type="button" className="btnp" onClick={() => navigate('boards')}>Open Boards</button>}
        chart={<Sources rows={sources} threshold={STRONG_SCORE} onRow={id => openJobsWith({ portals: [id] })} />} />

      <Widget className="ovx-s6" title="Agent cost and runs" height={250} state={state([metrics], !hasSpend)} error={failed(metrics)} onRetry={refreshAll}
        extra={<button type="button" className="ovx-link" onClick={() => onNavigate('monitoring')}>Monitoring<Icon name="chevron-right" /></button>}
        emptyText="No agent runs in this range." emptyAction={<button type="button" className="btnp" onClick={() => onNavigate('agent')}>Ask the agent</button>}
        chart={<Spend days={spend} successRate={metrics.data?.totals.successRate ?? 0} totalCost={metrics.data?.totals.costUsd ?? 0} totalRuns={metrics.data?.totals.runs ?? 0} />} table={<SpendTable days={spend} />} />

      <Widget className="ovx-s5" title="Next best actions" height={200} state={state([jobsP, tracker, scans], actions.length === 0)} error={failed(jobsP, tracker, scans)} onRetry={refreshAll}
        emptyText="You're caught up. Nothing needs attention right now." chart={<Actions items={actions} />} />

      <Widget className="ovx-s3" title="Weekly goal" height={200} state={state([tracker], false)} error={failed(tracker)} onRetry={refreshAll} chart={<Goal done={weekDone} />} />

      <Widget className="ovx-s4" title="Activity" height={200} state={state([tracker], heat.length === 0)} error={failed(tracker)} onRetry={refreshAll}
        emptyText="No activity in this range." chart={<ActivityHeatmap daily={heat} bare />} />
    </div>
  )
}
