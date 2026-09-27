// Turns a run's formatted log (electron/runner formatClaudeLine) into renderable items:
// prose blocks, grouped "▸ Tool hint" steps, and the final "✓ done · $x" footer.

export type ToolStep = { name: string; hint: string }
export type TranscriptItem =
  | { kind: 'text'; text: string }
  | { kind: 'tools'; steps: ToolStep[] }
  | { kind: 'footer'; text: string }

export function parseTranscript(log: string): TranscriptItem[] {
  const items: TranscriptItem[] = []
  let prose: string[] = []
  const flush = () => {
    const text = prose.join('\n').trim()
    if (text) items.push({ kind: 'text', text })
    prose = []
  }
  for (const line of log.split('\n')) {
    const tool = /^▸ (\S+)\s*(.*)$/.exec(line)
    const footer = /^✓ (.+)$/.exec(line.trim())
    if (tool) {
      flush()
      const step = { name: tool[1]!, hint: tool[2]!.trim() }
      const last = items.at(-1)
      if (last?.kind === 'tools') last.steps.push(step)
      else items.push({ kind: 'tools', steps: [step] })
    } else if (footer) {
      flush()
      items.push({ kind: 'footer', text: footer[1]! })
    } else if (line.trim() || prose.length) {
      prose.push(line)
    }
  }
  flush()
  return items
}
