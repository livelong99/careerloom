// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TtsAudioMsg } from '../kb/types'
import { createFakeTts } from './fake'
import type { InterviewConfig } from '../kb/types'
import { createTtsRuntime } from './runtime'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const mk = (over: Partial<Parameters<typeof createTtsRuntime>[0]> = {}) => {
  const sent: TtsAudioMsg[] = []; const toasts: string[] = []
  let voice: InterviewConfig['voice'] = { engine: 'system', voiceId: 'system-v1', speed: 1, echo: 'speakers', tailMs: 350, pushToInterrupt: 'Space' }
  const engines = { system: createFakeTts({ id: 'system' }), kokoro: createFakeTts({ id: 'kokoro' }), openrouter: createFakeTts({ id: 'openrouter' }) }
  const rt = createTtsRuntime({ config: () => voice, send: m => sent.push(m), notify: t => toasts.push(t), engines, kokoroInstalled: () => true, hasOpenRouterKey: () => false, now: () => Date.now(), install: () => ({ runId: 'r1' }), ...over })
  return { rt, sent, toasts, engines, setVoice: (v: Partial<typeof voice>) => { voice = { ...voice, ...v } } }
}

describe('tts runtime', () => {
  it('voices(): every engine, system en_IN list first', async () => {
    const { rt } = mk()
    const v = await rt.handlers.interviewVoices()
    expect(v.map(x => x.engine)).toEqual(['system', 'kokoro', 'openrouter'])
  })
  it('preview speaks one fixed sentence with the requested voice/speed and closes the utterance', async () => {
    const { rt, sent, engines } = mk()
    await rt.handlers.interviewPreviewVoice('system', 'system-v1', 1.2)
    await vi.runAllTimersAsync()
    expect(engines.system.calls[0]).toMatchObject({ voiceId: 'system-v1', speed: 1.2 })
    expect(sent.at(-1)?.last).toBe(true)
  })
  it('install delegates to the installer', async () => {
    const { rt } = mk()
    expect(await rt.handlers.interviewInstallVoice('kokoro')).toEqual({ runId: 'r1' })
  })
  it('playback events drive the echo gate: mic frames drop while the interviewer speaks', () => {
    const { rt } = mk()
    expect(rt.gate().drops()).toBe(false)
    rt.onPlayback({ phase: 'started', utteranceId: 'u' }); expect(rt.gate().drops()).toBe(true)
    rt.onPlayback({ phase: 'ended', utteranceId: 'u' }); expect(rt.gate().drops()).toBe(true) // tail
  })
  it('headphones mode never drops; changing the echo setting rebuilds the gate', () => {
    const { rt, setVoice } = mk()
    rt.onPlayback({ phase: 'started', utteranceId: 'u' })
    setVoice({ echo: 'headphones' }); expect(rt.gate().drops()).toBe(false)
  })
  it('speak() records the sentence for the text-echo filter and queues it; interrupt cancels', async () => {
    const { rt, sent } = mk()
    rt.speak('q1', 'Tell me about a time you disagreed with a teammate.')
    expect(rt.gate().isEcho('tell me about a time you disagreed with a teammate')).toBe(true)
    await vi.runAllTimersAsync(); rt.onPlayback({ phase: 'started', utteranceId: 'q1' })
    expect(rt.interrupt()).toBe(true)
    expect(sent.at(-1)).toMatchObject({ seq: -1, last: true })
  })
  it('a fallback names itself in one toast', async () => {
    const { rt, toasts, setVoice } = mk({ engines: { system: createFakeTts({ id: 'system' }), kokoro: createFakeTts({ id: 'kokoro', fail: new Error('down') }), openrouter: createFakeTts({ id: 'openrouter' }) } })
    setVoice({ engine: 'kokoro', voiceId: 'af_heart' })
    rt.speak('q', 'A sentence long enough to speak.'); rt.speak('q', 'And a second sentence to speak.')
    await vi.runAllTimersAsync()
    expect(toasts).toEqual(['Kokoro is unavailable, using the system voice'])
  })
})
