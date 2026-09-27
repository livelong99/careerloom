import { describe, expect, it } from 'vitest'

import { parseTranscript } from './transcript'
import { toolFamily } from './ToolSteps'

describe('parseTranscript', () => {
  it('splits prose, grouped tool steps and the done footer', () => {
    const log = 'Looking at your CV.\n▸ Read cv.md\n\n▸ Bash node scan.mjs --all\nFound **3** roles:\n- Stripe\n\n✓ done · $0.020\n'
    expect(parseTranscript(log)).toEqual([
      { kind: 'text', text: 'Looking at your CV.' },
      { kind: 'tools', steps: [{ name: 'Read', hint: 'cv.md' }, { name: 'Bash', hint: 'node scan.mjs --all' }] },
      { kind: 'text', text: 'Found **3** roles:\n- Stripe' },
      { kind: 'footer', text: 'done · $0.020' },
    ])
  })

  it('handles an empty log and tools without hints', () => {
    expect(parseTranscript('')).toEqual([])
    expect(parseTranscript('▸ TodoWrite')).toEqual([{ kind: 'tools', steps: [{ name: 'TodoWrite', hint: '' }] }])
  })
})

describe('toolFamily', () => {
  it('maps tool names to categories', () => {
    expect(['Read', 'Edit', 'Grep', 'Bash', 'WebFetch', 'mcp__firecrawl__scrape', 'Nope'].map(toolFamily))
      .toEqual(['read', 'edit', 'search', 'shell', 'web', 'web', 'other'])
  })
})
