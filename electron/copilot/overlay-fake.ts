// Dev-only event generator that drives the overlay through all 8 states until WP2/WP3 publish real events
// (CL_COPILOT_FAKE=cycle|<state>|detail; detail = the answered card, then More detail streaming under it). It speaks only the frozen contract; the sample copy is original.
import type { CopilotEvents, OverlayViewState, Suggestion } from './types'

export type FakeEvent = { [K in keyof CopilotEvents]: { name: K; payload: CopilotEvents[K] } }[keyof CopilotEvents]
export type FakeSuggestionEvent = Extract<FakeEvent, { name: 'copilotSuggestion' }>
export const FAKE_STATES: OverlayViewState[] = ['idle', 'listening', 'question', 'answering', 'answered', 'permission', 'error', 'stopped']

const SAY = 'I reset the scope, not the date, and I brought the data to do it.'
const BULLETS = [
  'Name what you were protecting: on-call load after a rough quarter.',
  'Show the evidence you brought: incident count and rollout risk.',
  'Close on what held: core path shipped on time, trust intact.',
]
const QUESTION = 'Tell me about a time you pushed back on a deadline without losing trust.'
const LINES = [
  { id: 'l1', speaker: 'interviewer' as const, text: 'So the platform team owns the release pipeline end to end.' },
  { id: 'l2', speaker: 'you' as const, text: 'Right, about forty services by the end of last year.' },
  { id: 'l3', speaker: 'interviewer' as const, text: QUESTION },
]
const base = (startedAt: number): Suggestion => ({ questionId: 'q1', model: 'fake/fast', tier: 'fast', say: '', bullets: [], star: null, proof: [], flags: [], done: false, firstTokenMs: 1100, totalMs: null, costUsd: null })

/** Growing partial suggestions, ending in the finished card (STAR, proof, cost). */
export function fakeAnswerStream(): FakeSuggestionEvent[] {
  const steps: Suggestion[] = [
    { ...base(0), firstTokenMs: null },
    { ...base(0), say: SAY.slice(0, 30) },
    { ...base(0), say: SAY },
    { ...base(0), say: SAY, bullets: [BULLETS[0]!] },
    { ...base(0), say: SAY, bullets: [BULLETS[0]!, BULLETS[1]!.slice(0, 34)] },
    { ...base(0), say: SAY, bullets: BULLETS.slice(0, 2) },
  ]
  const done: Suggestion = {
    ...base(0), say: SAY, bullets: BULLETS, done: true, totalMs: 2100, costUsd: 0.02,
    star: { s: 'Q3 release, six weeks out, pipeline migration at risk', t: 'Own the migration plan and the date', a: 'Proposed a phased cutover; shared a risk table with the PM', r: 'Core path shipped on time; no Sev-1s in the first month' },
    proof: [{ quote: 'Cut release lead time from 4 days to 6 hours across 40 services', source: 'cv.md · Northwind Labs, 2023' }],
  }
  return [...steps, done].map((payload): FakeSuggestionEvent => ({ name: 'copilotSuggestion', payload }))
}

const state = (s: CopilotEvents['copilotState']['state'], over: Partial<CopilotEvents['copilotState']> = {}): FakeEvent => ({
  name: 'copilotState', payload: { state: s, mode: 'live', sessionId: 'fake-1', sources: ['mic', 'system'], startedAt: Date.now() - 252_000, ...over },
})
const transcript = (n: number): FakeEvent[] => LINES.slice(0, n).map(l => ({ name: 'copilotTranscript', payload: { ...l, final: true, t0: 0, t1: 1 } }))
const question: FakeEvent = { name: 'copilotQuestion', payload: { id: 'q1', text: QUESTION, type: 'behavioural', confidence: 0.92, at: Date.now(), auto: false } }

