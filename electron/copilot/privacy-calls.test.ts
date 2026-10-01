import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_CONFIG } from './config'
import type { AnswerProvider } from './engine'
import { blockWhenLocalOnly, createScoreCall, nameFromCv, redactIfOn } from './privacy-calls'
import { LlmError } from './providers/openrouter'
import type { CopilotConfig } from './types'

const cfg = (privacy: Partial<CopilotConfig['privacy']> = {}): CopilotConfig => ({ ...DEFAULT_CONFIG, privacy: { ...DEFAULT_CONFIG.privacy, ...privacy } })
const fake = () => {
  const seen: Array<{ system: string; content: string; model: string }> = []
  const provider: AnswerProvider = { id: 'openrouter', async *stream(p) { seen.push({ system: p.system, content: String(p.messages[0]!.content), model: p.model }); yield { delta: '{"ok":1}' } } }
  return { provider, seen }
}

describe('blockWhenLocalOnly', () => {
  it('refuses every request while local-only is on and never reaches the provider', async () => {
    const { provider, seen } = fake()
    const p = blockWhenLocalOnly(provider, () => true)
    const run = async () => { for await (const _ of p.stream({ system: 's', messages: [{ role: 'user', content: 'x' }], model: 'm', signal: new AbortController().signal })) { /* drain */ } }
    await expect(run()).rejects.toBeInstanceOf(LlmError)
    expect(seen).toHaveLength(0)
  })
  it('passes through when local-only is off, and re-reads the setting per call', async () => {
    const { provider, seen } = fake()
    let on = false
    const p = blockWhenLocalOnly(provider, () => on)
    const drain = async () => { for await (const _ of p.stream({ system: 's', messages: [{ role: 'user', content: 'x' }], model: 'm', signal: new AbortController().signal })) { /* drain */ } }
    await drain()
    on = true
    await expect(drain()).rejects.toThrow(/local-only/i)
    expect(seen).toHaveLength(1)
  })
})

describe('createScoreCall (debrief scoring goes through the configured provider, redacted)', () => {
  it('masks emails, phones and self-introductions when redaction is on', async () => {
    const { provider, seen } = fake()
    const call = createScoreCall({ provider: () => provider, config: () => cfg({ redact: true }), model: () => 'm1' })
    const r = await call('My name is Jane Roe, mail jane@x.com or +44 7700 900123')
    expect(seen[0]!.content).not.toMatch(/Jane|jane@x\.com|7700/)
    expect(seen[0]!.model).toBe('m1')
    expect(r).toEqual({ text: '{"ok":1}', tokens: null, model: 'm1' })
  })
  it('sends the prompt as written when redaction is off', async () => {
    const { provider, seen } = fake()
    await createScoreCall({ provider: () => provider, config: () => cfg({ redact: false }), model: () => 'm' })('jane@x.com')
    expect(seen[0]!.content).toBe('jane@x.com')
  })
  it('propagates the local-only block', async () => {
    const { provider } = fake()
    const call = createScoreCall({ provider: () => blockWhenLocalOnly(provider, () => true), config: () => cfg(), model: () => 'm' })
    await expect(call('x')).rejects.toThrow(/local-only/i)
  })
  it('does not start any request before being called', () => {
    const provider = vi.fn(() => fake().provider)
    createScoreCall({ provider, config: () => cfg(), model: () => 'm' })
    expect(provider).not.toHaveBeenCalled()
  })
})

describe('redactIfOn', () => {
  it('masks only while the setting is on, read per call', () => {
    let on = true
    const mask = redactIfOn(() => cfg({ redact: on }))
    expect(mask('mail a@b.co')).toBe('mail [EMAIL]')
    on = false
    expect(mask('mail a@b.co')).toBe('mail a@b.co')
  })
})

describe('nameFromCv', () => {
  it('takes the first heading or a short first line, never a sentence', () => {
    expect(nameFromCv('# Ada Lovelace\n- Led migration')).toEqual(['Ada Lovelace', 'Ada', 'Lovelace'])
    expect(nameFromCv('Ada Lovelace\nengineer')).toEqual(['Ada Lovelace', 'Ada', 'Lovelace'])
    expect(nameFromCv('Experienced engineer with 10 years building platforms and teams\n')).toEqual([])
    expect(nameFromCv('')).toEqual([])
  })
})
