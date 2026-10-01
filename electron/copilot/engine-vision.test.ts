import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config'
import { buildGrounding } from './context'
import { createAnswerEngine, type AnswerProvider, type ProviderPrompt, type StreamItem } from './engine'
import { LlmError } from './providers/openrouter'
import { friendlyLlmError } from './providers/errors'
import { createTraceLog } from './trace'
import type { CopilotConfig, DetectedQuestion, Suggestion } from './types'

const grounding = buildGrounding({ jobId: 'j', title: 'Engineer', company: 'Acme', report: null, rawReport: null, posting: null }, '# Asha\n- Led a migration')
const q = (text = 'What is the complexity of the function on my screen?'): DetectedQuestion => ({ id: 'q1', text, type: 'coding', confidence: 0.9, at: 0, auto: false })
const cfg = (patch: (c: CopilotConfig) => void = () => undefined): CopilotConfig => { const c = structuredClone(DEFAULT_CONFIG); c.engine.escalateForDesignCoding = false; patch(c); return c }
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const reply = async function* (): AsyncGenerator<StreamItem> { yield { delta: '[SAY]\nO(n log n).\n' }; yield { usage: { promptTokens: 1500, completionTokens: 20 } } }

function setup(config: CopilotConfig, extra: Partial<Parameters<typeof createAnswerEngine>[0]> = {}) {
  const calls: ProviderPrompt[] = []
  const provider: AnswerProvider = { id: 'openrouter', stream: p => { calls.push(p); return reply() } }
  const engine = createAnswerEngine({ provider, config: () => config, grounding: () => grounding, partialEveryMs: 0, ...extra })
  const run = async (image?: { jpeg: Buffer; captureMs?: number; encodeMs?: number }, question = q()): Promise<{ out: Suggestion[]; err: unknown }> => {
    const out: Suggestion[] = []
    let err: unknown = null
    try { for await (const s of engine.answer({ question, transcript: [], kind: 'answer', signal: new AbortController().signal, ...(image ? { image } : {}) })) out.push(s) } catch (e) { err = e }
    return { out, err }
  }
  return { calls, run }
}

describe('engine: screenshot as an image part', () => {
  it('sends the image first, then the text, only to a vision model', async () => {
    const { calls, run } = setup(cfg(c => { c.engine.models.fast = 'openai/gpt-4.1-nano' }))
    const { out, err } = await run({ jpeg: JPEG })
    expect(err).toBeNull()
    const content = calls[0]!.messages.at(-1)!.content
    expect(Array.isArray(content)).toBe(true)
    const parts = content as Array<{ type: string; text?: string; image_url?: { url: string } }>
    expect(parts[0]!.type).toBe('image_url')
    expect(parts[0]!.image_url!.url).toBe(`data:image/jpeg;base64,${JPEG.toString('base64')}`)
    expect(parts[1]!.type).toBe('text')
    expect(parts[1]!.text).toContain('QUESTION:')
    expect(out.at(-1)!.done).toBe(true)
  })

  it('no image: content stays a plain string (no behaviour change)', async () => {
    const { calls, run } = setup(cfg())
    await run()
    expect(typeof calls[0]!.messages.at(-1)!.content).toBe('string')
  })

  it('a non-vision model gets a clear error with a suggestion, the provider is never called and the image is never dropped silently', async () => {
    const { calls, run } = setup(cfg(c => { c.engine.models.fast = 'qwen/qwen3-30b-a3b-instruct-2507' }))
    const { out, err } = await run({ jpeg: JPEG })
    expect(calls).toHaveLength(0)
    expect(out).toHaveLength(0)
    expect(err).toBeInstanceOf(LlmError)
    const e = err as LlmError
    expect(e.code).toBe('no_vision')
    expect(e.message).toMatch(/can't read images/i)
    expect(e.suggestion).toBe('openai/gpt-4.1-nano')
    expect(friendlyLlmError(e, { dataCollection: 'allow' })).toMatchObject({ code: 'no_vision', actions: ['change-model'], suggestion: 'openai/gpt-4.1-nano' })
  })

  it('an unknown custom model is vision-capable only if the live list says so', async () => {
    const seen: string[] = []
    const { run } = setup(cfg(c => { c.engine.models.fast = 'acme/some-model' }), { isVision: id => { seen.push(id); return id === 'acme/some-model' } })
    expect((await run({ jpeg: JPEG })).err).toBeNull()
    expect(seen).toContain('acme/some-model')
  })

  it('failover while an image is attached only rotates among vision models', async () => {
    const { calls, run } = setup(cfg(c => { c.engine.models.fast = 'openai/gpt-4.1-nano' }), { isVision: id => id !== 'qwen/qwen3-30b-a3b-instruct-2507' })
    await run({ jpeg: JPEG })
    expect(calls.every(p => p.model !== 'qwen/qwen3-30b-a3b-instruct-2507')).toBe(true)
  })

  it('redaction still masks the text part; the question text is never sent unmasked beside the image', async () => {
    const { calls, run } = setup(cfg(c => { c.privacy.redact = true }), { redactNames: () => ['Dana Whitfield'] })
    await run({ jpeg: JPEG }, q('Dana Whitfield asks: what does the function on screen return?'))
    const text = (calls[0]!.messages.at(-1)!.content as Array<{ text?: string }>)[1]!.text!
    expect(text).not.toContain('Dana Whitfield')
  })

  it('the spend ceiling is honoured before any image leaves', async () => {
    const { calls, run } = setup(cfg(), { ceilingUsd: 0, cost: { exceeds: () => true, add: () => 0, totalUsd: () => 1 } as never })
    const { err } = await run({ jpeg: JPEG })
    expect((err as LlmError).code).toBe('budget')
    expect(calls).toHaveLength(0)
  })

  it('the trace records capture/encode/size for the turn', async () => {
    const trace = createTraceLog()
    const { run } = setup(cfg(), { trace })
    await run({ jpeg: JPEG, captureMs: 91, encodeMs: 7 })
    expect(trace.last()!.ms.turn?.shot).toEqual({ captureMs: 91, encodeMs: 7, bytes: JPEG.length })
  })
})
