import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_CONFIG } from './config'
import { createDetector } from './detector'
import type { AnswerEngine, AnswerRequest } from './engine'
import { createLiveWiring, type ScreenDeps, type WiringDeps } from './live-wiring'
import { ScreenshotError } from './screenshots'
import type { CopilotEvents, Suggestion, TranscriptLine } from './types'

const line = (id: string, text: string, final = true): TranscriptLine => ({ id, speaker: 'interviewer', text, final, t0: 0, t1: 1 })
const sug = (questionId: string, done: boolean): Suggestion => ({ questionId, model: 'm', tier: 'fast', say: 'Hi', bullets: [], star: null, proof: [], flags: [], done, firstTokenMs: 10, totalMs: done ? 50 : null, costUsd: done ? 0.001 : null })
const live = (): CopilotEvents['copilotState'] => ({ state: 'listening', mode: 'live', sessionId: 'S1', sources: ['mic', 'system'], startedAt: 1 })
const SHOT = { jpeg: Buffer.from([0xff, 0xd8, 1]), at: 1000, timings: { captureMs: 90, encodeMs: 6 } }
const CODING = 'Look at the code on my screen. What is the time complexity of this function?'
const SMALL = 'Can you see my screen okay?'
const FACT = 'What is the difference between a process and a thread?'

function setup(over: { screen?: Partial<ScreenDeps> | null; patch?: (c: typeof DEFAULT_CONFIG) => void; waitMs?: number } = {}) {
  const reqs: AnswerRequest[] = []
  const engine: AnswerEngine = { answer: async function* (r) { reqs.push(r); yield sug(r.question.id, false); yield sug(r.question.id, true) }, cancelAll: vi.fn() }
  const published: Array<[string, unknown]> = []
  const actions: Array<(a: string) => void> = []
  let hooks: { abortRequests(): void } | null = null
  const cfg = structuredClone(DEFAULT_CONFIG)
  cfg.engine.autoAnswer = true; cfg.engine.screenshots = true
  over.patch?.(cfg)
  const screen: ScreenDeps = { capture: vi.fn(async () => SHOT), latest: vi.fn(() => null), clear: vi.fn(), isVision: () => true, ...over.screen }
  const w = createLiveWiring({
    host: { publishState: () => undefined, publish: (n, p) => void published.push([n, p]), setSessionHooks: h => { hooks = h as never }, onAction: cb => void actions.push(cb as (a: string) => void) },
    recorder: { line: () => undefined, question: () => undefined, suggestion: () => undefined },
    feed: async () => undefined, engine, detector: createDetector({ now: () => 0 }), config: () => cfg, now: () => 1000, onStopped: () => undefined,
    ...(over.screen === null ? {} : { screen }), screenWaitMs: over.waitMs ?? 30,
  } as WiringDeps)
  w.bindSession({ stop: vi.fn(async () => undefined) })
  const of = (n: string) => published.filter(p => p[0] === n).map(p => p[1])
  const screens = () => (of('copilotScreen') as Array<CopilotEvents['copilotScreen']>).map(s => (s.reason ? `${s.state}:${s.reason}` : s.state))
  const press = (a: string) => actions.forEach(cb => cb(a))
  return { w, reqs, screen, of, screens, press, hooks: () => hooks!, cfg, errors: () => (of('copilotScreen') as Array<CopilotEvents['copilotScreen']>).filter(s => s.message) as Array<{ message: string; suggestion?: string }> }
}
const hear = (t: ReturnType<typeof setup>, text: string) => { t.w.emit('copilotState', live()); t.w.emit('copilotTranscript', line('a', text)) }
const heard = async (t: ReturnType<typeof setup>) => { t.w.emit('copilotState', live()); t.w.emit('copilotTranscript', line('h', FACT)); await vi.waitFor(() => expect(t.of('copilotQuestion')).toHaveLength(1)) }
const settle = () => new Promise(r => setTimeout(r, 60))

