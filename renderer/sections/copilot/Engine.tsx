import { SegTabs } from '@/components/SegTabs'
import { isWindowsPlatform } from '@/lib/platform'
import { ApiKeyRow } from '@/components/copilot/ApiKeyRow'
import { errorText, orNull, useAsync, useCopilotConfig } from '@/components/copilot/api'
import { TIERS, type TierId } from '@/components/copilot/catalog'
import { Group, Note, Row } from '@/components/copilot/Group'
import { LlmModelPicker } from '@/components/copilot/LlmModelPicker'
import { accelLabel } from '@/components/copilot/PrivacyModeGroup'
import { TierCards, type TierPrice } from '@/components/copilot/TierCards'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { careerloom } from '@/lib/ipc'
import type { LlmModelInfo } from '@/lib/types'
import { ProviderSelect } from '@/components/settings/LlmAssignments'
import { Page } from '../resume/PageStub'

import { defaultPrices } from '../../../electron/copilot/cost'

export function EnginePage() {
  const { config, save, error } = useCopilotConfig()
  // null = the list is unavailable (not wired, offline): the picker then takes a typed id.
  const list = useAsync<LlmModelInfo[] | null>(() => careerloom.copilotListLlmModels().then(orNull), [config?.engine.provider])
  const models = list.data ?? null
  const providers = useAsync(() => careerloom.llmProviders(), [])

  if (!config) return <Page title="Answer engine" blurb="The model that writes suggestions.">{error ? <Note tone="warn">{error}</Note> : null}</Page>
  const e = config.engine
  const prices = Object.fromEntries(TIERS.map(t => {
    const m = models?.find(x => x.id === e.models[t.id])
    return [t.id, m && m.promptUsdPerM !== null && m.completionUsdPerM !== null ? { prompt: m.promptUsdPerM, completion: m.completionUsdPerM, cached: defaultPrices.models[m.id]?.cachedUsdPerM ?? null } : null]
  })) as Record<TierId, TierPrice>
  const patch = (engine: Partial<typeof e>) => { void save({ engine }) }

  return (
    <Page title="Answer engine" blurb="The model that writes suggestions. Speed matters more than polish here: a good answer in one second beats a perfect one in ten.">
      {list.error && <Note tone="warn">{errorText(list.error)}</Note>}
      <Group title="Speed and cost">
        <TierCards tier={e.tier} onTier={tier => patch({ tier })} prices={prices} />
        <p className="m-0 mt-3 text-xs text-muted-foreground">Estimates assume 15 answers in 45 minutes (with prompt caching where the model supports it), before speech-to-text (which runs on this computer). Your real cost shows in the overlay.</p>
        <div className="mt-3"><Row label="Use Deep for design and coding questions" hint="Switches per question. The overlay shows which model answered.">
          <ToggleSwitch aria-label="Escalate to Deep" checked={e.escalateForDesignCoding} onCheckedChange={v => patch({ escalateForDesignCoding: v })} />
        </Row></div>
      </Group>
      <Group>
        <Row label="Provider" hint="Words stream in as they are written. The text of the conversation is sent to this provider with your own key.">
          <ProviderSelect id="copilot-provider" label="Answer provider" value={e.provider} rows={Array.isArray(providers.data) ? providers.data : []} onChange={p => { if (p) { patch({ provider: p, models: { fast: null, balanced: null, deep: null } }) } }} />
        </Row>
        <ApiKeyRow provider={e.provider} />
        {e.provider === 'openrouter' && <>
        <Row label="Providers may keep or train on your text" hint="On: every model works, including free ones, but a provider may keep or train on the conversation text. Off: only providers that promise not to, which rules out most free models.">
          <ToggleSwitch aria-label="Providers may keep or train on your text" checked={e.openrouter.dataCollection === 'allow'} onCheckedChange={v => patch({ openrouter: { ...e.openrouter, dataCollection: v ? 'allow' : 'deny' } })} />
        </Row>
        <Row label="Zero data retention only" hint="Narrower still: only providers that promise not to store prompts.">
          <ToggleSwitch aria-label="Zero data retention" checked={e.openrouter.zdr} onCheckedChange={v => patch({ openrouter: { ...e.openrouter, zdr: v } })} />
        </Row>
        <Row label="Prefer" hint="How OpenRouter picks among providers for the same model.">
          <SegTabs options={[{ value: 'latency', label: 'Fastest' }, { value: 'price', label: 'Cheapest' }]} value={e.openrouter.sort} onChange={v => patch({ openrouter: { ...e.openrouter, sort: v as 'latency' | 'price' } })} />
        </Row>
        </>}
        <Row label="Answer automatically" hint={<>Off: press <Kbd>{accelLabel(config.hotkeys.answer)}</Kbd> when you want a suggestion. On: a suggestion starts when a question is detected. Needs the interviewer's audio on its own channel, so it does nothing with the microphone alone.</>}>
          <ToggleSwitch aria-label="Auto answer" checked={e.autoAnswer} onCheckedChange={v => patch({ autoAnswer: v })} />
        </Row>
        <Row label="Models" hint="Fast models only: answers are read live, so a slower model is not offered. Test shows how quickly it starts." stack>
          <div className="flex w-full flex-col gap-2">
            {TIERS.map(t => <LlmModelPicker key={t.id} provider={e.provider} allowTyped={e.provider === 'custom'} tier={t.label} value={e.models[t.id]} models={models} dataCollection={e.openrouter.dataCollection} onAllowTraining={() => patch({ openrouter: { ...e.openrouter, dataCollection: 'allow' } })} onChange={id => patch({ models: { ...e.models, [t.id]: id } })} />)}
          </div>
        </Row>
        <Row label="Check answers against your résumé" hint="Flags numbers, tools and names that aren't in your résumé or stories.">
          <ToggleSwitch aria-label="Fact check" checked={e.factCheck} onCheckedChange={v => patch({ factCheck: v })} />
        </Row>
        <Row label="Read the screen" hint={<>Off by default. On: <Kbd>{accelLabel(config.hotkeys.screenshot)}</Kbd> and the Screenshot button send a downscaled picture of your screen, taken with the overlay hidden, to your answer model's provider (OpenRouter) along with the question; coding questions that point at something on screen can do it for you. Needs a vision model and macOS Screen Recording permission. Up to 20 pictures per session, deleted when the session ends.</>}>
          <ToggleSwitch aria-label="Read the screen" checked={e.screenshots} onCheckedChange={v => patch({ screenshots: v })} />
        </Row>
        {!isWindowsPlatform() && (
          <Row label="Screen Recording permission" hint="macOS asks once; after allowing it, reopen Careerloom.">
            <Button variant="outline" onClick={() => { void careerloom.copilotOpenSystemSettings('screen') }}>Open Screen Recording settings</Button>
          </Row>
        )}
        <Row label="Read screenshots with" hint="Vision models read the picture directly. Reading it as text is not built yet.">
          <SegTabs options={[{ value: 'vision', label: 'Vision model' }, { value: 'ocr', label: 'Text only (OCR): not available yet', disabled: true }]} value={e.vision} onChange={v => patch({ vision: v as 'vision' | 'ocr' })} />
        </Row>
      </Group>
    </Page>
  )
}
