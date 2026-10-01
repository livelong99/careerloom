// QA only: fake OpenRouter that records what a screenshot turn actually sends. No key, no spend. Node 22, no dependencies.
//   node fake-vision-openrouter.mjs <port> <outDir>
// Per chat request it appends one JSON line to <outDir>/requests.jsonl (model, content-part kinds, image bytes) and, for the
// first image seen, saves the decoded JPEG to <outDir>/received.jpg so the run can prove the picture reached the provider.
import fs from 'node:fs'
import http from 'node:http'

const port = Number(process.argv[2] || 8788)
const out = process.argv[3]
fs.mkdirSync(out, { recursive: true })
const ANSWER = '[SAY]\nThe function is O(n log n): it sorts once, then scans once.\n[BULLETS]\n- Sorting dominates the cost\n- The scan is linear\n'
const MODELS = [
  { id: 'anthropic/claude-sonnet-5.5', architecture: { input_modalities: ['text', 'image', 'file'] }, pricing: { prompt: '0.000002', completion: '0.00001' } },
  { id: 'qwen/qwen3-30b-a3b-instruct-2507', architecture: { input_modalities: ['text'] }, pricing: { prompt: '0.00000004815', completion: '0.0000002' } },
]
let saved = false

function sse(res, text, model) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  res.write(': OPENROUTER PROCESSING\n\n')
  const words = text.split(/(?<=\s)/)
  let i = 0
  const tick = () => {
    if (res.destroyed) return
    if (i >= words.length) {
      res.write(`data: ${JSON.stringify({ id: 'g', model, choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1700, completion_tokens: 30, cost: 0.0004 } })}\n\ndata: [DONE]\n\n`)
      return void res.end()
    }
    res.write(`data: ${JSON.stringify({ id: 'g', model, choices: [{ delta: { content: words[i++] } }] })}\n\n`)
    setTimeout(tick, 30)
  }
  setTimeout(tick, 200)
}

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url?.startsWith('/api/v1/models')) { res.writeHead(200, { 'content-type': 'application/json' }); return void res.end(JSON.stringify({ data: MODELS })) }
  if (req.method === 'GET') { res.writeHead(200); return void res.end('{}') } // warm-up
  if (!req.url?.includes('/chat/completions')) { res.writeHead(404); return void res.end() }
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    const j = JSON.parse(body || '{}')
    const last = j.messages?.at(-1)?.content
    const parts = Array.isArray(last) ? last : []
    const img = parts.find(p => p.type === 'image_url')
    const b64 = img?.image_url?.url?.replace(/^data:image\/jpeg;base64,/, '')
    const bytes = b64 ? Buffer.from(b64, 'base64') : null
    if (bytes && !saved) { saved = true; fs.writeFileSync(`${out}/received.jpg`, bytes) }
    const kind = /You label one line/.test(JSON.stringify(j)) ? 'classify' : 'answer'
    fs.appendFileSync(`${out}/requests.jsonl`, JSON.stringify({ t: Date.now(), kind, model: j.model, parts: parts.map(p => p.type), imageBytes: bytes?.length ?? 0, jpegMagic: bytes ? bytes.subarray(0, 2).toString('hex') : null, dataUrl: img?.image_url?.url?.slice(0, 23) ?? null }) + '\n')
    sse(res, kind === 'classify' ? 'no' : ANSWER, j.model)
  })
}).listen(port, '127.0.0.1', () => console.log(`fake vision openrouter on http://127.0.0.1:${port}/api/v1`))
