// Interview Copilot renderer helpers: the pure overlay reducer (events → model → OverlayViewState), formatting, and
// the event subscription. The overlay and the config screens share this; only the frozen contract is consumed.
import type { CopilotEvents, DetectedQuestion, OverlayViewState, SourceHealth, SourceId, Suggestion, TranscriptLine } from '../../electron/contract'

type Bridge = Pick<Window['careerloom'], 'onCopilotEvent'>
export type CopilotEventName = keyof CopilotEvents
export type OverlayEvent = { [K in CopilotEventName]: { type: K; payload: CopilotEvents[K] } }[CopilotEventName]

const TRANSCRIPT_LINES = 3

export type OverlayModel = {
  session: CopilotEvents['copilotState'] | null
  transcript: TranscriptLine[]
  question: DetectedQuestion | null
  suggestion: Suggestion | null
  health: Partial<Record<SourceId, SourceHealth>>
  levels: Record<SourceId, number>
  error: CopilotEvents['copilotError'] | null
  /** Cost per question, so streamed updates of one answer are counted once. */
  costs: Record<string, number>
}

export const initialOverlayModel: OverlayModel = { session: null, transcript: [], question: null, suggestion: null, health: {}, levels: { mic: 0, system: 0 }, error: null, costs: {} }

const blank = (session: OverlayModel['session']): OverlayModel => ({ ...initialOverlayModel, session })

export function reduceOverlay(m: OverlayModel, e: OverlayEvent): OverlayModel {
  switch (e.type) {
    case 'copilotState': {
      const restart = e.payload.state === 'idle' || e.payload.sessionId !== m.session?.sessionId || (e.payload.state === 'listening' && m.session?.state === 'stopped')
      const base = restart ? blank(e.payload) : { ...m, session: e.payload }
      // A state change ends a non-retrying error; stopping keeps the transcript for the summary.
      return { ...base, error: null }
    }
    case 'copilotTranscript': {
      const i = m.transcript.findIndex(l => l.id === e.payload.id)
      const lines = i >= 0 ? m.transcript.map((l, j) => (j === i ? e.payload : l)) : [...m.transcript, e.payload]
      return { ...m, transcript: lines.slice(-TRANSCRIPT_LINES), error: m.error?.retrying ? null : m.error }
    }
    case 'copilotQuestion': return { ...m, question: e.payload, suggestion: null }
    case 'copilotSuggestion': {
      const cost = e.payload.costUsd
      return { ...m, suggestion: e.payload, costs: cost === null ? m.costs : { ...m.costs, [e.payload.questionId]: cost } }
    }
    case 'copilotHealth': return { ...m, health: { ...m.health, [e.payload.source]: e.payload } }
    case 'copilotError': return { ...m, error: e.payload }
    case 'copilotLevel': return { ...m, levels: { ...m.levels, [e.payload.source]: e.payload.level } }
  }
}

export function sessionCost(m: OverlayModel): number {
  return Object.values(m.costs).reduce((a, b) => a + b, 0)
}

/** Capture state first, then problems, then the question/answer stage. */
export function deriveView(m: OverlayModel): OverlayViewState {
  const s = m.session?.state
  if (!s || s === 'idle' || s === 'armed') return 'idle'
  if (s === 'stopped') return 'stopped'
  if (m.error && m.error.kind !== 'hotkey') return 'error' // a rejected shortcut is reported in Settings, it must not cover the answer
  if (Object.values(m.health).some(h => h && h.status !== 'ok')) return 'permission'
  if (m.suggestion) return m.suggestion.done ? 'answered' : 'answering'
  return m.question ? 'question' : 'listening'
}

/** Subscribes to every copilot push event; returns one unsubscribe. */
export function subscribeCopilot(bridge: Bridge, dispatch: (e: OverlayEvent) => void): () => void {
  const names: CopilotEventName[] = ['copilotState', 'copilotTranscript', 'copilotQuestion', 'copilotSuggestion', 'copilotHealth', 'copilotError', 'copilotLevel']
  const offs = names.map(type => bridge.onCopilotEvent(type, payload => dispatch({ type, payload } as OverlayEvent)))
  return () => offs.forEach(off => off())
}

// ————— formatting —————
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

const GLYPH: Record<string, string> = { control: '⌃', ctrl: '⌃', alt: '⌥', option: '⌥', shift: '⇧', command: '⌘', cmd: '⌘', commandorcontrol: '⌘', cmdorctrl: '⌘', meta: '⌘', super: '⌘' }
/** `Control+Alt+A` → `⌃⌥A` (macOS only for now). */
export function kbdLabel(accel: string): string {
  return accel.split('+').map(p => GLYPH[p.toLowerCase()] ?? p.toUpperCase()).join('')
}

const MOD_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])
/** Hotkey recorder: a key event → Electron accelerator, or null for a bare key / modifier-only press. */
export function acceleratorFromKeyEvent(e: KeyboardEvent): string | null {
  if (MOD_KEYS.has(e.key)) return null
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Command'].filter((x): x is string => Boolean(x))
  if (mods.length === 0) return null
  const key = /^Key([A-Z])$/.exec(e.code)?.[1] ?? /^Digit(\d)$/.exec(e.code)?.[1] ?? (/^F\d{1,2}$/.test(e.code) ? e.code : e.code === 'Space' ? 'Space' : null)
  return key ? [...mods, key].join('+') : null
}
