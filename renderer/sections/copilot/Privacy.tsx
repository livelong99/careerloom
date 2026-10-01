import { useCopilotConfig, errorText } from '@/components/copilot/api'
import { Group, Note, Row } from '@/components/copilot/Group'
import { PrivacyModeGroup } from '@/components/copilot/PrivacyModeGroup'
import { RetentionControl } from '@/components/copilot/RetentionControl'
import { retentionLabel } from '@/components/copilot/retention'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { careerloom } from '@/lib/ipc'
import { showToast } from '@/lib/toast'
import { Page } from '../resume/PageStub'

const keptText = (days: number | null): string =>
  days === 0 ? 'Transcripts are not kept.' : days === null ? 'Transcripts are kept until you delete them.' : `Transcripts are kept for ${retentionLabel(days)}, then deleted.`

async function exportRecords(): Promise<void> {
  try { showToast(`Saved to ${await careerloom.copilotExportConsents()}`) } catch (e) { showToast(errorText(e), 'error') }
}

export function PrivacyPage() {
  const { config, save, error } = useCopilotConfig()
  if (!config) return <Page title="Privacy & consent" blurb="Responsible defaults.">{error ? <Note tone="warn">{error}</Note> : null}</Page>
  const p = config.privacy
  return (
    <Page title="Privacy & consent" blurb="Responsible defaults. You confirm the rules before every live session. Low-profile options live in Privacy mode, which is off until you turn it on.">
      <Group title="Consent" action={<Badge variant="brand">Can&apos;t be turned off</Badge>}>
        <Row label="Ask before every live session" hint="A short check on the employer's rules and on consent from everyone on the call.">
          <ToggleSwitch aria-label="Confirm each live session" checked disabled onCheckedChange={() => {}} />
        </Row>
      </Group>
      <Group title="What is kept">
        <Row label="Audio recordings" hint="Audio is turned into text and discarded straight away."><Badge>Never saved</Badge></Row>
        <Row label="Keep transcripts for" htmlFor="cp-retention" hint={<>{keptText(p.retentionDays)} Lowering this asks before deleting.</>}>
          <RetentionControl id="cp-retention" value={p.retentionDays} onChange={retentionDays => { void save({ privacy: { retentionDays } }) }} />
        </Row>
        <Row label="Session records" hint="Your confirmations, dates and providers, saved on this device only.">
          <Button size="sm" variant="outline" onClick={() => void exportRecords()}>Export</Button>
        </Row>
      </Group>
      <Group title="What leaves your computer">
        <Row label="Local only" hint="Needs a local model, coming later. Until then the text of the conversation goes to your answer provider.">
          <ToggleSwitch aria-label="Local only" checked={p.localOnly} disabled onCheckedChange={() => {}} />
        </Row>
        <Row label="Hide names, emails and phone numbers before sending to the model">
          <ToggleSwitch aria-label="Redact" checked={p.redact} onCheckedChange={redact => { void save({ privacy: { redact } }) }} />
        </Row>
      </Group>
      <PrivacyModeGroup mode={p.mode} clickThroughIdle={config.overlay.clickThroughIdle} quickHide={config.hotkeys.quickHide} save={save} />
      {/* TODO-legal: wording reviewed at gate G-D */}
      <Note tone="warn"><b>Check the rules first.</b> Many employers don&apos;t allow AI help in live interviews. Using it where it is banned can cost you the offer. Practice mode is always fine.</Note>
    </Page>
  )
}
