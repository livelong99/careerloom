import { SegTabs } from '@/components/SegTabs'
import { ApiKeyRow } from '@/components/copilot/ApiKeyRow'
import { errorText, orNull, useAsync, useCopilotConfig } from '@/components/copilot/api'
import { TIERS, type TierId } from '@/components/copilot/catalog'
import { Group, Note, Row } from '@/components/copilot/Group'
import { LlmModelPicker } from '@/components/copilot/LlmModelPicker'
import { accelLabel } from '@/components/copilot/PrivacyModeGroup'
import { TierCards, type TierPrice } from '@/components/copilot/TierCards'
import { Badge } from '@/components/ui/badge'
import { Kbd } from '@/components/ui/kbd'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { careerloom } from '@/lib/ipc'
import type { LlmModelInfo } from '@/lib/types'
import { Page } from '../resume/PageStub'

export function EnginePage() {
  const { config, save, error } = useCopilotConfig()
  // null = the list is unavailable (not wired, offline): the picker then takes a typed id.
  const list = useAsync<LlmModelInfo[] | null>(() => careerloom.copilotListLlmModels().then(orNull), [])
  const models = list.data ?? null

  if (!config) return <Page title="Answer engine" blurb="The model that writes suggestions.">{error ? <Note tone="warn">{error}</Note> : null}</Page>
  const e = config.engine
  const prices = Object.fromEntries(TIERS.map(t => {
    const m = models?.find(x => x.id === e.models[t.id])
    return [t.id, m && m.promptUsdPerM !== null && m.completionUsdPerM !== null ? { prompt: m.promptUsdPerM, completion: m.completionUsdPerM } : null]
  })) as Record<TierId, TierPrice>
  const patch = (engine: Partial<typeof e>) => { void save({ engine }) }

  return (
    <Page title="Answer engine" blurb="The model that writes suggestions. Speed matters more than polish here: a good answer in one second beats a perfect one in ten.">
      {list.error && <Note tone="warn">{errorText(list.error)}</Note>}
      <Group title="Speed and cost">
        <TierCards tier={e.tier} onTier={tier => patch({ tier })} prices={prices} />
        <p className="m-0 mt-3 text-xs text-muted-foreground">Estimates assume 15 answers in 45 minutes, before speech-to-text (which runs on this computer). Your real cost shows in the overlay.</p>
        <div className="mt-3"><Row label="Use Deep for design and coding questions" hint="Switches per question. The overlay shows which model answered.">
          <ToggleSwitch aria-label="Escalate to Deep" checked={e.escalateForDesignCoding} onCheckedChange={v => patch({ escalateForDesignCoding: v })} />
        </Row></div>
      </Group>
      <Group>
        <Row label="Provider" hint="OpenRouter streams words as they are written. The text of the conversation is sent to it."><Badge variant="brand">OpenRouter</Badge></Row>
        <ApiKeyRow />
        <Row label="Only use providers that don't keep or train on my data" hint="Safer, but it limits which models you can pick.">
          <ToggleSwitch aria-label="Data collection deny" checked={e.openrouter.dataCollection === 'deny'} onCheckedChange={v => patch({ openrouter: { ...e.openrouter, dataCollection: v ? 'deny' : 'allow' } })} />
        </Row>
        <Row label="Zero data retention only" hint="Narrower still: only providers that promise not to store prompts.">
          <ToggleSwitch aria-label="Zero data retention" checked={e.openrouter.zdr} onCheckedChange={v => patch({ openrouter: { ...e.openrouter, zdr: v } })} />
        </Row>
        <Row label="Prefer" hint="How OpenRouter picks among providers for the same model.">
          <SegTabs options={[{ value: 'latency', label: 'Fastest' }, { value: 'price', label: 'Cheapest' }]} value={e.openrouter.sort} onChange={v => patch({ openrouter: { ...e.openrouter, sort: v as 'latency' | 'price' } })} />
        </Row>
        <Row label="Answer automatically" hint={<>Off: press <Kbd>{accelLabel(config.hotkeys.answer)}</Kbd> when you want a suggestion. On: a suggestion starts when a question is detected.</>}>
          <ToggleSwitch aria-label="Auto answer" checked={e.autoAnswer} onCheckedChange={v => patch({ autoAnswer: v })} />
        </Row>
        <Row label="Models" hint="One model per speed tier. Search the OpenRouter list, then test how fast it starts." stack>
          <div className="flex w-full flex-col gap-2">
            {TIERS.map(t => <LlmModelPicker key={t.id} tier={t.label} value={e.models[t.id]} models={models} onChange={id => patch({ models: { ...e.models, [t.id]: id } })} />)}
          </div>
        </Row>
        <Row label="Check answers against your résumé" hint="Flags numbers, tools and names that aren't in your résumé or stories.">
          <ToggleSwitch aria-label="Fact check" checked={e.factCheck} onCheckedChange={v => patch({ factCheck: v })} />
        </Row>
        <Row label="Read screenshots with" hint="For coding questions shown on screen.">
          <SegTabs options={[{ value: 'vision', label: 'Vision model' }, { value: 'ocr', label: 'Text only (OCR)' }]} value={e.vision} onChange={v => patch({ vision: v as 'vision' | 'ocr' })} />
        </Row>
      </Group>
    </Page>
  )
}
