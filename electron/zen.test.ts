import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RunRecord } from './context'
import { opencodeBrowserConfig, opencodeConfig, zenModelsFrom } from './opencode'
import { argsForPrompt, formatOpencodeLine, opencodeResultOk, opencodeSessionId, opencodeUsage } from './runner'
import { runZen, zenError, zenPrompt } from './zen-agent'
import { commandSpec, confine, htmlToText, publicUrl, runTool, splitCommand } from './zen-tools'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cl-zen-'))

describe('opencode CLI runner', () => {
  it('routes /career-ops prompts through its command and plain prompts as messages', () => {
    expect(argsForPrompt('opencode', '/career-ops evaluate https://x.io/j', { model: 'opencode/big-pickle', resume: 'ses_abcdef123' }).args)
      .toEqual(['run', '--format', 'json', '--command', 'career-ops', '--session', 'ses_abcdef123', '--model', 'opencode/big-pickle', 'evaluate https://x.io/j'])
    expect(argsForPrompt('opencode', 'Read x.md', { model: '--evil' }).args).toEqual(['run', '--format', 'json', 'Read x.md'])
  })

  it('formats and totals the JSON event stream', () => {
    const step = (cost: number) => JSON.stringify({ type: 'step_finish', sessionID: 'ses_abcdef123', part: { cost, tokens: { input: 100, output: 10, reasoning: 5, cache: { read: 50, write: 0 } } } })
    const once = opencodeUsage(step(0.01), null)
    expect(opencodeUsage(step(0.02), once)).toEqual({ costUsd: 0.03, inputTokens: 300, outputTokens: 30, turns: 2, durationMs: null })
    expect(opencodeUsage('{"type":"text"}', once)).toBeNull()
    expect(opencodeSessionId(step(0))).toBe('ses_abcdef123')
    expect(formatOpencodeLine(JSON.stringify({ type: 'tool_use', part: { tool: 'bash', state: { status: 'completed', input: { command: 'node merge.mjs' } } } }))).toBe('▸ bash node merge.mjs\n')
    expect(formatOpencodeLine(JSON.stringify({ type: 'text', part: { text: '{"jobs":[]}' } }))).toBe('{"jobs":[]}\n')
    expect(opencodeResultOk(JSON.stringify({ type: 'error', error: { name: 'APIError' } }))).toBe(false)
    expect(formatOpencodeLine(JSON.stringify({ type: 'error', error: { data: { message: "OpenCode's free tier can only be used from within OpenCode" } } }))).toMatch(/add an OpenCode Zen API key/)
    expect(opencodeResultOk(step(0))).toBeNull()
  })

  it('grants only folder edits, career-ops scripts and web; browser runs get only read-only MCP tools', () => {
    const cfg = JSON.parse(opencodeConfig(['/skills/a/'])) as { permission: { bash: Record<string, string>; external_directory: Record<string, string> } }
    expect(cfg.permission.bash).toEqual({ '*': 'deny', 'node *': 'allow', 'npm run *': 'allow' })
    expect(cfg.permission.external_directory).toEqual({ '/skills/a/**': 'allow' })
    const browser = JSON.parse(opencodeBrowserConfig('clbrowser', { command: 'npx', args: ['-y', 'pw'] }, ['browser_snapshot'])) as { mcp: Record<string, { command: string[] }>; permission: Record<string, string> }
    expect(browser.mcp.clbrowser!.command).toEqual(['npx', '-y', 'pw'])
    expect(browser.permission).toEqual({ '*': 'deny', clbrowser_browser_snapshot: 'allow' })
  })
})

