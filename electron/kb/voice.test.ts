// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rt = vi.hoisted(() => ({ speak: vi.fn(), end: vi.fn(), cancel: vi.fn(), onPlayback: vi.fn(), gate: vi.fn(), handlers: {} }))
const seen = vi.hoisted(() => ({ config: null as null | (() => { engine: string; voiceId: string | null; speed: number; echo: string }) }))
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))
vi.mock('./config', () => ({ readInterviewConfig: () => ({ voice: { engine: 'system', voiceId: null, speed: 1, echo: 'headphones', tailMs: 500, pushToInterrupt: '' } }) }))
vi.mock('../tts/runtime', () => ({ createTtsRuntime: (d: { config: typeof seen.config }) => { seen.config = d.config; return rt } }))
vi.mock('../tts/kokoro', () => ({ createKokoroEngine: () => ({}) }))
vi.mock('../tts/openrouter', () => ({ createOpenRouterEngine: () => ({}) }))
vi.mock('../tts/say', () => ({ createSystemEngine: () => ({}) }))

import type { InterviewPlan } from '../interviewer/types'
import { endInterviewVoice, interviewSpeaker, micPausesWhileSpeaking, onTtsPlayback } from './voice'

const plan = { voice: { engine: 'kokoro', voiceId: 'af_heart', speed: 1.25 }, echo: 'speakers' } as unknown as InterviewPlan
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); endInterviewVoice(); vi.clearAllMocks() })

describe('interview speaker', () => {
  it('speaks sentence by sentence, closes the utterance, and resolves when playback ended', async () => {
    const sp = interviewSpeaker(plan)
    let done = false
    const p = Promise.resolve(sp.say('Tell me about a migration. What went wrong?', 'q1')).then(() => { done = true })
    const id = rt.speak.mock.calls[0]![0] as string
    expect(rt.speak.mock.calls.map(c => c[1])).toEqual(['Tell me about a migration.', 'What went wrong?'])
    expect(rt.end).toHaveBeenCalledWith(id)
    await Promise.resolve(); expect(done).toBe(false)
    onTtsPlayback({ phase: 'started', utteranceId: id }); await Promise.resolve(); expect(done).toBe(false)
    onTtsPlayback({ phase: 'ended', utteranceId: id }); await p
    expect(done).toBe(true)
    expect(rt.onPlayback).toHaveBeenCalledTimes(2) // the echo gate hears both
  })

  it('a window that never plays cannot hang the interview: a timeout releases it', async () => {
    const p = Promise.resolve(interviewSpeaker(plan).say('Hello there.', 'q1'))
    await vi.advanceTimersByTimeAsync(9_000 + 'Hello there.'.length * 120)
    await expect(p).resolves.toBeUndefined()
  })

  it('cancel stops the voice and releases a waiting question', async () => {
    const sp = interviewSpeaker(plan)
    const p = Promise.resolve(sp.say('A long question here.', 'q1'))
    sp.cancel()
    await expect(p).resolves.toBeUndefined()
    expect(rt.cancel).toHaveBeenCalled()
  })

  it("the running interview's voice and echo choice win over interview.json, until it ends", () => {
    expect(micPausesWhileSpeaking()).toBe(false) // config says headphones
    interviewSpeaker(plan)
    expect(micPausesWhileSpeaking()).toBe(true)  // the plan says speakers
    expect(seen.config!()).toMatchObject({ engine: 'kokoro', voiceId: 'af_heart', speed: 1.25, echo: 'speakers' })
    endInterviewVoice()
    expect(seen.config!()).toMatchObject({ engine: 'system', echo: 'headphones' })
  })
})
