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

const started: Array<{ prompt: string; opts: { resume?: string; images?: Array<{ path: string }>; skills?: string[]; onExit?: (run: unknown) => void } }> = []
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

const { validateSkills, IMAGE_ONLY_TEXT } = await import('./chat')
const { chatHandlers, readThread, threadFile, writeThread, capReply, PROMPT_PREFIX, MAX_MESSAGES, MAX_REPLY, MAX_THREADS } = await import('./chat')
const { runs } = await import('./context')

beforeEach(() => {
  fs.rmSync(path.join(tmp, 'threads'), { recursive: true, force: true })
  fs.rmSync(path.join(tmp, 'attachments'), { recursive: true, force: true })
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

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

describe('chat attachments and skills', () => {
  it('saves images by magic bytes under attachments/<thread>, passes them and the skills to the run, and deletes them with the thread', async () => {
    const { thread } = await chatHandlers.sendMessage!(null, 'what is this?', { attachments: [{ name: '../../evil.txt', data: PNG }], skills: ['resume-tailor', 'resume-tailor'] }) as { thread: { id: string; messages: Array<{ attachments?: Array<{ id: string; name: string; mime: string; path: string }>; skills?: string[] }> } }
    const att = thread.messages[0]!.attachments![0]!
    expect(att).toMatchObject({ name: 'evil.txt', mime: 'image/png' })
    expect(att.path).toBe(path.join(tmp, 'attachments', thread.id, `${att.id}.png`))
    expect(fs.existsSync(att.path)).toBe(true)
    expect(started[0]!.opts.images).toHaveLength(1)
    expect(started[0]!.opts.skills).toEqual(['resume-tailor'])
    expect(thread.messages[0]!.skills).toEqual(['resume-tailor'])
    expect(chatHandlers.attachmentData!(thread.id, att.id)).toMatch(/^data:image\/png;base64,/)

    runs.clear()
    chatHandlers.deleteThread!(thread.id)
    expect(fs.existsSync(path.join(tmp, 'attachments', thread.id))).toBe(false)
  })

  it('rejects a renamed non-image, oversize and too many files before anything starts or is written', async () => {
    const text = new TextEncoder().encode('<svg/>')
    await expect(chatHandlers.sendMessage!(null, 'x', { attachments: [{ name: 'a.png', data: text }] })).rejects.toThrow('not a PNG, JPEG, WebP or GIF')
    await expect(chatHandlers.sendMessage!(null, 'x', { attachments: [{ name: 'a.png', data: new Uint8Array(8 * 1024 * 1024 + 1) }] })).rejects.toThrow('larger than 8 MB')
    const seven = Array.from({ length: 7 }, () => ({ name: 'a.png', data: PNG }))
    await expect(chatHandlers.sendMessage!(null, 'x', { attachments: seven })).rejects.toThrow('Only 6 images')
    expect(started).toHaveLength(0)
    expect(fs.existsSync(path.join(tmp, 'attachments'))).toBe(false)
  })

  it('allows an image-only message', async () => {
    const { thread } = await chatHandlers.sendMessage!(null, '  ', { attachments: [{ name: 'a.png', data: PNG }] }) as { thread: { messages: Array<{ text: string }> } }
    expect(thread.messages[0]!.text).toBe(IMAGE_ONLY_TEXT)
  })

  it('validates skill ids', () => {
    expect(validateSkills(undefined)).toEqual([])
    expect(validateSkills(['a', 'a', 'b.c-d_e'])).toEqual(['a', 'b.c-d_e'])
    expect(() => validateSkills(['../x'])).toThrow('Invalid skill')
    expect(() => validateSkills('x')).toThrow('Invalid skill')
  })
})