describe('zen tools', () => {
  it('keeps paths inside the folder (skills read-only) and off .git / .env', () => {
    const root = tmp()
    const skills = tmp()
    expect(confine('reports/a.md', [root])).toBe(path.join(fs.realpathSync(root), 'reports', 'a.md'))
    expect(() => confine('../x', [root])).toThrow(/outside/)
    expect(() => confine('/etc/passwd', [root])).toThrow(/outside/)
    expect(() => confine('.git/config', [root])).toThrow(/off limits/)
    expect(() => confine('.env', [root])).toThrow(/off limits/)
    expect(confine(path.join(skills, 'SKILL.md'), [root, skills])).toContain('SKILL.md')
    fs.symlinkSync(os.tmpdir(), path.join(root, 'out'))
    expect(() => confine('out/x', [root])).toThrow(/outside/)
  })

  it('runs only career-ops node scripts and npm run, without a shell', () => {
    const ctx = { root: tmp(), readDirs: [], env: {} }
    expect(splitCommand(`node merge-tracker.mjs --url "https://x.io/?a=1&b=2" 'two words'`)).toEqual(['node', 'merge-tracker.mjs', '--url', 'https://x.io/?a=1&b=2', 'two words'])
    expect(splitCommand('node a.mjs && rm -rf ~')).toBeNull()
    expect(splitCommand('node a.mjs | tee x')).toBeNull()
    expect(splitCommand('echo $(id)')).toBeNull()
    expect(commandSpec('node merge-tracker.mjs', ctx).args.join(' ')).toContain('merge-tracker.mjs')
    expect(() => commandSpec('node -e "1"', ctx)).toThrow(/Only/)
    expect(() => commandSpec('node ../evil.mjs', ctx)).toThrow(/outside/)
    expect(() => commandSpec('rm -rf .', ctx)).toThrow(/Only/)
    expect(() => commandSpec('npm install evil', ctx)).toThrow(/Only/)
  })

  it('edits need a unique match; glob stays below the folder', async () => {
    const root = tmp()
    const ctx = { root, readDirs: [], env: {} }
    await runTool('write', { path: 'a/b.md', content: 'x y x' }, ctx)
    await expect(runTool('edit', { path: 'a/b.md', old_string: 'x', new_string: 'z' }, ctx)).rejects.toThrow(/2 times/)
    await runTool('edit', { path: 'a/b.md', old_string: 'y', new_string: 'Y' }, ctx)
    expect(fs.readFileSync(path.join(root, 'a/b.md'), 'utf8')).toBe('x Y x')
    expect(await runTool('grep', { pattern: 'Y' }, ctx)).toContain('b.md:1:')
    await expect(runTool('glob', { pattern: '../*' }, ctx)).rejects.toThrow(/relative/)
  })

  it('blocks local addresses and flattens HTML', () => {
    expect(() => publicUrl('http://127.0.0.1:3002/')).toThrow(/private/)
    expect(() => publicUrl('http://localhost/')).toThrow(/private/)
    expect(() => publicUrl('file:///etc/passwd')).toThrow(/http/)
    expect(publicUrl('https://jobs.example.com/1').hostname).toBe('jobs.example.com')
    expect(htmlToText('<head><title>t</title></head><script>x()</script><h1>Role</h1><p>A &amp; B</p>')).toBe('Role\nA & B')
  })
})

describe('zen models', () => {
  it('keeps tool-calling chat/completions models from the catalogue, free and preferred first', () => {
    const catalogue = { opencode: { npm: '@ai-sdk/openai-compatible', models: {
      'kimi-k3': { id: 'kimi-k3', name: 'Kimi K3', tool_call: true, cost: { input: 0.6 } },
      'space-bunny-free': { id: 'space-bunny-free', name: 'Space Bunny', tool_call: true, cost: { input: 0 } },
      'big-pickle': { id: 'big-pickle', name: 'Big Pickle', tool_call: true, cost: { input: 0 } },
      'gpt-6': { id: 'gpt-6', tool_call: true, cost: { input: 1 }, provider: { npm: '@ai-sdk/openai' } },
      'old-free': { id: 'old-free', tool_call: true, cost: { input: 0 }, status: 'deprecated' },
      'embed-free': { id: 'embed-free', tool_call: false, cost: { input: 0 } },
    } } }
    expect(zenModelsFrom(catalogue).map(m => m.label)).toEqual(['Big Pickle (free)', 'Space Bunny (free)', 'Kimi K3'])
    expect(zenModelsFrom(null)).toEqual([])
  })

  it('turns Zen errors into the fix the user can make, keeping the server message', () => {
    const body = (message: string) => JSON.stringify({ type: 'error', error: { type: 'X', message } })
    expect(zenError(400, '{"error":{"message":"Error from provider (Console): Upstream request failed: Model is unavailable."}}', 'big-pickle')).toMatch(/Model is unavailable.*pick another model/)
    expect(zenError(403, body("OpenCode's free tier can only be used from within OpenCode"), 'big-pickle')).toMatch(/free tier.*use the OpenCode CLI runner/)
    expect(zenError(403, body('This model is not available in your country.'), 'm')).toBe('OpenCode Zen (HTTP 403, m): This model is not available in your country.')
    expect(zenError(401, body('Invalid API key.'), 'm')).toMatch(/Invalid API key.*check the OpenCode Zen key/)
    expect(zenError(402, 'insufficient balance', 'm')).toMatch(/add credits/)
  })
})

