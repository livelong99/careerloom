// Tools for the in-process zen runner — the same grant the CLIs get (runner.ts CLAUDE_TOOLS,
// opencode.ts): read/write/edit/list/glob/grep inside the career-ops folder (installed skill
// folders read-only), career-ops' own node / npm scripts, web fetch + search.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { resolveBin, spawnSpec, type SpawnSpec } from './runner'

export type ToolContext = { root: string; readDirs: string[]; env: NodeJS.ProcessEnv }
export type ToolDef = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

const OUT_CAP = 40_000
const cap = (s: string, n = OUT_CAP) => (s.length > n ? `${s.slice(0, n)}\n… [truncated ${s.length - n} chars]` : s)
const obj = (props: Record<string, unknown>, required: string[]) => ({ type: 'object', properties: props, required })
const S = { type: 'string' }
const N = { type: 'number' }

export const FILE_TOOLS: ToolDef[] = [
  { type: 'function', function: { name: 'read', description: 'Read a text file (paths relative to the career-ops folder). Returns numbered lines.', parameters: obj({ path: S, offset: { ...N, description: '1-based first line' }, limit: N }, ['path']) } },
  { type: 'function', function: { name: 'write', description: 'Create or overwrite a file inside the career-ops folder.', parameters: obj({ path: S, content: S }, ['path', 'content']) } },
  { type: 'function', function: { name: 'edit', description: 'Replace old_string with new_string in a file. old_string must match exactly once unless replace_all is true.', parameters: obj({ path: S, old_string: S, new_string: S, replace_all: { type: 'boolean' } }, ['path', 'old_string', 'new_string']) } },
  { type: 'function', function: { name: 'list', description: 'List a directory.', parameters: obj({ path: S }, []) } },
  { type: 'function', function: { name: 'glob', description: 'Find files by glob pattern, e.g. "reports/*.md".', parameters: obj({ pattern: S, path: S }, ['pattern']) } },
  { type: 'function', function: { name: 'grep', description: 'Search file contents with a regular expression.', parameters: obj({ pattern: S, path: S, glob: S }, ['pattern']) } },
  { type: 'function', function: { name: 'bash', description: 'Run a career-ops script: `node <script> [args]` or `npm run <script> [args]`. No shell: pipes, redirects and && are not supported.', parameters: obj({ command: S }, ['command']) } },
  { type: 'function', function: { name: 'webfetch', description: 'Fetch a public web page as plain text.', parameters: obj({ url: S }, ['url']) } },
  { type: 'function', function: { name: 'websearch', description: 'Search the web; returns titles, URLs and snippets.', parameters: obj({ query: S }, ['query']) } },
]

// ————— Paths —————

/** Resolve through symlinks, allowing a not-yet-existing tail (for new files). */
function realish(p: string): string {
  const tail: string[] = []
  let cur = p
  while (!fs.existsSync(cur)) {
    const up = path.dirname(cur)
    if (up === cur) break
    tail.unshift(path.basename(cur))
    cur = up
  }
  return path.join(fs.realpathSync(cur), ...tail)
}

const inside = (p: string, dir: string) => { const d = realish(dir); return p === d || p.startsWith(d + path.sep) }

/** An absolute path under one of `roots`, else throws. Never .git; never .env files. */
export function confine(p: unknown, roots: string[]): string {
  if (typeof p !== 'string' || !p.trim()) throw new Error('path is required')
  const abs = realish(path.resolve(roots[0]!, p))
  if (!roots.some(r => inside(abs, r))) throw new Error(`${p} is outside the career-ops folder`)
  if (abs.split(path.sep).includes('.git') || /^\.env(\.|$)/.test(path.basename(abs))) throw new Error(`${p} is off limits`)
  return abs
}

// ————— Commands —————

