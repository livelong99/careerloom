import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { createJevGate, type JevOptions } from './jev'

type Seen = { url: string; auth: string | undefined; body: Record<string, any> }
const servers: http.Server[] = []
afterEach(() => { for (const s of servers.splice(0)) s.close() })

async function serve(handler: (seen: Seen) => { status?: number; json?: unknown; delayMs?: number; hang?: boolean }): Promise<{ baseUrl: string; seen: Seen[] }> {
  const seen: Seen[] = []
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => {
      const s: Seen = { url: req.url ?? '', auth: req.headers.authorization, body: JSON.parse(raw || '{}') }
      seen.push(s)
      const r = handler(s)
      if (r.hang) return
      setTimeout(() => { res.writeHead(r.status ?? 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r.json ?? {})) }, r.delayMs ?? 0)
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  servers.push(server)
  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen }
}

const answers = (over: Record<string, unknown> = {}) => ({
  is_question: { type: 'noul', noul: 0.93 }, complete: { type: 'noul', noul: 0.88 },
  kind: { type: 'choice', choice: 'system_design', confidence: 0.8, probabilities: { system_design: 0.8, coding: 0.2 } },
  needs_screen: { type: 'noul', noul: 0.05 }, tier: { type: 'choice', choice: 'deep', confidence: 0.7, probabilities: { deep: 0.7, quick: 0.3 } }, ...over,
})
const opts = (baseUrl: string, over: Partial<JevOptions> = {}): JevOptions => ({ baseUrl, endpoint: 'systemone', getKey: () => 'sk-or-test', ...over })
const input = { text: 'Design a URL shortener.', speaker: 'interviewer' as const, previous: ['Thanks.'] }

describe('Jev gate', () => {
  it('systemone shape: POSTs /v1/systemone with a string state, the transcript only in state, key as bearer', async () => {
    const { baseUrl, seen } = await serve(() => ({ json: { model: 'jev-1.13.0', answers: answers() } }))
    const v = await createJevGate(opts(baseUrl)).decide(input)
    expect(seen[0]!.url).toBe('/v1/systemone')
    expect(seen[0]!.auth).toBe('Bearer sk-or-test')
    expect(seen[0]!.body.model).toBe('typesafe/jev-1.13')
    expect(typeof seen[0]!.body.state).toBe('string')
    expect(seen[0]!.body.state).toContain('Design a URL shortener.')
    expect(JSON.stringify(seen[0]!.body.questions)).not.toContain('URL shortener') // instructions never carry transcript text
    expect(Object.keys(seen[0]!.body.questions)).toEqual(['is_question', 'complete', 'kind', 'needs_screen', 'tier'])
    expect(v).toMatchObject({ isQuestion: true, complete: true, kind: 'system-design', needsScreenshot: false, deep: true, source: 'jev' })
  })

  it('decisions shape: POSTs /alpha/decisions with an object state; same answers parse the same', async () => {
    const { baseUrl, seen } = await serve(() => ({ json: { id: 'gen-dec-1', answers: answers({ is_question: { type: 'noul', noul: 0.1 } }) } }))
    const v = await createJevGate(opts(baseUrl, { endpoint: 'decisions' })).decide(input)
    expect(seen[0]!.url).toBe('/alpha/decisions')
    expect(seen[0]!.body.state).toMatchObject({ speaker: 'interviewer', last_utterance: 'Design a URL shortener.', previous_lines: ['Thanks.'] })
    expect(v.isQuestion).toBe(false)
  })

  it('maps the middle band to unsure and unknown kinds to null', async () => {
    const { baseUrl } = await serve(() => ({ json: { answers: answers({ is_question: { type: 'noul', noul: 0.5 }, kind: { type: 'choice', choice: 'weird', confidence: 0.5, probabilities: {} } }) } }))
    const v = await createJevGate(opts(baseUrl)).decide(input)
    expect(v.isQuestion).toBeNull()
    expect(v.kind).toBeNull()
  })

  it('rejects on timeout, HTTP errors, malformed bodies and a missing key (the pipeline falls back)', async () => {
    const hang = await serve(() => ({ hang: true }))
    await expect(createJevGate(opts(hang.baseUrl)).decide(input, AbortSignal.timeout(80))).rejects.toThrow()
    const bad = await serve(() => ({ status: 500, json: { error: 'x' } }))
    await expect(createJevGate(opts(bad.baseUrl)).decide(input)).rejects.toThrow(/500/)
    const junk = await serve(() => ({ json: { nothing: true } }))
    await expect(createJevGate(opts(junk.baseUrl)).decide(input)).rejects.toThrow(/answers/)
    await expect(createJevGate(opts(junk.baseUrl, { getKey: () => null })).decide(input)).rejects.toThrow(/key/)
  })

  it('never puts the key or the transcript into an error message', async () => {
    const bad = await serve(() => ({ status: 401, json: { error: 'Bearer sk-or-test echoed Design a URL shortener.' } }))
    const err = await createJevGate(opts(bad.baseUrl)).decide(input).catch((e: Error) => e)
    expect((err as Error).message).not.toContain('sk-or-test')
    expect((err as Error).message).not.toContain('URL shortener')
  })

  it('caps the transcript it sends: last utterance 600 chars, 3 previous lines', async () => {
    const { baseUrl, seen } = await serve(() => ({ json: { answers: answers() } }))
    await createJevGate(opts(baseUrl, { endpoint: 'decisions' })).decide({ text: 'x'.repeat(2000), speaker: 'interviewer', previous: ['a', 'b', 'c', 'd', 'e'] })
    expect(seen[0]!.body.state.last_utterance).toHaveLength(600)
    expect(seen[0]!.body.state.previous_lines).toEqual(['c', 'd', 'e'])
  })
})
