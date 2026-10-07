// In-memory BM25 (k1 1.2, b .75 — the FTS5 defaults) with field boosts (plan §6.1).
const K1 = 1.2
const B = 0.75
const STOP = new Set(('a an and are as at be but by do does did for from had has have how i if in into is it its me my of on or our so than that the their them then there these they this to us was we were what when where which who why will with would you your').split(' '))
// Keeps c++, c#, .net, node.js, v1.2; a bare leading dot is dropped (sentence punctuation), ".net" survives.
const TOKEN = /\.?[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)*(?:\+\+|#)?/gu

const stem = (t: string): string => {
  if (!/^[a-z]+$/.test(t)) return t // c++, node.js, .net, v1.2: never touched
  const cut = (s: string, rep = ''): string => (t.length - s.length + rep.length >= 3 ? t.slice(0, t.length - s.length) + rep : t)
  if (t.endsWith('ies')) return cut('ies', 'y')
  if (t.endsWith('ing')) return cut('ing')
  if (t.endsWith('ed')) return cut('ed')
  if (/(?:[sxz]|ch|sh)es$/.test(t)) return cut('es')
  if (t.endsWith('s') && !t.endsWith('ss')) return cut('s')
  return t
}
export const tokenize = (text: string): string[] =>
  (text.toLowerCase().match(TOKEN) ?? []).map(t => (t.startsWith('.') && t !== '.net' ? t.slice(1) : t)).filter(t => !STOP.has(t)).map(stem)

export type Bm25Doc = { id: string; fields: Array<{ text: string; boost: number }> }
export type Bm25Index = { size: number; ids: string[]; len: number[]; avgLen: number; postings: Map<string, Array<[doc: number, tf: number]>> }

export const buildIndex = (docs: Bm25Doc[]): Bm25Index => {
  const postings = new Map<string, Array<[number, number]>>()
  const len: number[] = []
  docs.forEach((d, n) => {
    const tf = new Map<string, number>()
    let total = 0
    for (const f of d.fields) for (const t of tokenize(f.text)) { tf.set(t, (tf.get(t) ?? 0) + f.boost); total += f.boost }
    len.push(total)
    for (const [t, c] of tf) { const p = postings.get(t); if (p) p.push([n, c]); else postings.set(t, [[n, c]]) }
  })
  return { size: docs.length, ids: docs.map(d => d.id), len, avgLen: docs.length ? len.reduce((a, b) => a + b, 0) / docs.length : 0, postings }
}

/** Top-k by score; equal scores keep document order, so results are deterministic. */
export const scoreQuery = (index: Bm25Index, query: string, k: number): Array<{ id: string; score: number }> => {
  const scores = new Map<number, number>()
  for (const t of new Set(tokenize(query))) {
    const p = index.postings.get(t)
    if (!p) continue
    const idf = Math.log(1 + (index.size - p.length + 0.5) / (p.length + 0.5))
    for (const [n, tf] of p) scores.set(n, (scores.get(n) ?? 0) + idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * index.len[n]!) / index.avgLen))))
  }
  return [...scores].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, k).map(([n, score]) => ({ id: index.ids[n]!, score }))
}
