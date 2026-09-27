import { useState } from 'react'

import { ActivityHeatmap } from '../components/ActivityHeatmap'
import { ScoreBadge, StageBadge } from '../components/Badges'
import { EmptyNote } from '../components/EmptyState'
import { Icon, type IconName } from '../components/icons'
import { ListRow } from '../components/ListRow'
import { Panel } from '../components/Panel'
import { openRuns } from '../components/RunsDrawer'
import { ReportDrawer } from '../components/ReportDrawer'
import { Sankey } from '../components/Sankey'
import { SectionSkeleton } from '../components/Skeleton'
import type { Section } from '../components/Sidebar'
import { Stat } from '../components/Stat'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { careerloom } from '../lib/ipc'
import { dailyCounts, isActive, sourceFlow, stageOf } from '../lib/stages'
import type { Application } from '../lib/types'

const POLL_MS = 15_000

export function Overview({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const { generation, start } = useRuns()
  const tracker = usePolled(() => careerloom.getTracker(), [generation], { intervalMs: POLL_MS, memoKey: 'tracker' })
  const profile = usePolled(() => careerloom.profileStatus(), [generation], { intervalMs: null })
  const [open, setOpen] = useState<Application | null>(null)

  if (tracker.error) {
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
  if (!tracker.data) return <SectionSkeleton label="Reading your tracker" chart />
  const apps = tracker.data

  const scored = apps.filter(a => a.score !== null)
  const avg = scored.length ? scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length : null
  const count = (id: string) => apps.filter(a => stageOf(a.status) === id).length
  const topMatches = apps
    .filter(a => stageOf(a.status) === 'evaluated' && (a.score ?? 0) >= 4)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 6)
  const awaiting = count('evaluated')
  const interviewing = count('interview')
  const nextSteps: Array<{ icon: IconName; title: string; sub: string; action: string; to: Section }> = [
    ...(awaiting > 0 ? [{ icon: 'list' as const, title: `Decide on ${awaiting} evaluated ${awaiting === 1 ? 'role' : 'roles'}`, sub: 'Apply, skip, or ask the agent for a tailored CV.', action: 'Review', to: 'jobs' as const }] : []),
    ...(interviewing > 0 ? [{ icon: 'calendar-range' as const, title: `${interviewing} ${interviewing === 1 ? 'interview' : 'interviews'} in progress`, sub: 'Keep notes and next steps on each role.', action: 'Open Jobs', to: 'jobs' as const }] : []),
    { icon: 'trending-up', title: 'See what to improve', sub: 'Search health and suggested fixes from your run history.', action: 'Open Monitoring', to: 'monitoring' },
  ]
  const missing = profile.data ? (['cv', 'profile', 'portals'] as const).filter(k => !profile.data![k]) : []

  return (
    <>
      {missing.length > 0 && (
        <Panel title="Finish setting up career-ops" right={<button type="button" className="btnp btnp-primary" onClick={() => void start('interview').then(openRuns)}>Build my profile with the agent</button>}>
          {(['cv', 'profile', 'portals'] as const).map(k => (
            <div key={k} className={profile.data?.[k] ? 'check ok' : 'check miss'}>
              <Icon name={profile.data?.[k] ? 'circle-check' : 'circle'} />
              {{ cv: 'cv.md — your CV in markdown', profile: 'config/profile.yml — targets, comp range, location', portals: 'portals.yml — companies and boards to scan' }[k]}
            </div>
          ))}
        </Panel>
      )}

      <div className="stats">
        <Stat label="Tracked roles" value={apps.length} delta={`${awaiting} awaiting a decision`} />
        <Stat label="Average fit" value={avg === null ? '—' : `${avg.toFixed(1)} / 5`} delta={`${scored.filter(a => (a.score ?? 0) >= 4).length} scored 4+`} />
        <Stat label="In flight" value={apps.filter(isActive).length} delta={`${interviewing} interviewing`} />
        <Stat label="Offers" value={count('offer') + count('hired')} delta={`${count('rejected')} rejected`} />
      </div>

      {apps.length === 0 ? (
        <Panel title="No applications yet">
          <EmptyNote>Paste a job link in Jobs. The agent evaluates it, scores the fit 1–5, and adds it here.</EmptyNote>
          <div className="row-actions"><button type="button" className="btnp btnp-primary" onClick={() => onNavigate('jobs')}>Find jobs</button></div>
        </Panel>
      ) : (
        <>
          <Panel title="Top matches waiting on you" right={<a href="#jobs" onClick={e => { e.preventDefault(); onNavigate('jobs') }}>See all<Icon name="chevron-right" /></a>} rightLink>
            {topMatches.length === 0
              ? <EmptyNote>No evaluated roles scored 4+ yet. Scan portals from Jobs to find more.</EmptyNote>
              : topMatches.map(a => (
                  <ListRow key={a.num} title={a.company} sub={a.role} value={<><ScoreBadge score={a.score} /> <StageBadge status={a.status} /></>} onClick={() => setOpen(a)} />
                ))}
          </Panel>
          <Panel title="What to do next">
            <div className="next-steps">
              {nextSteps.map(step => (
                <div key={step.title} className="next-step">
                  <Icon name={step.icon} />
                  <div className="tx">{step.title}<small>{step.sub}</small></div>
                  <button type="button" className="btnp" onClick={() => onNavigate(step.to)}>{step.action}</button>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Where roles came from → where they are now">
            <Sankey flow={sourceFlow(apps)} />
          </Panel>
          <Panel title="Activity">
            <ActivityHeatmap daily={dailyCounts(apps)} bare />
          </Panel>
        </>
      )}
      {open && <ReportDrawer app={open} onClose={() => setOpen(null)} />}
    </>
  )
}
