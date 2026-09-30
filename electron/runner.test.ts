import { describe, expect, it } from 'vitest'

import { argsFor, escapeForCmd, formatClaudeLine, promptFor } from './runner'

describe('promptFor (renderer input is untrusted)', () => {
  it('routes a pasted URL or JD straight to the career-ops router', () => {
    expect(promptFor('evaluate', ' https://jobs.example.com/1 ')).toBe('/career-ops https://jobs.example.com/1')
    expect(promptFor('titles', undefined)).toBe('/career-ops titles')
    expect(promptFor('pdf', '12')).toBe('/career-ops pdf 12')
  })

  it('rejects missing, oversized and malformed input', () => {
    expect(() => promptFor('evaluate', '  ')).toThrow(/needs an input/)
    expect(() => promptFor('evaluate', 'x'.repeat(20_001))).toThrow(/too long/)
    expect(() => promptFor('pdf', '12; rm -rf ~')).toThrow(/digits/)
  })
})

describe('argsFor', () => {
  it('keeps claude on an explicit tool allowlist, never bypassing permissions', () => {
    const { bin, args } = argsFor({ runner: 'claude', mode: 'scan' })
    expect(bin).toBe('claude')
    expect(args).toContain('acceptEdits')
    expect(args.join(' ')).not.toMatch(/dangerously|bypassPermissions/)
  })

  it('refuses CLI-only modes on the API runner', () => {
    expect(argsFor({ runner: 'api', mode: 'evaluate', input: 'https://x.io/j' }).args).toEqual(['openrouter-runner.mjs', 'evaluate', 'https://x.io/j'])
    expect(() => argsFor({ runner: 'api', mode: 'pdf', input: '3' })).toThrow(/needs Claude Code/)
  })
})

describe('escapeForCmd', () => {
  it('neutralizes cmd meta characters twice for .cmd shims', () => {
    expect(escapeForCmd('a & calc', true)).toBe('^^^"a^^^ ^^^&^^^ calc^^^"')
    expect(escapeForCmd('x"y', false)).toBe('^"x\\^"y^"')
  })
})

describe('formatClaudeLine', () => {
  it('shows text and tool steps, hides noise, passes non-JSON through', () => {
    const tool = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'cv.md' } }] } })
    expect(formatClaudeLine(tool)).toBe('▸ Read cv.md')
    expect(formatClaudeLine(JSON.stringify({ type: 'system', subtype: 'init' }))).toBeNull()
    expect(formatClaudeLine(JSON.stringify({ type: 'result', total_cost_usd: 0.1234 }))).toBe('\n✓ done · $0.123')
    expect(formatClaudeLine('plain stderr-ish line')).toBe('plain stderr-ish line')
  })
})

describe('model selection', () => {
  it('passes a valid model to each CLI and drops unsafe ids', async () => {
    const { argsForPrompt } = await import('./runner')
    expect(argsForPrompt('claude', '/career-ops x', { model: 'opus' }).args).toEqual(expect.arrayContaining(['--model', 'opus']))
    expect(argsForPrompt('codex', '/career-ops x', { model: 'gpt-5-codex' }).args.slice(0, 5)).toEqual(['exec', '--sandbox', 'workspace-write', '--model', 'gpt-5-codex'])
    expect(argsForPrompt('antigravity', '/career-ops x', { model: 'gemini-3.1-pro-high' }).args).toEqual(['-p', '/career-ops x', '--output-format', 'stream-json', '--model', 'gemini-3.1-pro-high'])
    // without Careerloom's project (no workspace), agy never gets skip-permissions
    expect(argsForPrompt('antigravity', '/career-ops x').args).not.toContain('--dangerously-skip-permissions')
    // text-only (ATS analysis): no file/shell tools; other modes are untouched
    const text = argsForPrompt('claude', 'Careerloom x', { textOnly: true, model: 'haiku', addDirs: ['/skills'], systemAppend: 'note' }).args
    expect(text).toEqual(['-p', 'Careerloom x', '--output-format', 'stream-json', '--verbose', '--model', 'haiku', '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch', 'WebFetch'])
    expect(argsForPrompt('claude', 'Careerloom x', { textOnly: true, resume: 'abcdefgh-1234' }).args).toEqual(expect.arrayContaining(['--resume', 'abcdefgh-1234']))
    expect(argsForPrompt('claude', 'x').args).toContain('Bash(node:*)')
    expect(argsForPrompt('codex', 'x', { textOnly: true }).args.slice(0, 3)).toEqual(['exec', '--sandbox', 'read-only'])
    expect(argsForPrompt('codex', 'x').args.slice(0, 3)).toEqual(['exec', '--sandbox', 'workspace-write'])
    expect(argsForPrompt('claude', '/career-ops x', { model: '--dangerously-skip-permissions' }).args).not.toContain('--dangerously-skip-permissions')
  })
})