/** The events that put a fresh overlay into `target` (answering = the first streamed chunks). */
export function fakeEventsFor(target: OverlayViewState): FakeEvent[] {
  switch (target) {
    case 'idle': return [state('idle', { sessionId: null, sources: [], startedAt: null })]
    case 'listening': return [state('listening'), ...transcript(2)]
    case 'question': return [state('listening'), ...transcript(3), question]
    case 'answering': return [state('listening'), ...transcript(3), question, ...fakeAnswerStream().slice(0, 4)]
    case 'answered': return [state('listening'), ...transcript(3), question, ...fakeAnswerStream()]
    case 'permission': return [state('listening', { sources: ['mic', 'system'] }), ...transcript(3), { name: 'copilotHealth', payload: { source: 'system', status: 'silent', level: 0 } }]
    case 'error': return [state('listening'), ...transcript(3), { name: 'copilotError', payload: { kind: 'stt', message: 'Speech-to-text lost connection', retrying: true, attempt: 2 } }]
    case 'stopped': return [state('listening'), ...transcript(3), state('stopped')]
  }
}

const DETAIL_SAY = 'I reset the scope, not the date. Six weeks out, the migration plan put on-call at risk after a rough quarter, so I split the release: the core path on the original date, the long tail two weeks later. I brought the incident count and a rollout risk table to the PM and the director, and asked them to choose with me rather than for me. We shipped the core path on time and had no Sev-1s in the first month.'
const DETAIL_BULLETS = [
  'Scope vs date: move scope, keep the date, so trust in the plan holds.',
  'Evidence first: incident count and a risk table make it a shared decision.',
  'Likely follow-up: "What would you do differently?" Agree the split a week earlier.',
  'Likely follow-up: "How did the PM react?" Relieved: they owned the choice.',
]
/** More detail for the answered card, streamed in four steps. */
export function fakeDetailStream(): FakeSuggestionEvent[] {
  const d = (over: Partial<Suggestion>): Suggestion => ({ ...base(0), kind: 'detail', tier: 'balanced', model: 'fake/balanced', firstTokenMs: 1400, ...over })
  return [
    d({ say: DETAIL_SAY.slice(0, 80) }), d({ say: DETAIL_SAY }), d({ say: DETAIL_SAY, bullets: DETAIL_BULLETS.slice(0, 2) }),
    d({ say: DETAIL_SAY, bullets: DETAIL_BULLETS, done: true, totalMs: 3600, costUsd: 0.004 }),
  ].map((payload): FakeSuggestionEvent => ({ name: 'copilotSuggestion', payload }))
}

export type FakeSpec = 'cycle' | 'detail' | OverlayViewState
export const parseFakeSpec = (v: string | undefined): FakeSpec | null => (v === 'cycle' || v === 'detail' ? v : FAKE_STATES.find(s => s === v) ?? null)

/** Plays `spec` through `publish`; returns stop(). Streams the answer at ~350 ms per chunk and jiggles the level meters. */
export function runFake(publish: (e: FakeEvent) => void, spec: FakeSpec, opts: { holdMs?: number } = {}): () => void {
  const hold = opts.holdMs ?? 5000
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let levels: ReturnType<typeof setInterval> | null = null
  let stopped = false
  const later = (ms: number, fn: () => void) => { const t = setTimeout(() => { timers.delete(t); if (!stopped) fn() }, ms); timers.add(t) }

  function play(target: OverlayViewState, then?: () => void): void {
    const events = fakeEventsFor(target)
    const streamFrom = target === 'answering' ? events.findIndex(e => e.name === 'copilotSuggestion') : -1
    const head = streamFrom >= 0 ? events.slice(0, streamFrom) : events
    head.forEach(publish)
    if (streamFrom >= 0) events.slice(streamFrom).forEach((e, i) => later(i * 350, () => publish(e)))
    if (then) later(hold, then)
  }

  const order: OverlayViewState[] = ['idle', 'listening', 'question', 'answering', 'answered', 'permission', 'error', 'stopped']
  const cycle = (i: number): void => play(order[i % order.length]!, () => cycle(i + 1))
  if (spec === 'cycle') cycle(0)
  else if (spec === 'detail') { play('answered'); fakeDetailStream().forEach((e, i) => later(900 + i * 400, () => publish(e))) }
  else play(spec)

  levels = setInterval(() => {
    if (stopped) return
    publish({ name: 'copilotLevel', payload: { source: 'mic', level: 0.25 + Math.random() * 0.6 } })
    publish({ name: 'copilotLevel', payload: { source: 'system', level: 0.15 + Math.random() * 0.5 } })
  }, 160)
  return () => { stopped = true; timers.forEach(clearTimeout); if (levels) clearInterval(levels) }
}
