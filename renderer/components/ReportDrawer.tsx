import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { useEscape } from '../hooks/useEscape'
import { careerloom } from '../lib/ipc'
import type { Application } from '../lib/types'
import { EmptyNote } from './EmptyState'
import { Icon } from './icons'
import { Markdown } from './Markdown'
import { ScoreBadge, StageBadge } from './Badges'

// One-click follow-ups on an evaluated role; each is a career-ops mode keyed by report number.
const ACTIONS = [
  { mode: 'pdf', label: 'Tailor CV' },
  { mode: 'cover', label: 'Cover letter' },
  { mode: 'apply', label: 'Draft answers' },
  { mode: 'interview-prep', label: 'Interview prep' },
  { mode: 'contacto', label: 'Outreach' },
] as const

/** Side drawer for one tracked application: its evaluation report + actions. */
export function ReportDrawer({ app, onClose }: { app: Application; onClose: () => void }) {
  const { start } = useRuns()
  useEscape(true, onClose)
  const report = usePolled(
    () => (app.report ? careerloom.readReport(app.report) : Promise.resolve('')),
    [app.report],
    { intervalMs: null },
  )
  const url = report.data?.match(/^\*\*URL:\*\*\s*(\S+)/m)?.[1] ?? null
  const reportNo = String(app.num)

  return (
    <>
      <div className="drawer-scrim" aria-hidden="true" onClick={onClose} />
      <aside className="session-drawer wide" role="dialog" aria-modal="true" aria-label={`${app.company} — ${app.role}`} tabIndex={-1}>
        <div className="drawer-head">
          <div>
            <h3 className="drawer-title">{app.company}</h3>
            <div className="drawer-sub">{app.role} · #{app.num} · {app.date}</div>
          </div>
          <button type="button" className="drawer-close" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="row-actions">
          <ScoreBadge score={app.score} />
          <StageBadge status={app.status} />
        </div>
        <div className="row-actions">
          {ACTIONS.map(a => (
            <button key={a.mode} type="button" className="btnp" onClick={() => void start(a.mode, reportNo)}>{a.label}</button>
          ))}
          {url && <button type="button" className="btnp" onClick={() => void careerloom.openExternal(url)}>Job posting <Icon name="arrow-up-right" /></button>}
        </div>
        {app.notes && <p className="drawer-note">{app.notes}</p>}
        {report.error
          ? <EmptyNote>{report.error.message}</EmptyNote>
          : report.data
            ? <Markdown source={report.data} />
            : <EmptyNote>{app.report ? 'Loading report…' : 'No evaluation report linked to this row.'}</EmptyNote>}
      </aside>
    </>
  )
}
