/** "Oct 1, 12:09 AM": a stored moment, never mistaken for "now". */
export const when = (at: number) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const range = (b: { low: number; high: number }) => `${b.low}–${b.high}`
