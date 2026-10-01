const DAY = 86_400_000

/** "today, 14:20" / "yesterday" / "14 Sep" / "41 days ago" for the status strip. */
export function researchedLabel(at: number | null, now = Date.now()): string {
  if (!at) return 'never'
  const days = Math.floor((now - at) / DAY)
  const d = new Date(at)
  if (days < 1 && d.getDate() === new Date(now).getDate()) return `today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`
  if (days <= 1) return 'yesterday'
  if (days < 30) return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
  return `${days} days ago`
}
export const ageDays = (at: number | null, now = Date.now()): number => (at ? Math.floor((now - at) / DAY) : 0)
export const usd = (n: number): string => `$${n.toFixed(2)}`
export const clock = (ms: number): string => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

/** Thread classes on a row's left edge: solid = sourced, dashed amber = generated, blue = yours (design §3.1). */
export const THREAD: Record<'sourced' | 'generated' | 'user', string> = {
  sourced: 'before:bg-[var(--accent)]',
  generated: 'before:[background:repeating-linear-gradient(var(--thread)_0_6px,transparent_6px_9px)]',
  user: 'before:bg-[var(--s-premium)]',
}
