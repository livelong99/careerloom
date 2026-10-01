// Local fake of OpenRouter's /chat/completions SSE stream with injected, SYNTHETIC latency profiles (PERF-1 harness).
// It models only plumbing: a cold-connection penalty removed by the warm-up GET, a prefix cache keyed on the system prompt
// (cached_tokens in usage, faster first token on a hit) and a fixed answer streamed in small deltas. Numbers are the profile's.
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'

export const PROFILES = {
  fast: { coldMs: 380, connectMs: 120, ttftMs: 260, cachedTtftMs: 190, tokenGapMs: 6 },
  balanced: { coldMs: 380, connectMs: 180, ttftMs: 520, cachedTtftMs: 340, tokenGapMs: 9 },
  'slow-reasoner': { coldMs: 380, connectMs: 250, ttftMs: 1900, cachedTtftMs: 1700, tokenGapMs: 12 },
}

const ANSWER = `[SAY]\nI led a Kubernetes migration of forty services and cut deploy time by sixty percent.\n[BULLETS]\n- Phased cut-over per service\n- Terraform modules for twelve teams\n- Rollback plan rehearsed first\n[STAR]\nS: Legacy VMs\nT: Migrate forty services\nA: I led the cut-over\nR: Deploys got sixty percent faster\n`
const wait = ms => new Promise(r => setTimeout(r, ms))

export async function startFakeServer(profile) {
  const seen = new Set()
  let warmed = false
  const stats = { warmups: 0, chats: 0 }
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url.endsWith('/key')) { stats.warmups++; warmed = true; res.end('{}'); return }
    let raw = ''
    for await (const c of req) raw += c
    const body = JSON.parse(raw)
    stats.chats++
    const sys = typeof body.messages[0].content === 'string' ? body.messages[0].content : body.messages[0].content.map(b => b.text).join('')
    const key = createHash('sha1').update(sys).digest('hex')
    const hit = seen.has(key)
    seen.add(key)
    const cold = !warmed
    warmed = true // the first real request also opens the connection
    await wait((cold ? profile.coldMs : 0) + profile.connectMs)
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(': OPENROUTER PROCESSING\n\n')
    await wait((hit ? profile.cachedTtftMs : profile.ttftMs) - profile.connectMs)
    for (let i = 0; i < ANSWER.length; i += 4) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ANSWER.slice(i, i + 4) } }] })}\n\n`); await wait(profile.tokenGapMs) }
    const prompt = Math.ceil((sys.length + body.messages[1].content.length) / 4)
    const cached = hit ? Math.ceil(sys.length / 4) : 0
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: Math.ceil(ANSWER.length / 4), prompt_tokens_details: { cached_tokens: cached } } })}\n\ndata: [DONE]\n\n`)
    res.end()
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return { baseUrl: `http://127.0.0.1:${server.address().port}/api/v1`, stats, close: () => new Promise(r => server.close(r)) }
}
