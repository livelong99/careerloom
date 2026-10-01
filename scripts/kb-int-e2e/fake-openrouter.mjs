// QA only (KB integration): the Copilot fake OpenRouter plus the AI-interviewer calls (rubric scoring JSON, STAR checklist JSON). No key, no spend.
//   node fake-openrouter.mjs <port> [logfile]
import http from 'node:http'
import fs from 'node:fs'

const port = Number(process.argv[2] || 8787)
const logFile = process.argv[3]
const log = o => { if (logFile) fs.appendFileSync(logFile, JSON.stringify({ t: Date.now(), ...o }) + '\n') }

const ANSWER = `[SAY]
At Northwind I led the move of forty services to Kubernetes while keeping releases weekly.
[BULLETS]
- Situation: forty services on aging VMs, releases slowed to monthly
- Action: staged the migration by service tier and automated the cut-over
- Result: back to weekly releases with fewer incidents
[STAR]
S: Forty services on aging VMs slowed releases.
T: Move them without stopping delivery.
A: Staged by tier, automated cut-over, paired with each team.
R: Weekly releases again, fewer incidents.
[PROOF]
- "Led migration of 40 services to Kubernetes" | cv.md
`
const SCORE = JSON.stringify({ structure: 4, specifics: 3.5, evidence: 4, concision: 3, notes: [{ questionId: 'QID', tip: 'Open with the result, then the steps.', suggestedLine: null }] })

function sse(res, text, model) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  res.write(': OPENROUTER PROCESSING\n\n')
  const words = text.split(/(?<=\s)/)
  let i = 0
  const tick = () => {
    if (res.destroyed) return
    if (i >= words.length) {
      res.write(`data: ${JSON.stringify({ id: 'g', model, choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 900, completion_tokens: Math.ceil(text.length / 4), cost: 0.0004 } })}\n\n`)
      res.write('data: [DONE]\n\n'); res.end(); return
    }
    res.write(`data: ${JSON.stringify({ id: 'g', model, choices: [{ delta: { content: words[i++] } }] })}\n\n`)
    setTimeout(tick, 35)
  }
  setTimeout(tick, 250) // first token ~250 ms
}

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url?.startsWith('/models')) { res.writeHead(404); res.end(); return }
  if (req.method !== 'POST' || !req.url?.includes('/chat/completions')) { res.writeHead(404); res.end(); return }
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    const j = JSON.parse(body || '{}')
    const user = j.messages?.map(m => m.content).join('\n') ?? ''
    const sys = j.messages?.[0]?.role === 'system' ? j.messages[0].content : (j.system ?? '')
    const all = JSON.stringify(j)
    if (/You score one spoken interview answer/.test(all)) {
      const names = (/Score exactly these criteria, in order: ([^\\]+?)\./.exec(all)?.[1] ?? 'Structure; Specifics').split('; ')
      const q = /Question: ([^\\]+)/.exec(all)?.[1] ?? ''
      let h = 0; for (const c of q) h = (h * 31 + c.charCodeAt(0)) % 7
      log({ kind: 'rubric', model: j.model, q })
      return sse(res, JSON.stringify({ criteria: names.map((criterion, i) => ({ criterion, score: 2 + ((h + i) % 4), evidence: '' })) }), j.model)
    }
    if (/Check an interview answer against a checklist/.test(all)) {
      const els = [...(/\{((?:"\w+":true\|false,?)+)\}/.exec(all)?.[1] ?? '').matchAll(/"(\w+)":/g)].map(m => m[1])
      log({ kind: 'checklist', model: j.model })
      return sse(res, JSON.stringify(Object.fromEntries(els.map((e, i) => [e, i !== els.length - 1]))), j.model)
    }
    const kind = /You label one line/.test(JSON.stringify(j)) ? 'classify' : /score a candidate/i.test(user) ? 'score' : /mock interviewer/i.test(JSON.stringify(j)) ? 'followup' : 'answer'
    log({ kind, model: j.model, stream: !!j.stream, maxTokens: j.max_tokens, dataCollection: j.provider?.data_collection })
    if (kind === 'classify') return sse(res, 'no', j.model)
    if (kind === 'followup') return sse(res, 'NONE', j.model)
    if (kind === 'score') { const qid = /\[([^\]]+)\] Question:/.exec(user)?.[1] ?? 'q1'; return sse(res, SCORE.replace('QID', qid), j.model) }
    sse(res, ANSWER, j.model)
  })
}).listen(port, '127.0.0.1', () => console.log(`fake openrouter on http://127.0.0.1:${port}/api/v1`))
