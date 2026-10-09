import type { CopilotConfig, QuestionType } from '../../electron/contract'
import { effectiveIndicator } from '../../electron/copilot/privacy-mode'
import { deriveView, formatElapsed, kbdLabel, sessionCost, type OverlayModel } from '../lib/copilot'
import type { OverlayProblem, OverlayViewData } from './types'

const TYPE_LABEL: Record<QuestionType, string> = { behavioural: 'Behavioural', technical: 'Technical', 'system-design': 'System design', coding: 'Coding', other: 'Question' }
const ENGINE_LABEL: Record<CopilotConfig['stt']['engine'], string> = { moonshine: 'Moonshine · on device', 'whisper-mlx': 'Whisper MLX · on device', 'faster-whisper': 'faster-whisper · on device', parakeet: 'Parakeet · on device', hf: 'Hugging Face model · on device' }
const ERROR_TITLE = { engine: 'Answer engine problem', capture: 'Audio capture problem', hotkey: 'Shortcut problem' } as const
const TIER_LABEL = { fast: 'Fast', balanced: 'Balanced', deep: 'Deep' } as const

type Ctx = { cfg: CopilotConfig; layout: 'strip' | 'panel'; now: number; wiped: boolean }

function problemOf(m: OverlayModel, state: OverlayViewData['state']): OverlayProblem | null {
  if (state === 'error' && m.error) {
    const { kind, message, attempt } = m.error
    return kind === 'stt' ? { kind: 'stt', attempt, message: undefined } : { kind: 'error', title: ERROR_TITLE[kind as keyof typeof ERROR_TITLE] ?? 'Something went wrong', message }
  }
  if (state === 'permission') return m.health.system && m.health.system.status !== 'ok' ? { kind: 'system' } : { kind: 'mic' }
  return null
}

/** Model + config → what the overlay draws. Pure, so every state is testable without a window. */
/** Headline latency: speech end -> first visible line when the turn was auto-asked, else request -> first visible line, else first token. */
const latencyLabel = (s: OverlayModel['suggestion']): string => {
  const ms = s?.trace?.endToSay ?? s?.trace?.firstSay ?? s?.firstTokenMs
  return ms != null ? `${(ms / 1000).toFixed(1)} s` : '— s'
}

export function buildOverlayData(m: OverlayModel, { cfg, layout, now, wiped }: Ctx): OverlayViewData {
  const state = deriveView(m)
  const started = m.session?.startedAt ?? now
  const s = m.suggestion
  const hk = cfg.hotkeys
  return {
    state, layout, wiped,
    practice: m.session?.mode === 'practice',
    sys: m.session?.sources.includes('system') ?? false,
    indicator: effectiveIndicator(cfg.privacy.mode),
    passive: cfg.overlay.clickThroughIdle && state === 'listening',
    time: formatElapsed(now - started),
    latency: latencyLabel(s),
    cost: `$${sessionCost(m).toFixed(2)}`,
    question: m.question ? { type: TYPE_LABEL[m.question.type], text: m.question.text } : null,
    suggestion: s,
    lines: m.transcript.map(l => ({ id: l.id, who: l.speaker === 'you' ? 'You' : 'Interviewer', text: l.text, partial: !l.final })),
    levels: m.levels,
    engine: ENGINE_LABEL[cfg.stt.engine],
    tier: TIER_LABEL[s?.tier ?? cfg.engine.tier],
    savedMinutes: Math.round((now - started) / 60_000),
    problem: problemOf(m, state),
    screen: m.screen,
    keys: { answer: kbdLabel(hk.answer), followup: kbdLabel(hk.followup), clarify: kbdLabel(hk.clarify), screenshot: kbdLabel(hk.screenshot), summarise: kbdLabel(hk.summarise), expand: kbdLabel(hk.expand), listen: kbdLabel(hk.listen), panic: kbdLabel(hk.panic) },
  }
}