describe('screenshot action (hotkey / button)', () => {
  it('captures, answers with the image, and reports capturing -> sent', async () => {
    const t = setup({ patch: c => { c.engine.autoAnswer = false } })
    t.w.emit('copilotState', live())
    t.w.emit('copilotTranscript', line('a', FACT))
    await vi.waitFor(() => expect(t.of('copilotQuestion')).toHaveLength(1))
    await t.w.screenshot()
    expect(t.screens().slice(0, 2)).toEqual(['capturing', 'sent'])
    expect(t.reqs.at(-1)!.image).toEqual({ jpeg: SHOT.jpeg, captureMs: 90, encodeMs: 6 })
    expect(t.reqs.at(-1)!.kind).toBe('answer')
  })
  it('the hotkey path (host action "screenshot") does the same', async () => {
    const t = setup({ patch: c => { c.engine.autoAnswer = false } })
    t.w.emit('copilotState', live()); t.w.emit('copilotTranscript', line('a', FACT))
    await vi.waitFor(() => expect(t.of('copilotQuestion')).toHaveLength(1))
    t.press('screenshot')
    await vi.waitFor(() => expect(t.reqs).toHaveLength(1))
    expect(t.reqs[0]!.image).toBeDefined()
  })
  it('off by default: nothing is captured, the user is told where to turn it on', async () => {
    const t = setup({ patch: c => { c.engine.screenshots = false } })
    await t.w.screenshot()
    expect(t.screen.capture).not.toHaveBeenCalled()
    expect(t.reqs).toHaveLength(0)
    expect(t.screens()).toEqual(['blocked:off'])
    expect(t.errors()[0]!.message).toMatch(/Settings/)
  })
  it('OCR mode is not built: blocked with a note, no capture', async () => {
    const t = setup({ patch: c => { c.engine.vision = 'ocr' } })
    await t.w.screenshot()
    expect(t.screen.capture).not.toHaveBeenCalled()
    expect(t.screens()).toEqual(['blocked:ocr'])
    expect(t.errors()[0]!.message).toMatch(/OCR/)
  })
  it('permission denied: friendly error, blocked state, no engine call', async () => {
    const t = setup({ patch: c => { c.engine.autoAnswer = false }, screen: { capture: async () => { throw new ScreenshotError('permission', 'Screen Recording permission is not granted') } } })
    await heard(t)
    await t.w.screenshot()
    expect(t.screens()).toEqual(['capturing', 'blocked:permission'])
    expect(t.errors()[0]!.message).toMatch(/Screen Recording/)
    expect(t.errors()[0]!.message).toMatch(/System Settings/)
    expect(t.reqs).toHaveLength(0)
  })
  it('image budget reached: blocked:budget', async () => {
    const t = setup({ patch: c => { c.engine.autoAnswer = false }, screen: { capture: async () => { throw new ScreenshotError('budget', 'limit') } } })
    await heard(t)
    await t.w.screenshot()
    expect(t.screens()).toEqual(['capturing', 'blocked:budget'])
    expect(t.reqs).toHaveLength(0)
  })
  it('any other capture failure: failed, no engine call', async () => {
    const t = setup({ patch: c => { c.engine.autoAnswer = false }, screen: { capture: async () => { throw new Error('boom') } } })
    await heard(t)
    await t.w.screenshot()
    expect(t.screens()).toEqual(['capturing', 'blocked:failed'])
    expect(t.reqs).toHaveLength(0)
  })
  it('a non-vision model: no capture (nothing is spent), clear message with a suggestion', async () => {
    const t = setup({ screen: { isVision: id => id !== 'openai/gpt-4.1-nano' } })
    await t.w.screenshot()
    expect(t.screen.capture).not.toHaveBeenCalled()
    expect(t.screens()).toEqual(['blocked:no-vision'])
    expect(t.errors()[0]).toMatchObject({ message: expect.stringMatching(/can't read images/), suggestion: expect.any(String) })
  })
  it('without screen deps the action says so instead of doing nothing', async () => {
    const t = setup({ screen: null })
    await t.w.screenshot()
    expect(t.errors()[0]!.message).toMatch(/Screenshots/)
  })
})

describe('routing -> capture decision table (auto-answered turns)', () => {
  it.each([
    ['coding + on-screen cue', CODING, {}, true],
    ['small talk about the screen', SMALL, {}, false],
    ['plain factual question', FACT, {}, false],
    ['needs screen but feature off', CODING, { screenshots: false }, false],
    ['needs screen but OCR mode', CODING, { vision: 'ocr' }, false],
  ] as const)('%s -> capture=%s', async (_n, text, engineCfg, expected) => {
    const t = setup({ patch: c => Object.assign(c.engine, engineCfg) })
    hear(t, text)
    await settle()
    expect(t.screen.capture).toHaveBeenCalledTimes(expected ? 1 : 0)
    if (expected) expect(t.reqs[0]!.image).toBeDefined()
    else expect(t.reqs.every(r => r.image === undefined)).toBe(true)
  })
  it('a non-vision routed model or a denied permission never blocks the text answer', async () => {
    const noVision = setup({ screen: { isVision: () => false } })
    hear(noVision, CODING); await settle()
    expect(noVision.screen.capture).not.toHaveBeenCalled()
    expect(noVision.reqs).toHaveLength(1)
    const denied = setup({ screen: { capture: async () => { throw new ScreenshotError('permission', 'x') } } })
    hear(denied, CODING); await settle()
    expect(denied.reqs).toHaveLength(1)
    expect(denied.reqs[0]!.image).toBeUndefined()
    expect(denied.screens()).toContain('blocked:permission')
  })
  it('uses a pre-captured frame when one is fresh instead of capturing again', async () => {
    const t = setup({ screen: { latest: () => SHOT } })
    hear(t, CODING); await settle()
    expect(t.screen.capture).not.toHaveBeenCalled()
    expect(t.reqs[0]!.image).toBeDefined()
  })
  it('slow capture (> wait budget): answers text-only first, then offers "re-answer with screen" and uses that frame', async () => {
    let release!: (s: typeof SHOT) => void
    const capture = vi.fn(() => new Promise<typeof SHOT>(r => { release = r }))
    const t = setup({ screen: { capture }, waitMs: 20 })
    hear(t, CODING)
    await vi.waitFor(() => expect(t.reqs).toHaveLength(1))
    expect(t.reqs[0]!.image).toBeUndefined()
    release(SHOT)
    await vi.waitFor(() => expect(t.screens()).toContain('ready'))
    await t.w.screenshot() // the button now reads "Re-answer with screen"
    expect(capture).toHaveBeenCalledTimes(1)
    expect(t.reqs).toHaveLength(2)
    expect(t.reqs[1]!.image).toBeDefined()
  })
  it('a screen turn never adopts a speculative text-only request', async () => {
    const t = setup({ patch: c => { c.engine.speculativeStart = true } })
    t.w.emit('copilotState', live())
    t.w.emit('copilotTranscript', line('a', CODING, false)); t.w.emit('copilotTranscript', line('a', CODING))
    await settle()
    expect(t.reqs.at(-1)!.image).toBeDefined()
  })
})

describe('cleanup', () => {
  it('clears held frames when the session stops, on panic and when a new session arms', () => {
    const t = setup()
    t.w.emit('copilotState', { ...live(), state: 'armed' })
    expect(t.screen.clear).toHaveBeenCalledTimes(1)
    t.w.emit('copilotState', { ...live(), state: 'stopped' })
    expect(t.screen.clear).toHaveBeenCalledTimes(2)
    t.hooks().abortRequests()
    expect(t.screen.clear).toHaveBeenCalledTimes(3)
  })
})
