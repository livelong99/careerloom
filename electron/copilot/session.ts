// Capture + STT orchestration (plan §3, WP3 scope only): audio chunks in → one STT adapter per source →
// transcript/health/level events out. Engine, store and overlay attach through `emit` (WP1/2/4).
import type { SttAdapter } from './stt/adapter'
import { createSourceHealth } from './source-health'
import type { AudioChunkMsg, CopilotConfig, CopilotEvents, CopilotState, SourceId, Speaker, StartRequest, StopReason, TranscriptLine } from './types'

/** Owner: WP3 (capture + STT orchestration); WP2/WP4 attach engine and store. State machine idle → armed → listening → stopped. */
export interface SessionController {
  start(req: StartRequest): Promise<{ sessionId: string }>
  stop(reason: StopReason): Promise<void>
  /** Reopen speech recognition for the running session (the overlay's Retry). */
  retry(): Promise<void>
  state(): CopilotState
}

export type SessionDeps = {
  createAdapter: () => SttAdapter
  stt: () => CopilotConfig['stt']
  /** Sources to open. System audio stays off until gate G-B says go. */
  sources?: (req: StartRequest) => SourceId[]
  emit: <K extends keyof CopilotEvents>(ev: K, payload: CopilotEvents[K]) => void
  /** The STT engine closed a turn (silence after speech): lets practice/answers act on the finals collected so far. */
  endOfTurn?: (speaker: Speaker) => void
  now?: () => number
  newId?: () => string
}

const SPEAKER: Record<SourceId, Speaker> = { mic: 'you', system: 'interviewer' }
const LEVEL_EVERY_MS = 66 // ≤ 15/s

export function createSessionController(deps: SessionDeps) {
  const now = deps.now ?? Date.now
  const newId = deps.newId ?? (() => Math.random().toString(36).slice(2, 10))
  let state: CopilotState = 'idle'
  let sessionId: string | null = null, mode: StartRequest['mode'] = 'practice', startedAt: number | null = null
  let active: SourceId[] = []
  const adapters = new Map<SourceId, SttAdapter>()
  const health = new Map<SourceId, ReturnType<typeof createSourceHealth>>()
  const lastLevel = new Map<SourceId, number>()
  let lineSeq = 0 // per session, so ids stay unique across an STT retry

  function publish(next: CopilotState) {
    state = next
    deps.emit('copilotState', { state, mode, sessionId, sources: active, startedAt })
  }

  function wire(source: SourceId, a: SttAdapter) {
    let open: { id: string; t0: number } | null = null
    const line = (text: string, t0: number, t1: number, final: boolean): TranscriptLine => {
      // Epoch ms (session start + the engine's audio clock): lines compare directly with DetectedQuestion.at and SessionSummary times.
      open ??= { id: `${source}-${sessionId}-${lineSeq++}`, t0: (startedAt ?? 0) + t0 }
      const l: TranscriptLine = { id: open.id, speaker: SPEAKER[source], text, final, t0: open.t0, t1: final ? (startedAt ?? 0) + t1 : null }
      if (final) open = null
      return l
    }
    a.on('partial', e => { if (e.text) deps.emit('copilotTranscript', line(e.text, e.t0, e.t1, false)) })
    a.on('final', e => { if (e.text) deps.emit('copilotTranscript', line(e.text, e.t0, e.t1, true)) })
    a.on('endOfTurn', () => deps.endOfTurn?.(SPEAKER[source]))
    a.on('error', e => deps.emit('copilotError', { kind: 'stt', message: e.message ?? 'Speech recognition error', retrying: !!e.retrying }))
  }

  async function teardown() {
    for (const h of health.values()) h.stop()
    await Promise.allSettled([...adapters.values()].map(a => a.stop()))
    adapters.clear(); health.clear(); lastLevel.clear()
  }

  async function openSources() {
    await Promise.all(active.map(async source => {
      const a = deps.createAdapter()
      adapters.set(source, a)
      wire(source, a)
      const h = createSourceHealth(source, hl => deps.emit('copilotHealth', hl), now)
      health.set(source, h)
      const cfg = deps.stt()
      await a.start({ source, language: cfg.language, vocab: cfg.vocab, endSilenceMs: cfg.endSilenceMs })
      h.start()
    }))
  }

  const controller: SessionController & { audio(msg: AudioChunkMsg): void } = {
    state: () => state,

    async start(req) {
      if (state === 'armed' || state === 'listening') throw new Error('A session is already running')
      sessionId = newId(); mode = req.mode; startedAt = now()
      active = deps.sources?.(req) ?? ['mic']
      publish('armed')
      try {
        await openSources()
      } catch (err) {
        await teardown()
        deps.emit('copilotError', { kind: 'stt', message: (err as Error).message, retrying: false })
        publish('stopped')
        throw err
      }
      publish('listening')
      return { sessionId }
    },

    /** High-rate path: call from the `careerloom:copilotAudio` send handler. Ignored unless listening. */
    audio(msg) {
      if (state !== 'listening') return
      adapters.get(msg.source)?.push(msg.pcm16)
      const h = health.get(msg.source)
      if (!h) return
      h.feed(msg.pcm16)
      const t = now()
      if (t - (lastLevel.get(msg.source) ?? 0) >= LEVEL_EVERY_MS) { lastLevel.set(msg.source, t); deps.emit('copilotLevel', { source: msg.source, level: h.level }) }
    },

    async retry() {
      if (state !== 'listening') return
      await teardown()
      try { await openSources() } catch (err) {
        await teardown()
        deps.emit('copilotError', { kind: 'stt', message: (err as Error).message, retrying: false })
      }
    },

    async stop() {
      if (state !== 'armed' && state !== 'listening') return
      await teardown()
      publish('stopped')
    },
  }
  return controller
}
