import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'careerloom-chat-'))
vi.mock('electron', () => ({
  app: { getPath: () => tmp },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
}))
vi.mock('./integrations/firecrawl', () => ({ firecrawlReady: async () => false }))
vi.mock('./integrations/registry', () => ({ readRegistry: () => ({ firecrawl: { url: '' } }) }))

const started: Array<{ prompt: string; opts: { resume?: string; onExit?: (run: unknown) => void } }> = []
vi.mock('./context', async importOriginal => {
  const real = await importOriginal<typeof import('./context')>()
  return {
    ...real,
    readSettings: () => ({ root: null, runner: 'claude' }),
    startAgentPrompt: (_label: string, _mode: string, prompt: string, _input: string, opts: { onExit?: (run: unknown) => void }) => {
      const id = `run-${started.length}`
      real.runs.set(id, { id } as never)
      started.push({ prompt, opts })
      return { id, status: 'running' }
    },
  }
})

const { chatHandlers, readThread, threadFile, writeThread, capReply, PROMPT_PREFIX, MAX_MESSAGES, MAX_REPLY, MAX_THREADS } = await import('./chat')
const { runs } = await import('./context')

beforeEach(() => {
  fs.rmSync(path.join(tmp, 'threads'), { recursive: true, force: true })
  started.length = 0
  runs.clear()
})

describe('chat threads', () => {
  it('validates ids before touching disk', () => {
    expect(() => threadFile('../../etc/passwd')).toThrow('Invalid thread id')
    expect(() => chatHandlers.getThread!('abc')).toThrow('Invalid thread id')
    expect(threadFile('12345678-1234-1234-1234-123456789abc')).toMatch(/threads[/\\]12345678-1234-1234-1234-123456789abc\.json$/)
  })

  it('rejects empty and oversized messages', async () => {
    await expect(chatHandlers.sendMessage!(null, '   ')).rejects.toThrow('Type a message')
    await expect(chatHandlers.sendMessage!(null, 'x'.repeat(20_001))).rejects.toThrow('limited')
  })

  it('starts the prompt with the fixed literal, never user text', async () => {
    await chatHandlers.sendMessage!(null, '--dangerous flag')
    expect(started[0]!.prompt.startsWith(PROMPT_PREFIX)).toBe(true)
    expect(started[0]!.prompt).toBe('Careerloom request:\n\n--dangerous flag')
  })

  it('persists, finishes, resumes and deletes a thread', async () => {
    const { thread } = await chatHandlers.sendMessage!(null, 'Find platform roles in Berlin') as { thread: { id: string } }
    expect(readThread(thread.id)).toMatchObject({ title: 'Find platform roles in Berlin', status: 'running', runner: 'claude' })
    await expect(chatHandlers.sendMessage!(thread.id, 'again')).rejects.toThrow('still working')
    await expect(async () => chatHandlers.deleteThread!(thread.id)).rejects.toThrow('Stop the agent')

    started[0]!.opts.onExit!({ id: 'run-0', runner: 'claude', status: 'done', sessionId: 'sess-1', log: 'Found 3.\n▸ Read cv.md\nDone.\n✓ done · $0.020\n' })
    const done = readThread(thread.id)
    expect(done).toMatchObject({ status: 'idle', sessionId: 'sess-1', preview: 'Done.' })
    expect(done.messages.map(m => m.role)).toEqual(['user', 'agent'])
    expect(chatHandlers.listThreads!()).toHaveLength(1)

    await chatHandlers.sendMessage!(thread.id, 'More please')
    expect(started[1]!.opts.resume).toBe('sess-1')

    runs.clear() // the app restarted: the orphaned run reads as failed and unblocks the thread
    expect(readThread(thread.id).status).toBe('failed')
    expect(chatHandlers.deleteThread!(thread.id)).toBe(true)
    expect(chatHandlers.listThreads!()).toEqual([])
  })

  it('caps threads, messages and reply size', async () => {
    const reply = capReply('a'.repeat(MAX_REPLY) + 'END')
    expect(reply.length).toBe(MAX_REPLY)
    expect(reply.startsWith('… earlier output trimmed\n')).toBe(true)
    expect(reply.endsWith('END')).toBe(true)
    expect(capReply('short')).toBe('short')

    const id = '12345678-1234-1234-1234-123456789abc'
    const messages = Array.from({ length: MAX_MESSAGES + 5 }, (_, i) => ({ id: String(i), role: 'user' as const, text: `m${i}`, at: i }))
    writeThread({ id, title: 't', createdAt: 0, updatedAt: 0, runner: 'claude', sessionId: null, messages })
    const kept = readThread(id).messages
    expect(kept).toHaveLength(MAX_MESSAGES)
    expect(kept[0]!.text).toBe('m5')

    const dir = path.join(tmp, 'threads')
    for (let i = 1; i < MAX_THREADS; i++) fs.writeFileSync(path.join(dir, `x${i}.json`), '{}')
    await expect(chatHandlers.sendMessage!(null, 'one more')).rejects.toThrow('delete some old ones')
  })
})
