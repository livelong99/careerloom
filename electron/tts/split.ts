// Sentence splitter for streamed LLM tokens (plan §6.6): boundary on . ! ? … and newline, min 20 chars, abbreviation guard.
export type SentenceSplitter = { push(token: string): string[]; flush(): string[] }

const MIN_CHARS = 20
const TERM = '.!?…'
const CLOSERS = '"\'”’)]'
const has = (set: string, c: string | undefined) => c !== undefined && set.includes(c)
const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'inc', 'ltd', 'co', 'approx', 'fig', 'no', 'st', 'vol', 'dept'])

/** True when the '.' ending `head` belongs to an abbreviation or initial rather than a sentence. */
function isAbbreviation(head: string): boolean {
  const w = /(\S+)$/.exec(head)?.[1].replace(/^[("'“‘[]+/, '') ?? ''
  return ABBR.has(w.toLowerCase()) || w.includes('.') || /^[A-Za-z]$/.test(w)
}

export function createSplitter(): SentenceSplitter {
  let buf = ''
  const cut = (): string[] => {
    const out: string[] = []
    let start = 0
    for (let i = 0; i < buf.length; i++) {
      let end = -1
      if (buf[i] === '\n') end = i + 1
      else if (has(TERM, buf[i])) {
        let j = i
        const hEnd = i
        while (has(TERM, buf[j + 1])) j++
        const run = buf.slice(i, j + 1)
        while (has(CLOSERS, buf[j + 1])) j++
        i = j
        const sp = /^\s+/.exec(buf.slice(j + 1))
        if (!sp) { if (j + 1 >= buf.length) break; continue } // "3.5": not a boundary; at buffer end: wait for the next token
        const next = buf[j + 1 + sp[0].length]
        if (next === undefined) break // whitespace but nothing after yet: unconfirmed
        const multi = run.length > 1 || run === '…'
        if (multi ? !/[A-Z]/.test(next) : run === '.' && (/[a-z0-9]/.test(next) || isAbbreviation(buf.slice(start, hEnd))) ) continue
        end = j + 1
      }
      if (end < 0) continue
      const s = buf.slice(start, end).trim()
      if (s.length >= MIN_CHARS) { out.push(s); start = end }
    }
    buf = buf.slice(start).replace(/^\s+/, '')
    return out
  }
  return {
    push(token) { buf += token; return cut() },
    flush() { const s = buf.trim(); buf = ''; return s ? [s] : [] },
  }
}
