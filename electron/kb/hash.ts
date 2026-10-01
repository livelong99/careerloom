// Stable ids and cache keys (plan §5).
import { createHash } from 'node:crypto'

const digest = (algo: 'sha1' | 'sha256', s: string): string => createHash(algo).update(s).digest('hex')
/** Lowercase, punctuation → space, collapsed: "Tell me, about X!" and "tell me about x" are one question. */
export const normalise = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim()
const stable = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x)

export const itemId = (text: string): string => digest('sha1', normalise(text))
/** Changes iff the structured posting, the gaps, the role or the company change (key order never matters). */
export const inputHash = (p: { jd: unknown; gaps: unknown; role: string; company: string }): string => digest('sha1', stable([p.jd, p.gaps, p.role, p.company]))
export const contentHash = (text: string): string => digest('sha256', text)
export const queryKey = (backend: string, query: string): string => digest('sha1', `${backend}\u0000${normalise(query)}`)
/** Fragment and trailing slash never make a different page. */
export const pageKey = (url: string): string => digest('sha1', url.trim().replace(/#.*$/, '').replace(/\/+$/, ''))
/** The job id is a URL, so its KB folder is named by this hash (store, research state and exports all use it). */
export const kbJobDir = (jobId: string): string => digest('sha1', jobId).slice(0, 24)
