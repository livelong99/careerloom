import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { ChatMessage, ChatThread, ChatThreadSummary, SendOptions } from './contract'
import { readRunHistory, readSettings, runs, startAgentPrompt, str, userFile, type Handler, type RunRecord, type RunSummary } from './context'
import { attachmentDataUrl, removeAttachments, saveAttachments } from './attachments'
import { firecrawlReady } from './integrations/firecrawl'
import { readRegistry } from './integrations/registry'

/** Runners whose runs report a session id that a follow-up message can continue. */
const RESUMABLE = new Set<string>(['claude', 'antigravity', 'opencode', 'zen'])

// Agent chat: free-form threads over claude sessions (resume), persisted in userData/threads.
// Contract: electron/contract.ts + renderer/lib/types.ts (CareerloomBridge).

type Stored = Pick<ChatThread, 'id' | 'title' | 'createdAt' | 'updatedAt' | 'runner' | 'sessionId' | 'messages'>

export const MAX_TEXT = 20_000
export const MAX_THREADS = 500
export const MAX_MESSAGES = 200
export const MAX_REPLY = 64 * 1024
const TRIMMED = '… earlier output trimmed\n'
export const PROMPT_PREFIX = 'Careerloom request:\n\n'
const ID_RE = /^[0-9a-f-]{36}$/

const dir = () => userFile('threads')

export function threadFile(id: unknown): string {
  const value = str(id, 'thread id')
  if (!ID_RE.test(value)) throw new Error('Invalid thread id')
  return path.join(dir(), `${value}.json`)
}

export const buildPrompt = (text: string) => PROMPT_PREFIX + text

export function validateText(text: unknown): string {
  const body = str(text, 'message').trim()
  if (!body) throw new Error('Type a message first')
  if (body.length > MAX_TEXT) throw new Error(`Messages are limited to ${MAX_TEXT.toLocaleString()} characters`)
  return body
}

/** Last prose line of a message (skips "▸ Tool" steps and the "✓ done" footer). */
function previewOf(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !/^[▸✓]/.test(l))
  return (lines.at(-1) ?? '').slice(0, 120)
}

function toThread(stored: Stored): ChatThread {
  // A run that isn't in memory died with a previous app session.
  const messages = stored.messages.map(m => (m.status === 'running' && !runs.has(m.runId ?? '') ? { ...m, status: 'failed' as const } : m))
  const last = messages.at(-1)
  const status = last?.status === 'running' ? 'running' : last?.status === 'failed' || last?.status === 'cancelled' ? 'failed' : 'idle'
  return { ...stored, messages, status, preview: last ? previewOf(last.text) : '' }
}

export function readThread(id: unknown): ChatThread {
  let raw: string
  try { raw = fs.readFileSync(threadFile(id), 'utf8') } catch (err) {
    if (err instanceof Error && err.message === 'Invalid thread id') throw err
    throw new Error('That chat no longer exists')
  }
  return toThread(JSON.parse(raw) as Stored)
}

/** Keep the tail of an agent log, marking the cut. */
export const capReply = (log: string) => (log.length > MAX_REPLY ? TRIMMED + log.slice(-(MAX_REPLY - TRIMMED.length)) : log)

export function writeThread(thread: Stored): void {
  const { id, title, createdAt, updatedAt, runner, sessionId } = thread
  const messages = thread.messages.slice(-MAX_MESSAGES)
  fs.mkdirSync(dir(), { recursive: true })
  fs.writeFileSync(threadFile(id), JSON.stringify({ id, title, createdAt, updatedAt, runner, sessionId, messages }, null, 2))
}

const threadCount = () => { try { return fs.readdirSync(dir()).filter(n => n.endsWith('.json')).length } catch { return 0 } }

