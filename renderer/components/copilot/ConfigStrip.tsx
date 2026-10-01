import { SettingChip } from '@/components/settings/SettingChip'
import type { CopilotConfig } from '@/lib/types'
import { STT_ENGINES, TIERS } from './catalog'
import { retentionLabel } from './retention'

/** One plain-words line per moved editor (speech, answers, privacy), shared by the strip and its test. */
export function summarizeConfig(c: CopilotConfig): { speech: string; answers: string; privacy: string } {
  const engine = STT_ENGINES.find(e => e.id === c.stt.engine)
  const model = engine?.models.find(m => m.id === c.stt.model) ?? engine?.models.find(m => m.recommended)
  const tier = TIERS.find(t => t.id === c.engine.tier)?.label ?? c.engine.tier
  const kept = c.privacy.retentionDays === null ? 'transcripts kept' : `transcripts ${retentionLabel(c.privacy.retentionDays).toLowerCase()}`
  return {
    speech: `${engine?.label.split(' (')[0] ?? c.stt.engine}${model ? ` · ${model.label.split(' ·')[0]}` : ''}`,
    answers: `${tier}${c.engine.models[c.engine.tier] ? ` · ${c.engine.models[c.engine.tier]}` : ''}`,
    privacy: `${c.privacy.mode.enabled ? 'Privacy mode on' : 'Privacy mode off'} · ${kept}`,
  }
}

/** Speech, answer engine and privacy are edited in Settings; the workspace only shows where they stand. */
export function ConfigStrip({ config }: { config: CopilotConfig }) {
  const s = summarizeConfig(config)
  return (
    <div role="group" aria-label="Configuration" className="flex flex-wrap items-center gap-2">
      <SettingChip label="Speech to text" value={s.speech} page="copilot" focus="copilot:stt" />
      <SettingChip label="Answer engine" value={s.answers} page="copilot" focus="copilot:engine" />
      <SettingChip label="Privacy" value={s.privacy} page="copilot" focus="copilot:privacy" />
    </div>
  )
}
