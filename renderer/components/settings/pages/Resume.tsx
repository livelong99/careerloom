import { errorText, useAsync } from '@/components/copilot/api'
import { Group, Note, Row } from '@/components/copilot/Group'
import { SegTabs } from '@/components/SegTabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { careerloom } from '@/lib/ipc'
import { goToSettings, navigate } from '@/lib/nav'
import type { DocsDefaults } from '@/lib/types'
import { Page } from '@/sections/resume/PageStub'
import { applyWithUndo } from '../kit'
import { usePrefs } from '../usePrefs'

const TONES = [{ value: 'concise', label: 'Concise' }, { value: 'warm', label: 'Warm' }, { value: 'formal', label: 'Formal' }]
const LENGTHS = [{ value: 'short', label: 'Short' }, { value: 'standard', label: 'Standard' }]

export function ResumePage() {
  const { prefs, patch, error } = usePrefs()
  const model = useAsync(() => careerloom.localModelStatus(), [])
  const where = useAsync(() => careerloom.dataLocations(), [])
  const overview = useAsync(() => careerloom.resumeOverview(), [])
  const root = where.data?.find(l => l.id === 'careerOps')?.path ?? null
  const docs = <K extends keyof DocsDefaults>(key: K, label: string, next: DocsDefaults[K]) => {
    const prev = prefs?.docs[key]
    if (prev === undefined) return void patch({ docs: { [key]: next } })
    applyWithUndo(`${label} set to ${String(next)}`, prev, next, v => patch({ docs: { [key]: v } }))
  }
  return (
    <Page title="Resume & documents" blurb="Defaults for the tailored résumés and cover letters Careerloom writes, and what the ATS check relies on.">
      {error && <Note tone="warn">{error}</Note>}
      <Group title="Document defaults">
        <Row label="Tone" hint="How cover letters and summaries read. Each document can still be regenerated with another tone.">
          <SegTabs options={TONES} value={prefs?.docs.tone ?? 'warm'} onChange={v => docs('tone', 'Tone', v as DocsDefaults['tone'])} />
        </Row>
        <Row label="Length">
          <SegTabs options={LENGTHS} value={prefs?.docs.length ?? 'standard'} onChange={v => docs('length', 'Length', v as DocsDefaults['length'])} />
        </Row>
        <Row label="Make it sound human" hint="Runs the writing through a humanizer pass so it doesn't read as machine-written.">
          <ToggleSwitch aria-label="Humanize" disabled={!prefs} checked={prefs?.docs.humanize ?? true} onCheckedChange={v => docs('humanize', 'Humanize', v)} />
        </Row>
      </Group>
      <Group title="Résumé">
        <Row label="Template" hint="Chosen per résumé on the Resume screen.">
          <Badge variant="neutral">{overview.data?.activeTemplate ?? 'None chosen'}</Badge>
          <Button size="sm" variant="outline" onClick={() => navigate('resume')}>Open Resume</Button>
        </Row>
        <Row label="Output folder" hint="Exported PDFs and DOCX are written here.">
          <code className="rounded bg-muted px-2 py-0.5 text-xs">{root ? `${root}/output` : '—'}</code>
        </Row>
      </Group>
      <Group title="ATS analysis">
        <Row label="Meaning-based matching" hint={model.error ? errorText(model.error) : 'The local model scores how close your résumé is to a job’s wording (20 of the 100 match points). Without it the rest is rescaled and confidence is lower.'}>
          <Badge variant={model.data?.installed ? 'success' : 'warn'}>{model.data ? (model.data.installed ? 'Installed' : 'Not installed') : 'Checking…'}</Badge>
          <Button size="sm" variant="outline" onClick={() => goToSettings('local-models', 'local:prescreen')}>Manage in Settings</Button>
        </Row>
      </Group>
    </Page>
  )
}