export function listThreads(): ChatThreadSummary[] {
  let names: string[]
  try { names = fs.readdirSync(dir()) } catch { return [] }
  return names.filter(n => n.endsWith('.json')).flatMap(n => {
    try {
      const { sessionId: _s, messages: _m, ...summary } = readThread(n.slice(0, -5))
      return [summary]
    } catch { return [] }
  }).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Run ended: store its formatted log as the agent's reply and keep the claude session for resume. */
export function finishRun(threadId: string, run: RunRecord): void {
  const thread = readThread(threadId)
  const messages = thread.messages.map(m => (m.runId === run.id ? { ...m, text: capReply(run.log), status: run.status } : m))
  // claude session / agy conversation / opencode + zen session ids let the next message continue; codex has none.
  const sessionId = RESUMABLE.has(run.runner) ? run.sessionId ?? thread.sessionId : null
  writeThread({ ...thread, messages, sessionId, updatedAt: Date.now() })
}

const SKILL_ID = /^[\w.-]{1,64}$/
export const IMAGE_ONLY_TEXT = 'Look at the attached image(s) and help with what they show.'

/** Skill ids chosen with / for one message: a short list of safe ids, no duplicates. */
export function validateSkills(skills: unknown): string[] {
  if (skills === undefined || skills === null) return []
  if (!Array.isArray(skills) || skills.length > 20 || !skills.every(s => typeof s === 'string' && SKILL_ID.test(s))) throw new Error('Invalid skill selection')
  return [...new Set(skills as string[])]
}

async function sendMessage(threadId: unknown, text: unknown, options?: unknown): Promise<{ thread: ChatThread; run: RunSummary }> {
  const opts = (options ?? {}) as SendOptions
  const skills = validateSkills(opts.skills)
  const hasImages = Array.isArray(opts.attachments) && opts.attachments.length > 0
  const body = hasImages && typeof text === 'string' && !text.trim() ? IMAGE_ONLY_TEXT : validateText(text)
  const now = Date.now()
  if (threadId === null && threadCount() >= MAX_THREADS) throw new Error(`You have ${MAX_THREADS} chats — delete some old ones to start a new one`)
  const base: Stored = threadId === null
    ? { id: randomUUID(), title: body.replace(/\s+/g, ' ').slice(0, 60), createdAt: now, updatedAt: now, runner: '', sessionId: null, messages: [] }
    : readThread(threadId)
  if (toThread(base).status === 'running') throw new Error('The agent is still working in this chat — wait for it or stop it first')
  const env = (await firecrawlReady()) ? { FIRECRAWL_URL: readRegistry().firecrawl.url } : {}
  const runner = readSettings().runner
  const images = saveAttachments(base.id, opts.attachments)
  let run: RunSummary
  try {
    run = startAgentPrompt('Agent chat', 'chat', buildPrompt(body), body.slice(0, 80), {
      // A session id only means something to the runner that made it.
      resume: base.runner === runner ? base.sessionId ?? undefined : undefined,
      env,
      images,
      skills: skills.length ? skills : undefined,
      onExit: r => { try { finishRun(base.id, r) } catch (err) { console.error('chat save failed:', err) } },
    })
  } catch (err) {
    // Nothing started: drop the files written for this message (earlier messages' images stay).
    for (const a of images) fs.rmSync(a.path, { force: true })
    throw err
  }
  // launch() is synchronous and onExit fires on a later tick, so this write always lands first.
  const user: ChatMessage = { id: randomUUID(), role: 'user', text: body, at: now, ...(images.length ? { attachments: images } : {}), ...(skills.length ? { skills } : {}) }
  const agent: ChatMessage = { id: randomUUID(), role: 'agent', text: '', at: now, runId: run.id, status: 'running' }
  const next = { ...base, runner, updatedAt: now, messages: [...base.messages, user, agent] }
  writeThread(next)
  return { thread: toThread(next), run }
}

/** Turn a finished claude run (a skill that stopped to ask something) into a chat on the same
 *  session, so the user can answer it. */
function continueRun(runId: unknown): ChatThread {
  const id = str(runId, 'run id')
  const run = runs.get(id) ?? readRunHistory().find(r => r.id === id)
  if (!run) throw new Error('That run is no longer available')
  if (!RESUMABLE.has(run.runner) || !run.sessionId) throw new Error('Only Claude Code, Antigravity, OpenCode and OpenCode Zen runs can be continued in chat')
  if (run.status === 'running') throw new Error('Wait for the run to finish, then continue it in chat')
  if (threadCount() >= MAX_THREADS) throw new Error(`You have ${MAX_THREADS} chats — delete some old ones to continue this run`)
  const now = Date.now()
  const log = runs.get(id)?.log ?? '' // history runs keep no log
  const thread: Stored = {
    id: randomUUID(), title: run.label.slice(0, 60), createdAt: now, updatedAt: now, runner: run.runner, sessionId: run.sessionId,
    messages: [{ id: randomUUID(), role: 'agent', text: capReply(log || `Continued from “${run.label}”.`), at: run.endedAt ?? now, runId: run.id, status: run.status }],
  }
  writeThread(thread)
  return toThread(thread)
}

function deleteThread(id: unknown): boolean {
  if (readThread(id).status === 'running') throw new Error('Stop the agent before deleting this chat')
  fs.rmSync(threadFile(id), { force: true })
  removeAttachments(str(id, 'thread id'))
  return true
}

export const chatHandlers: Record<string, Handler> = {
  listThreads: () => listThreads(),
  getThread: id => readThread(id),
  sendMessage: (threadId, text, opts) => sendMessage(threadId, text, opts),
  attachmentData: (threadId, attachmentId) => attachmentDataUrl(threadId, attachmentId),
  deleteThread: id => deleteThread(id),
  continueRun: runId => continueRun(runId),
}
