import { describe, expect, it } from 'vitest'

import type { CopilotEvents, DetectedQuestion, Suggestion, TranscriptLine } from '../../electron/contract'
import { acceleratorFromKeyEvent, deriveView, formatElapsed, initialOverlayModel, kbdLabel, reduceOverlay, sessionCost, type OverlayModel } from './copilot'

type Ev = { [K in keyof CopilotEvents]: { type: K; payload: CopilotEvents[K] } }[keyof CopilotEvents]
const run = (events: Ev[], from: OverlayModel = initialOverlayModel): OverlayModel => events.reduce(reduceOverlay, from)

const state = (s: CopilotEvents['copilotState']['state'], over: Partial<CopilotEvents['copilotState']> = {}): Ev => ({
  type: 'copilotState', payload: { state: s, mode: 'live', sessionId: 's1', sources: ['mic'], startedAt: 1000, ...over },
})
const q = (id = 'q1'): DetectedQuestion => ({ id, text: 'Tell me about a time…', type: 'behavioural', confidence: 0.9, at: 2000, auto: false })
const sug = (over: Partial<Suggestion> = {}): Suggestion => ({
  questionId: 'q1', model: 'm', tier: 'fast', say: 'Hi', bullets: [], star: null, proof: [], flags: [], done: false, firstTokenMs: 900, totalMs: null, costUsd: null, ...over,
})
const line = (id: string, over: Partial<TranscriptLine> = {}): TranscriptLine => ({ id, speaker: 'interviewer', text: id, final: true, t0: 0, t1: 1, ...over })

describe('overlay reducer and derived view state', () => {
  it('starts idle', () => { expect(deriveView(initialOverlayModel)).toBe('idle') })

  it('capture state drives idle / listening / stopped (armed still reads as idle)', () => {
    expect(deriveView(run([state('armed')]))).toBe('idle')
    expect(deriveView(run([state('listening')]))).toBe('listening')
    expect(deriveView(run([state('listening'), state('stopped')]))).toBe('stopped')
  })

  it('question → answering → answered', () => {
    const m = run([state('listening'), { type: 'copilotQuestion', payload: q() }])
    expect(deriveView(m)).toBe('question')
    const a = run([{ type: 'copilotSuggestion', payload: sug() }], m)
    expect(deriveView(a)).toBe('answering')
    expect(deriveView(run([{ type: 'copilotSuggestion', payload: sug({ done: true }) }], a))).toBe('answered')
  })

  it('a newer question replaces the previous answer', () => {
    const answered = run([state('listening'), { type: 'copilotQuestion', payload: q('q1') }, { type: 'copilotSuggestion', payload: sug({ done: true }) }])
    const next = run([{ type: 'copilotQuestion', payload: q('q2') }], answered)
    expect(next.suggestion).toBeNull()
    expect(deriveView(next)).toBe('question')
  })

  it('a silent or denied source shows the permission state until it recovers', () => {
    const m = run([state('listening', { sources: ['mic', 'system'] }), { type: 'copilotHealth', payload: { source: 'system', status: 'silent', level: 0 } }])
    expect(deriveView(m)).toBe('permission')
    expect(deriveView(run([{ type: 'copilotHealth', payload: { source: 'system', status: 'ok', level: 0.3 } }], m))).toBe('listening')
  })

  it('a "no audio" capture error clears once that source delivers sound again', () => {
    const m = run([state('listening'), { type: 'copilotHealth', payload: { source: 'mic', status: 'missing', level: 0 } }, { type: 'copilotError', payload: { kind: 'capture', message: 'no audio', retrying: false } }])
    expect(deriveView(m)).toBe('error')
    expect(deriveView(run([{ type: 'copilotHealth', payload: { source: 'mic', status: 'ok', level: 0.2 } }], m))).toBe('listening')
  })

  it('errors win over everything; a retrying error clears when text arrives again', () => {
    const base = run([state('listening'), { type: 'copilotQuestion', payload: q() }, { type: 'copilotError', payload: { kind: 'stt', message: 'lost', retrying: true, attempt: 2 } }])
    expect(deriveView(base)).toBe('error')
    expect(deriveView(run([{ type: 'copilotTranscript', payload: line('a') }], base))).toBe('question')
  })

  it('a non-retrying error stays until the session state changes', () => {
    const m = run([state('listening'), { type: 'copilotError', payload: { kind: 'engine', message: 'no key', retrying: false } }, { type: 'copilotTranscript', payload: line('a') }])
    expect(deriveView(m)).toBe('error')
    expect(deriveView(run([state('stopped')], m))).toBe('stopped')
  })

  it('a rejected hotkey does not take over the overlay', () => {
    const m = run([state('listening'), { type: 'copilotError', payload: { kind: 'hotkey', message: 'Control+Alt+A is in use', retrying: false } }])
    expect(deriveView(m)).toBe('listening')
  })

  it('keeps the newest three transcript lines and updates a partial in place', () => {
    const m = run([state('listening'), ...['a', 'b', 'c', 'd'].map(id => ({ type: 'copilotTranscript', payload: line(id) }) as Ev)])
    expect(m.transcript.map(l => l.id)).toEqual(['b', 'c', 'd'])
    const p = run([{ type: 'copilotTranscript', payload: line('d', { text: 'updated', final: false }) }], m)
    expect(p.transcript.map(l => l.text)).toEqual(['b', 'c', 'updated'])
  })

  it('counts each question cost once', () => {
    const m = run([
      { type: 'copilotSuggestion', payload: sug({ costUsd: 0.01, done: true }) },
      { type: 'copilotSuggestion', payload: sug({ costUsd: 0.012, done: true }) },
      { type: 'copilotSuggestion', payload: sug({ questionId: 'q2', costUsd: 0.02, done: true }) },
    ])
    expect(sessionCost(m)).toBeCloseTo(0.032)
  })

  it('a new session (or idle) starts clean; stopping keeps the transcript for the summary', () => {
    const live = run([state('listening'), { type: 'copilotQuestion', payload: q() }, { type: 'copilotTranscript', payload: line('a') }])
    expect(run([state('stopped')], live).transcript).toHaveLength(1)
    const fresh = run([state('listening', { sessionId: 's2' })], live)
    expect(fresh.question).toBeNull()
    expect(fresh.transcript).toEqual([])
    expect(run([state('idle', { sessionId: null, startedAt: null })], live).question).toBeNull()
  })

  it('levels are stored per source', () => {
    expect(run([{ type: 'copilotLevel', payload: { source: 'mic', level: 0.4 } }]).levels.mic).toBe(0.4)
  })
})