/** Split a command line on whitespace with '…' / "…" quoting. null = shell syntax we don't run. */
export function splitCommand(cmd: string): string[] | null {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  let started = false
  for (const ch of cmd) {
    if (quote) { if (ch === quote) quote = null; else cur += ch; continue }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue }
    if (/\s/.test(ch)) { if (started) out.push(cur); cur = ''; started = false; continue }
    if (/[;&|<>`$()\\]/.test(ch)) return null
    cur += ch
    started = true
  }
  if (quote) return null
  if (started) out.push(cur)
  return out
}

/** `node <script inside root> …` or `npm run <name> …`, as a spawn spec; else throws. */
export function commandSpec(command: string, ctx: ToolContext): SpawnSpec {
  const argv = splitCommand(command)
  if (!argv?.length) throw new Error('Only plain commands run here — no pipes, redirects, && or $(…)')
  const [bin, first, ...rest] = argv
  if (bin === 'node' && first && !first.startsWith('-') && /\.[cm]?js$/.test(first)) {
    const args = [confine(first, [ctx.root]), ...rest]
    // Packaged app without a system node: Electron's own binary runs as Node.
    return resolveBin('node') ? spawnSpec('node', args, ctx.env) : { bin: process.execPath, args, env: { ...process.env, ...ctx.env, ELECTRON_RUN_AS_NODE: '1' } }
  }
  if (bin === 'npm' && first === 'run' && rest[0] && !rest[0].startsWith('-')) return spawnSpec('npm', ['run', ...rest], ctx.env)
  throw new Error('Only `node <career-ops script>` and `npm run <script>` are allowed')
}

function runCommand(spec: SpawnSpec, cwd: string): Promise<string> {
  return new Promise(resolve => {
    execFile(spec.bin, spec.args, { cwd, env: { ...spec.env, PWD: cwd }, timeout: 600_000, maxBuffer: 20 * 1024 * 1024, windowsHide: true, ...(spec.verbatim ? { windowsVerbatimArguments: true } : {}) }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : err.message) : 0
      resolve(cap(`exit ${code}\n${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`))
    })
  })
}

// ————— Web —————

// ponytail: literal-host check; DNS rebinding to a private IP isn't caught (the CLIs' fetch tools don't either).
const PRIVATE_HOST = /^(localhost|.*\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

export function publicUrl(raw: string): URL {
  const u = new URL(raw)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http(s) URLs')
  if (PRIVATE_HOST.test(u.hostname)) throw new Error('Local and private addresses are off limits')
  return u
}

export function htmlToText(html: string): string {
  const ent: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ent[e]!)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

async function webfetch(raw: unknown): Promise<string> {
  let url = publicUrl(String(raw))
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) })
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (next) { url = publicUrl(new URL(next, url).href); continue }
    const body = await res.text()
    const text = /html/i.test(res.headers.get('content-type') ?? '') ? htmlToText(body) : body
    return cap(`HTTP ${res.status} ${url.href}\n\n${text}`)
  }
  throw new Error('Too many redirects')
}

/** DuckDuckGo's HTML endpoint: no key, no account. */
async function websearch(query: unknown): Promise<string> {
  const res = await fetch('https://html.duckduckgo.com/html/', { method: 'POST', body: new URLSearchParams({ q: String(query) }), headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) })
  const html = await res.text()
  const hits = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].slice(0, 10)
  if (!hits.length) return `No results (HTTP ${res.status})`
  return hits.map(([, href, title, snip]) => {
    const target = /[?&]uddg=([^&]+)/.exec(href!)?.[1]
    return `- ${htmlToText(title!)}\n  ${target ? decodeURIComponent(target) : href}\n  ${htmlToText(snip!)}`
  }).join('\n')
}

// ————— Dispatch —————

const SKIP = (p: string) => /(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(p)
/** Glob patterns stay relative and below their base dir. */
function safePattern(p: unknown): string {
  const s = String(p ?? '')
  if (!s || path.isAbsolute(s) || /(^|[\\/])\.\.([\\/]|$)/.test(s)) throw new Error('Use a relative glob pattern without ..')
  return s
}

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const readable = [ctx.root, ...ctx.readDirs]
  switch (name) {
    case 'read': {
      const lines = fs.readFileSync(confine(args.path, readable), 'utf8').split('\n')
      const from = Math.max(1, Number(args.offset) || 1)
      const shown = lines.slice(from - 1, from - 1 + (Number(args.limit) || 2000))
      return cap(shown.map((l, i) => `${from + i}\t${l}`).join('\n') + (from - 1 + shown.length < lines.length ? `\n… ${lines.length} lines total` : ''))
    }
    case 'write': {
      const file = confine(args.path, [ctx.root])
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, String(args.content ?? ''))
      return `Wrote ${path.relative(ctx.root, file)}`
    }
    case 'edit': {
      const file = confine(args.path, [ctx.root])
      const text = fs.readFileSync(file, 'utf8')
      const from = String(args.old_string ?? '')
      const count = from ? text.split(from).length - 1 : 0
      if (!count) throw new Error('old_string not found')
      if (count > 1 && !args.replace_all) throw new Error(`old_string matches ${count} times — add context or set replace_all`)
      fs.writeFileSync(file, args.replace_all ? text.replaceAll(from, String(args.new_string)) : text.replace(from, () => String(args.new_string)))
      return `Edited ${path.relative(ctx.root, file)}`
    }
    case 'list': {
      const dir = confine(args.path ?? '.', readable)
      return fs.readdirSync(dir, { withFileTypes: true }).map(e => (e.isDirectory() ? `${e.name}/` : e.name)).join('\n') || '(empty)'
    }
    case 'glob': {
      const dir = confine(args.path ?? '.', readable)
      return fs.globSync(safePattern(args.pattern), { cwd: dir }).filter(p => !SKIP(p)).slice(0, 500).join('\n') || 'No matches'
    }
    case 'grep': {
      const dir = confine(args.path ?? '.', readable)
      const re = new RegExp(String(args.pattern))
      const out: string[] = []
      for (const rel of fs.globSync(safePattern(args.glob ?? '**/*'), { cwd: dir })) {
        if (SKIP(rel) || out.length >= 200) continue
                let text: string
        try { const file = confine(path.join(dir, rel), readable); const st = fs.statSync(file); if (!st.isFile() || st.size > 1_000_000) continue; text = fs.readFileSync(file, 'utf8') } catch { continue }
        text.split('\n').forEach((line, i) => { if (out.length < 200 && re.test(line)) out.push(`${rel}:${i + 1}: ${line.slice(0, 300)}`) })
      }
      return out.join('\n') || 'No matches'
    }
    case 'bash': return runCommand(commandSpec(String(args.command ?? ''), ctx), ctx.root)
    case 'webfetch': return webfetch(args.url)
    case 'websearch': return websearch(args.query)
    default: throw new Error(`Unknown tool ${name}`)
  }
}
