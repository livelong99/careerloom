import { EmptyNote } from '../EmptyState'
import type { Section } from '../Sidebar'
import { useRuns } from '../../hooks/useRuns'
import type { Finding, FindingSeverity } from '../../lib/types'

// `.opt-findings`/`.opt-finding-title`/`.opt-explanation`/`.opt-impact*` are
// codeburn's real (now shared) CSS — self-contained rules, safe to reuse.
// `.opt-finding`/`.opt-finding-detail` are NOT: they're unlayered `display:
// grid`/bordered-panel rules built for codeburn's toggle-to-expand row, and
// beat Tailwind's `@layer utilities` regardless of specificity — hence the
// dot-above-title layout break. This row uses its own flex layout instead.
const SEVERITY_LABEL: Record<FindingSeverity, string> = { high: 'High', medium: 'Medium', low: 'Low' }

function FindingCard({ finding, onNavigate }: { finding: Finding; onNavigate: (s: Section) => void }) {
  const { start } = useRuns()
  const action = finding.action
  return (
    <div className="flex items-center gap-3 border-t border-[var(--line2)] py-3 first:border-0">
      <span className={`opt-impact opt-impact-${finding.severity} shrink-0`}>{SEVERITY_LABEL[finding.severity]}</span>
      <div className="min-w-0 flex-1">
        <b className="opt-finding-title block">{finding.title}</b>
        <p className="opt-explanation">{finding.detail}</p>
      </div>
      {action && (
        <button
          type="button"
          className="btnp shrink-0"
          onClick={() => (action.kind === 'mode' ? void start(action.mode, action.input) : onNavigate(action.section as Section))}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export function Findings({ findings, onNavigate }: { findings: Finding[]; onNavigate: (s: Section) => void }) {
  if (!findings.length) return <EmptyNote>Nothing to flag right now — search health looks good.</EmptyNote>
  return (
    <div className="opt-findings">
      {findings.map(finding => <FindingCard key={finding.id} finding={finding} onNavigate={onNavigate} />)}
    </div>
  )
}
