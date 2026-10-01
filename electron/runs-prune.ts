/** runs.jsonl minus the given run ids (unparseable lines are kept, never silently dropped). Pure. */
export function dropRunLines(text: string, ids: ReadonlySet<string>): { text: string; removed: string[] } {
  const removed: string[] = []
  const kept = text.split('\n').filter(Boolean).filter(l => {
    try {
      const id = (JSON.parse(l) as { id?: unknown }).id
      if (typeof id === 'string' && ids.has(id)) { removed.push(id); return false }
    } catch { /* keep */ }
    return true
  })
  return { text: kept.length ? kept.join('\n') + '\n' : '', removed }
}
