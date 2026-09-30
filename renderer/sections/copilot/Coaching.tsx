import { SegTabs } from '@/components/SegTabs'
import { useCopilotConfig } from '@/components/copilot/api'
import { CoachingPreview } from '@/components/copilot/CoachingPreview'
import { Group, Note, Row } from '@/components/copilot/Group'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import type { CopilotConfig } from '@/lib/types'
import { Page } from '../resume/PageStub'

const PERSONA_MAX = 2000
const LENGTHS = ['Short', 'Medium', 'Long'] as const

export function CoachingPage() {
  const { config, save, error } = useCopilotConfig()
  if (!config) return <Page title="Coaching style" blurb="How much the overlay writes for you.">{error ? <Note tone="warn">{error}</Note> : null}</Page>
  const c = config.coaching
  const patch = (coaching: Partial<CopilotConfig['coaching']>) => { void save({ coaching }) }

  return (
    <Page title="Coaching style" blurb="How much the overlay writes for you. Cues keep your own voice. Full scripts sound read aloud.">
      <div className="grid items-start gap-4" style={{ gridTemplateColumns: '1.1fr 1fr' }}>
        <Group>
          <Row label="Suggestion shape" stack>
            <SegTabs options={[{ value: 'cues', label: 'Cues' }, { value: 'cues+star', label: 'Cues + STAR' }, { value: 'script', label: 'Full script' }]} value={c.shape} onChange={v => patch({ shape: v as typeof c.shape })} />
          </Row>
          <Row label="Length" htmlFor="cp-length">
            <Slider id="cp-length" aria-label="Length" className="w-40" min={1} max={3} step={1} value={[c.length]} onValueChange={([v]) => patch({ length: v as 1 | 2 | 3 })} />
            <span className="w-16 text-right text-xs text-muted-foreground">{LENGTHS[c.length - 1]}</span>
          </Row>
          <Row label="Tone">
            <SegTabs options={[{ value: 'direct', label: 'Direct' }, { value: 'warm', label: 'Warm' }, { value: 'formal', label: 'Formal' }]} value={c.tone} onChange={v => patch({ tone: v as typeof c.tone })} />
          </Row>
          <Row label="How you sound" hint={`One line the model follows. ${c.persona.length}/${PERSONA_MAX}`} htmlFor="cp-persona" stack>
            <Textarea id="cp-persona" rows={2} maxLength={PERSONA_MAX} value={c.persona} placeholder="Calm senior engineer. Plain words, short sentences." onChange={ev => patch({ persona: ev.target.value })} />
          </Row>
          <Row label="Quote my résumé" hint="Show the line each proof point comes from.">
            <ToggleSwitch aria-label="Quote résumé" checked={c.quoteResume} onCheckedChange={v => patch({ quoteResume: v })} />
          </Row>
          <Row label="Never invent numbers, employers or skills" hint="Unsupported figures are flagged. This rule can't be turned off.">
            <ToggleSwitch aria-label="Never invent numbers" checked disabled onCheckedChange={() => {}} />
          </Row>
        </Group>
        <CoachingPreview coaching={c} />
      </div>
    </Page>
  )
}
