// Interview Copilot renderer helpers: the pure overlay reducer (events → model → OverlayViewState), formatting, and
// the event subscription. The overlay and the config screens share this; only the frozen contract is consumed.
import type { CopilotEvents, DetectedQuestion, OverlayViewState, SourceHealth, SourceId, Suggestion, TranscriptLine } from '../../electron/contract'
import { isWindowsPlatform } from './platform'

type Bridge = Pick<Window['careerloom'], 'onCopilotEvent'>
export type CopilotEventName = keyof CopilotEvents
export type OverlayEvent = { [K in CopilotEventName]: { type: K; payload: CopilotEvents[K] } }[CopilotEventName]

const TRANSCRIPT_LINES = 3

export type OverlayModel = {
  session: CopilotEvents['copilotState'] | null
  transcript: TranscriptLine[]
  question: DetectedQuestion | null
  suggestion: Suggestion | null
  /** More detail for the current question: shown under the answer, never replacing it. */
  detail: Suggestion | null
  /** Why More detail could not run (a note under the answer, never the error panel). */
  detailNote: string | null
  health: Partial<Record<SourceId, SourceHealth>>
  levels: Record<SourceId, number>
  error: CopilotEvents['copilotError'] | null
  screen: CopilotEvents['copilotScreen']
  /** Cost per question, so streamed updates of one answer are counted once. */
  costs: Record<string, number>
}

export const initialOverlayModel: OverlayModel = { session: null, transcript: [], question: null, suggestion: null, detail: null, detailNote: null, health: {}, levels: { mic: 0, system: 0 }, error: null, screen: { state: 'idle' }, costs: {} }

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
    // A new question or answer also ends an engine error panel from an earlier request (it would otherwise cover them until Clear).
    case 'copilotQuestion': return { ...m, question: e.payload, suggestion: null, detail: null, detailNote: null, error: m.error?.kind === 'engine' ? null : m.error }
    case 'copilotSuggestion': {
      const cost = e.payload.costUsd, detail = e.payload.kind === 'detail'
      const costs = cost === null ? m.costs : { ...m.costs, [detail ? `${e.payload.questionId}:detail` : e.payload.questionId]: cost }
      if (m.question && e.payload.questionId !== m.question.id) return { ...m, costs } // late partials of an older question's answer or detail are dropped
      if (detail) return { ...m, detail: e.payload, detailNote: null, costs }
      // More of the same answer keeps its detail; a new request (follow-up, clarify, re-answer) starts without the old one.
      const sameAnswer = e.payload.reqId === undefined ? m.suggestion?.questionId === e.payload.questionId : m.suggestion?.reqId === e.payload.reqId
      return { ...m, suggestion: e.payload, detail: sameAnswer && m.detail?.questionId === e.payload.questionId ? m.detail : null, costs, error: m.error?.kind === 'engine' ? null : m.error }
    }
    case 'copilotHealth': return { ...m, health: { ...m.health, [e.payload.source]: e.payload }, error: e.payload.status === 'ok' && m.error?.kind === 'capture' ? null : m.error }
    case 'copilotError': return e.payload.kind === 'detail' ? { ...m, detailNote: e.payload.message } : { ...m, error: e.payload }
    case 'copilotScreen': return { ...m, screen: e.payload }
    case 'copilotCleared': return { ...m, question: null, suggestion: null, detail: null, detailNote: null, screen: { state: 'idle' }, error: m.error?.kind === 'engine' ? null : m.error }
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
  const shown = m.suggestion ?? (m.detail?.questionId === m.question?.id ? m.detail : null) // More detail pressed before any answer still shows
  if (shown) return shown.done ? 'answered' : 'answering'
  return m.question ? 'question' : 'listening'
}

/** Subscribes to every copilot push event; returns one unsubscribe. */
export function subscribeCopilot(bridge: Bridge, dispatch: (e: OverlayEvent) => void): () => void {
  const names: CopilotEventName[] = ['copilotState', 'copilotTranscript', 'copilotQuestion', 'copilotSuggestion', 'copilotHealth', 'copilotError', 'copilotScreen', 'copilotLevel', 'copilotCleared']
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
const WIN_KEYS: Record<string, string> = { control: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', command: 'Win', cmd: 'Win', meta: 'Win', super: 'Win', commandorcontrol: 'Ctrl', cmdorctrl: 'Ctrl' }
const key = (p: string): string => (p.length === 1 ? p.toUpperCase() : p) // `a` → A, but `Space` stays `Space`
/** `Control+Alt+A` → `⌃⌥A` on macOS, `Ctrl+Alt+A` on Windows. */
export function kbdLabel(accel: string, win: boolean = isWindowsPlatform()): string {
  if (win) return accel.split('+').map(p => WIN_KEYS[p.toLowerCase()] ?? key(p)).join('+')
  return accel.split('+').map(p => GLYPH[p.toLowerCase()] ?? key(p)).join('')
}

const MOD_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])
/** Hotkey recorder: a key event → Electron accelerator, or null for a bare key / modifier-only press. */
export function acceleratorFromKeyEvent(e: KeyboardEvent): string | null {
  if (MOD_KEYS.has(e.key)) return null
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && (isWindowsPlatform() ? 'Super' : 'Command')].filter((x): x is string => Boolean(x))
  if (mods.length === 0) return null
  const key = /^Key([A-Z])$/.exec(e.code)?.[1] ?? /^Digit(\d)$/.exec(e.code)?.[1] ?? (/^F\d{1,2}$/.test(e.code) ? e.code : e.code === 'Space' ? 'Space' : null)
  return key ? [...mods, key].join('+') : null
}
