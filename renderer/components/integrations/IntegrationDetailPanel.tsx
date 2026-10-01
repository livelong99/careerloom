import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ConfigForm } from './ConfigForm'
import type { IntegrationAction, IntegrationDetail } from '../../lib/types'

const ACTION_LABEL: Record<IntegrationAction, string> = {
  install: 'Install', remove: 'Remove', enable: 'Enable', disable: 'Disable',
  start: 'Start', stop: 'Stop', check: 'Check', update: 'Update', configure: 'Configure',
}

type Props = {
  detail: IntegrationDetail | null
  loading: boolean
  busy: IntegrationAction | null
  onAction: (action: IntegrationAction) => void
  onSaveConfig: (patch: Record<string, string | boolean | null>) => void
  /** Extra section under the checks (e.g. acknowledged sites, key link). */
  extra?: ReactNode
  /** Config keys not editable here (their editor lives elsewhere). */
  hideConfig?: readonly string[]
}

/** The expanded row: health checks, actions, an optional config form, and a log tail. */
export function IntegrationDetailPanel({ detail, loading, busy, onAction, onSaveConfig, extra, hideConfig }: Props) {
  if (loading || !detail) return <p className="p-3 text-sm text-muted-foreground" role="status">Loading details…</p>

  // career-ops' 'install' action means "npm install its dependencies", not
  // "install the skill" — the generic label would be misleading there.
  const labelFor = (action: IntegrationAction) => (detail.id === 'skill:career-ops' && action === 'install' ? 'Repair' : detail.id === 'service:firecrawl' && action === 'check' ? 'Test' : ACTION_LABEL[action])

  return (
    <div className="flex flex-col gap-3 p-3">
      {detail.path && <p className="truncate font-mono text-xs text-muted-foreground">{detail.path}</p>}
      {detail.checks.length > 0 && (
        <ul className="flex flex-col gap-1">
          {detail.checks.map(check => (
            <li key={check.label} className="flex items-center gap-2 text-sm">
              {check.ok ? <Check className="h-3.5 w-3.5 text-success" /> : <X className={check.optional ? 'h-3.5 w-3.5 text-muted-foreground' : 'h-3.5 w-3.5 text-destructive'} />}
              <span>{check.label}</span>
              {check.detail && <span className="text-xs text-muted-foreground">— {check.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      <ConfigForm fields={hideConfig ? detail.config.filter(f => !hideConfig.includes(f.key)) : detail.config} saving={busy === 'configure'} onSave={onSaveConfig} />
      {extra}
      {detail.logTail.length > 0 && (
        <pre className="max-h-40 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-xs">{detail.logTail.join('\n')}</pre>
      )}
      {detail.actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {detail.actions.map(action => (
            <Button
              key={action}
              size="sm"
              variant={action === 'remove' ? 'destructive' : action === 'install' || action === 'enable' || action === 'start' ? 'default' : 'secondary'}
              className={action === 'remove' ? 'ml-auto' : undefined}
              disabled={busy !== null}
              onClick={() => onAction(action)}
            >
              {busy === action ? 'Working…' : labelFor(action)}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
