import { SettingChip } from '@/components/settings/SettingChip'
import { useAsync } from '@/components/copilot/api'
import { Group, Row } from '@/components/copilot/Group'
import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'
import { navigate } from '@/lib/nav'
import type { Section } from '@/components/Sidebar'
import { Page } from '@/sections/resume/PageStub'

/** What each runner may do, as the app describes it when you pick one (read-only: the sandbox is fixed per runner). */
export const RUNNER_PERMISSIONS: Array<{ id: string; label: string; may: string }> = [
  { id: 'claude', label: 'Claude Code', may: 'Can edit files and run career-ops scripts; nothing else without asking.' },
  { id: 'codex', label: 'Codex', may: 'Runs codex exec, sandboxed to the career-ops folder.' },
  { id: 'antigravity', label: 'Antigravity', may: 'Runs in agy’s sandbox: any command, but it can only write inside your career-ops folder.' },
  { id: 'opencode', label: 'OpenCode', may: 'Edits files and runs career-ops scripts only.' },
  { id: 'zen', label: 'OpenCode Zen (API)', may: 'Careerloom runs the agent itself on the OpenCode Zen API, with its own limited tools.' },
  { id: 'api', label: 'API key', may: 'Any model via OpenRouter. Covers evaluate, scan, pipeline and apply.' },
]

const ENTRYPOINTS: Array<{ section: Section; label: string; hint: string }> = [
  { section: 'agent', label: 'Agent chat', hint: 'Free-form asks to the agent.' },
  { section: 'jobs', label: 'Jobs', hint: 'Evaluate jobs one by one.' },
  { section: 'boards', label: 'Boards', hint: 'Scan boards for new jobs.' },
  { section: 'resume', label: 'Resume', hint: 'ATS analysis and résumé edits.' },
]

export function AgentPage() {
  const settings = useAsync(() => careerloom.getSettings(), [])
  const active = RUNNER_PERMISSIONS.find(r => r.id === settings.data?.runner)
  return (
    <Page title="Agent" blurb="Which runner does the work, what it is allowed to do, and where agent work starts.">
      <Group title="Active runner">
        <Row label="Runner" hint="Chosen and checked under AI › Runners.">
          <SettingChip label="Runner" value={active?.label ?? '…'} page="runners" focus={settings.data ? `runner:${settings.data.runner}` : undefined} />
        </Row>
      </Group>
      <Group title="What each runner may do" focus="agent-permissions">
        <table className="prose-table w-full text-sm" aria-label="Runner permissions">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2 font-medium">Runner</th><th className="pb-2 font-medium">May do</th></tr></thead>
          <tbody>
            {RUNNER_PERMISSIONS.map(r => (
              <tr key={r.id} className="border-t border-border align-top">
                <th scope="row" className="py-2 pr-4 text-left font-medium whitespace-nowrap">{r.label}{r.id === settings.data?.runner && <span className="ml-2 text-xs text-brand-text">active</span>}</th>
                <td className="py-2 text-muted-foreground">{r.may}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Group>
      <Group title="Where agent work starts">
        {ENTRYPOINTS.map(e => <Row key={e.section} label={e.label} hint={e.hint}><Button size="sm" variant="outline" onClick={() => navigate(e.section)}>Open</Button></Row>)}
      </Group>
    </Page>
  )
}