describe('zen agent loop', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('inlines the career-ops skill for /career-ops prompts', () => {
    const root = tmp()
    fs.mkdirSync(path.join(root, '.opencode/skills/career-ops'), { recursive: true })
    fs.writeFileSync(path.join(root, '.opencode/skills/career-ops/SKILL.md'), '# career-ops -- Router')
    expect(zenPrompt(root, '/career-ops evaluate https://x.io')).toContain('# career-ops -- Router')
    expect(zenPrompt(root, '/career-ops evaluate https://x.io')).toContain('Run career-ops for: evaluate https://x.io')
    expect(zenPrompt(root, 'Read x.md')).toBe('Read x.md')
  })

  it('runs tool calls until the model answers, logs text, totals usage and saves the session', async () => {
    const root = tmp()
    const sessionDir = tmp()
    const replies = [
      { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'write', arguments: '{"path":"reports/001.md","content":"# Report"}' } }] } }], usage: { prompt_tokens: 100, completion_tokens: 20 } },
      { choices: [{ message: { content: '```json\n{"status":"completed","score":4.2}\n```' } }], usage: { prompt_tokens: 150, completion_tokens: 30, cost: 0 } },
    ]
    const bodies: Array<{ model: string; messages: Array<{ role: string }> }> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      expect(init.headers.authorization).toBe('Bearer zk-test')
      bodies.push(JSON.parse(init.body))
      return new Response(JSON.stringify(replies.shift()), { status: 200 })
    }))
    const run = { id: 'r', status: 'running', startedAt: Date.now(), usage: null, log: '' } as unknown as RunRecord
    let log = ''
    await runZen({ prompt: 'Evaluate', model: 'big-pickle', key: 'zk-test', tools: { root, readDirs: [], env: {} }, system: 'sys', sessionDir }, t => { log += t }, run)

    expect(fs.readFileSync(path.join(root, 'reports/001.md'), 'utf8')).toBe('# Report')
    expect(log).toContain('▸ write reports/001.md')
    expect(log).toContain('"score":4.2')
    expect(run.usage).toMatchObject({ inputTokens: 250, outputTokens: 50, turns: 2, costUsd: 0 })
    expect(bodies[1]!.messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'tool'])
    const saved = JSON.parse(fs.readFileSync(path.join(sessionDir, `${run.sessionId}.json`), 'utf8')) as unknown[]
    expect(saved).toHaveLength(5)
  })

  it('browser runs expose only allowed MCP tools and save no session', async () => {
    const dir = tmp()
    const server = path.join(dir, 'fake-mcp.cjs')
    fs.writeFileSync(server, `
      const rl = require('readline').createInterface({ input: process.stdin })
      const send = m => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n')
      rl.on('line', line => {
        const m = JSON.parse(line)
        if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: '2025-06-18', capabilities: {} } })
        if (m.method === 'tools/list') send({ id: m.id, result: { tools: [{ name: 'browser_snapshot', inputSchema: { type: 'object' } }, { name: 'browser_click', inputSchema: { type: 'object' } }] } })
        if (m.method === 'tools/call') send({ id: m.id, result: { content: [{ type: 'text', text: 'snapshot of ' + m.params.name }] } })
      })`)
    const replies = [
      { choices: [{ message: { content: null, tool_calls: [
        { id: 'a', type: 'function', function: { name: 'browser_click', arguments: '{}' } },
        { id: 'b', type: 'function', function: { name: 'browser_snapshot', arguments: '{}' } },
      ] } }] },
      { choices: [{ message: { content: '{"jobs":[]}' } }] },
    ]
    const bodies: Array<{ tools?: Array<{ function: { name: string } }>; messages: Array<{ role: string; content: string | null }> }> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body))
      return new Response(JSON.stringify(replies.shift()), { status: 200 })
    }))
    const run = { id: 'r', status: 'running', startedAt: Date.now(), usage: null, log: '' } as unknown as RunRecord
    const sessionDir = path.join(dir, 'sessions')
    await runZen({ prompt: 'List jobs', model: 'm', key: 'k', tools: { mcp: { command: 'node', args: [server] }, cwd: dir, allow: ['browser_snapshot'] }, system: 's', sessionDir }, () => {}, run)

    expect(bodies[0]!.tools!.map(t => t.function.name)).toEqual(['browser_snapshot'])
    const toolOut = bodies[1]!.messages.filter(m => m.role === 'tool').map(m => m.content)
    expect(toolOut).toEqual(['Error: browser_click is not allowed', 'snapshot of browser_snapshot'])
    expect(fs.existsSync(sessionDir)).toBe(false)
  })
})
