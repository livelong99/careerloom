import { SegTabs } from '@/components/SegTabs'
import { EmptyNote } from '@/components/EmptyState'
import { useCopilotConfig } from '@/components/copilot/api'
import { Group, Note, Row } from '@/components/copilot/Group'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { Button } from '@/components/ui/button'
import { navigate } from '@/lib/nav'
import { copilotSupportedHere } from '@/lib/platform'
import { EnginePage } from '@/sections/copilot/Engine'
import { PrivacyPage } from '@/sections/copilot/Privacy'
import { TranscriptionPage } from '@/sections/copilot/Transcription'

/** Latency options that only matter once answers start by themselves (the "Answer automatically" switch is in the answer engine group). */
function FasterAnswers() {
  const { config, save } = useCopilotConfig()
  if (!config) return null
  const e = config.engine
  return (
    <section aria-label="Faster answers" data-setting-id="copilot:faster" className="flex flex-col gap-4 px-6 pb-2">
      <Group title="Faster answers">
        {!e.autoAnswer && <Note tone="plain">These apply when “Answer automatically” is on. It needs the interviewer's audio on its own channel, so it does nothing with the microphone alone.</Note>}
        <Row label="Start early" hint="Begins the answer as soon as a question looks finished, and throws it away if the final words differ. Off until you have seen it help; a wrong guess costs a few cents.">
          <ToggleSwitch aria-label="Speculative start" checked={e.speculativeStart} disabled={!e.autoAnswer} onCheckedChange={v => void save({ engine: { speculativeStart: v } })} />
        </Row>
        <Row label="Unclear lines" hint={e.gate.engine === 'jev' ? 'A small decision model also reads the last few lines of the conversation (sent to OpenRouter) when the rules cannot tell. It adds nothing if it takes over 0.6 s.' : 'Rules on this computer decide; nothing is sent anywhere.'}>
          <SegTabs options={[{ value: 'heuristic', label: 'Rules only' }, { value: 'jev', label: 'Rules + decision model' }]} value={e.gate.engine} onChange={v => void save({ engine: { gate: { engine: v as 'heuristic' | 'jev' } } })} />
        </Row>
      </Group>
    </section>
  )
}

/** Speech, answer engine and privacy: the editors that used to be Copilot workspace tabs, re-hosted unchanged. */
export function CopilotPage() {
  if (!copilotSupportedHere()) return <EmptyNote>Interview Copilot is available on macOS and Windows only.</EmptyNote>
  return (
    <div className="flex flex-col [&>div>section]:pt-0">
      <header className="flex items-center justify-between gap-4 px-6 pb-2 pt-6">
        <p className="m-0 text-sm text-muted-foreground">Audio, coaching, overlay, hotkeys, practice and sessions are tuned against a live preview, so they stay in the Copilot workspace.</p>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate('copilot')}>Open Copilot</Button>
      </header>
      <div data-setting-id="copilot:stt"><TranscriptionPage /></div>
      <div data-setting-id="copilot:engine"><EnginePage /></div>
      <FasterAnswers />
      <div data-setting-id="copilot:privacy"><PrivacyPage /></div>
    </div>
  )
}