describe('formatting helpers', () => {
  it('elapsed time as mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(252_000)).toBe('04:12')
    expect(formatElapsed(3_725_000)).toBe('62:05')
    expect(formatElapsed(-5)).toBe('00:00')
  })
  it('accelerators show as mac glyphs', () => {
    expect(kbdLabel('Control+Alt+A')).toBe('⌃⌥A')
    expect(kbdLabel('Control+Alt+Shift+X')).toBe('⌃⌥⇧X')
    expect(kbdLabel('CommandOrControl+Shift+F5')).toBe('⌘⇧F5')
    expect(kbdLabel('Control+Alt+A', true)).toBe('Ctrl+Alt+A') // Windows shows words, not glyphs
    expect(kbdLabel('CommandOrControl+Shift+F5', true)).toBe('Ctrl+Shift+F5')
  })
  it('records an accelerator from a key event, rejecting bare keys', () => {
    const ev = (o: Partial<KeyboardEvent>) => ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, code: 'KeyA', key: 'a', ...o }) as KeyboardEvent
    expect(acceleratorFromKeyEvent(ev({ ctrlKey: true, altKey: true }))).toBe('Control+Alt+A')
    expect(acceleratorFromKeyEvent(ev({ ctrlKey: true, altKey: true, shiftKey: true, code: 'Digit4', key: '4' }))).toBe('Control+Alt+Shift+4')
    expect(acceleratorFromKeyEvent(ev({}))).toBeNull()
    expect(acceleratorFromKeyEvent(ev({ ctrlKey: true, code: 'ControlLeft', key: 'Control' }))).toBeNull()
  })

  it('copilotScreen drives the Screenshot button and is cleared by a new session', () => {
    const m = run([state('listening'), { type: 'copilotScreen', payload: { state: 'blocked', reason: 'permission', message: 'x' } }])
    expect(m.screen).toEqual({ state: 'blocked', reason: 'permission', message: 'x' })
    expect(deriveView(m)).toBe('listening') // a blocked screenshot is not an error panel: capture and answers keep running
    expect(run([state('idle', { sessionId: 's2' })], m).screen).toEqual({ state: 'idle' })
    expect(run([{ type: 'copilotScreen', payload: { state: 'idle' } }], m).screen).toEqual({ state: 'idle' })
  })
})
