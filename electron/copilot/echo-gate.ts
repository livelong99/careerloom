// Half-duplex gate: idle → speaking → tail → listening; push-to-interrupt; headphone barge-in; text-echo filter (plan §6.5).
export type GatePhase = 'idle' | 'speaking' | 'tail' | 'listening'
export interface EchoGate {
  phase(): GatePhase
  /** True when the mic frame must be dropped (speakers mode only). */
  drops(): boolean
  onPlayback(phase: 'started' | 'ended' | 'cancelled', utteranceId?: string): void
  /** Push-to-interrupt: cancels TTS and starts the tail. False when nothing was speaking. */
  interrupt(): boolean
  /** Headphones only: VAD speech ≥ 300 ms and ≥ 2 words cancels TTS. */
  bargeIn(speech: { speechMs: number; words: number }): boolean
  /** Record a sentence handed to TTS (feeds the text-echo filter). */
  noteSpoken(sentence: string): void
  /** True when an STT final is (≥ 0.8 token overlap) an echo of the last two spoken sentences. */
  isEcho(finalText: string): boolean
}

const BARGE_MS = 300
const BARGE_WORDS = 2
const ECHO_OVERLAP = 0.8
const ECHO_MIN_TOKENS = 4
const tokens = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean)

export function createEchoGate(opts: { echo: 'speakers' | 'headphones'; tailMs: number; now?: () => number; cancel?: () => void }): EchoGate {
  const now = opts.now ?? Date.now
  const active = new Set<string>()
  let everSpoke = false
  let tailUntil = 0
  let spoken: string[][] = []
  const startTail = () => { tailUntil = now() + opts.tailMs }
  const phase = (): GatePhase => active.size > 0 ? 'speaking' : now() < tailUntil ? 'tail' : everSpoke ? 'listening' : 'idle'
  const cancelNow = () => { opts.cancel?.(); active.clear(); startTail(); return true }
  return {
    phase,
    drops: () => opts.echo === 'speakers' && (active.size > 0 || now() < tailUntil),
    onPlayback(p, id = '') {
      if (p === 'started') { everSpoke = true; active.add(id); tailUntil = 0; return }
      if (!active.delete(id)) return // late confirmation (e.g. cancelled after an interrupt): the tail already runs
      if (active.size === 0) startTail()
    },
    interrupt: () => active.size > 0 && cancelNow(),
    bargeIn: s => opts.echo === 'headphones' && active.size > 0 && s.speechMs >= BARGE_MS && s.words >= BARGE_WORDS && cancelNow(),
    noteSpoken(sentence) { spoken = [...spoken, tokens(sentence)].slice(-2) },
    isEcho(finalText) {
      const t = tokens(finalText)
      if (t.length < ECHO_MIN_TOKENS) return false
      const bag = new Set(spoken.flat())
      return t.filter(w => bag.has(w)).length / t.length >= ECHO_OVERLAP
    },
  }
}
