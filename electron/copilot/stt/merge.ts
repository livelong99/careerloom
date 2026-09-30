// Ported from Open-Cluely (owner's project), adapted for Careerloom: services/assembly-ai/stt-history.js
// Merges consecutive finals from one source that land within a quiet window into one utterance.
import type { SourceId } from '../types'

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

export function mergeText(existing: string, incoming: string): string {
  const cur = existing.trim(), inc = incoming.trim()
  if (!cur) return inc
  if (!inc) return cur
  const cn = norm(cur), inn = norm(inc)
  if (!inn) return cur
  if (!cn) return inc
  if (cn === inn) return inc.length >= cur.length ? inc : cur
  if (inn.includes(cn)) return inc
  if (cn.includes(inn)) return cur
  const cw = cur.split(/\s+/), iw = inc.split(/\s+/)
  for (let n = Math.min(12, cw.length, iw.length); n > 0; n--) {
    if (cw.slice(-n).join(' ').toLowerCase() === iw.slice(0, n).join(' ').toLowerCase()) return [...cw, ...iw.slice(n)].join(' ')
  }
  return `${cur} ${inc}`
}

export function createMerger(windowMs: number, onFlush: (source: SourceId, text: string) => void) {
  const buf: Record<SourceId, { text: string; timer: ReturnType<typeof setTimeout> | null }> = {
    mic: { text: '', timer: null }, system: { text: '', timer: null },
  }
  function flush(source: SourceId) {
    const b = buf[source]
    if (b.timer) clearTimeout(b.timer)
    const text = b.text.trim()
    buf[source] = { text: '', timer: null }
    if (text) onFlush(source, text)
  }
  return {
    add(source: SourceId, text: string) {
      const b = buf[source]
      if (b.timer) clearTimeout(b.timer)
      b.text = mergeText(b.text, text)
      b.timer = setTimeout(() => flush(source), windowMs)
    },
    flushAll() { flush('mic'); flush('system') },
  }
}
