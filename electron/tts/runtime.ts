// Composition root for voice: engines + fallback chain + service + echo gate, and the three `interview*Voice` handlers.
// Wiring (main.ts / preload, owned by integration): construct once, send PCM to the overlay on `careerloom:ttsAudio`, forward `careerloom:ttsPlayback` to onPlayback, route mic frames through gateAudioMsg(…, rt.gate()).
import { createEchoGate, type EchoGate } from '../copilot/echo-gate'
import type { InterviewConfig, KbEvents, TtsAudioMsg, VoiceInfo } from '../kb/types'
import type { TtsEngineId } from '../interviewer/types'
import type { TtsEngine } from './adapter'
import { buildChain, createTtsService, type TtsService } from './service'

export type TtsRuntimeDeps = {
  config: () => InterviewConfig['voice']
  send: (m: TtsAudioMsg) => void
  /** One short user-visible line (toast), e.g. "Kokoro unavailable, using the system voice". */
  notify: (text: string) => void
  engines: Record<TtsEngineId, TtsEngine>
  kokoroInstalled: () => boolean
  hasOpenRouterKey: () => boolean
  install: () => { runId: string } | Promise<{ runId: string }>
  now?: () => number
}
const PREVIEW_TEXT = 'Hello, this is how I will sound in your practice interview.'
const NAMES: Record<TtsEngineId, string> = { system: 'the system voice', kokoro: 'Kokoro', openrouter: 'OpenRouter voice' }

export function createTtsRuntime(d: TtsRuntimeDeps) {
  let gate: EchoGate | null = null
  let gateKey = ''
  const cancelSvc = () => svc.cancel()
  const currentGate = (): EchoGate => {
    const c = d.config(); const key = `${c.echo}|${c.tailMs}`
    if (!gate || key !== gateKey) { gate = createEchoGate({ echo: c.echo, tailMs: c.tailMs, now: d.now, cancel: cancelSvc }); gateKey = key }
    return gate
  }
  const svc: TtsService = createTtsService({
    chain: () => buildChain(d.config().engine, d.engines, { kokoroInstalled: d.kokoroInstalled(), hasOpenRouterKey: d.hasOpenRouterKey() }),
    voice: () => ({ voiceId: d.config().voiceId, speed: d.config().speed, engine: d.config().engine }),
    send: d.send,
    onFallback: (from, to) => d.notify(`${NAMES[from]} is unavailable, using ${NAMES[to]}`),
    onError: () => d.notify('Could not speak that sentence'),
  })
  const handlers = {
    async interviewVoices(): Promise<VoiceInfo[]> { return (await Promise.all((['system', 'kokoro', 'openrouter'] as const).map(id => d.engines[id].voices().catch(() => [])))).flat() },
    async interviewPreviewVoice(engine: TtsEngineId, voiceId: string, speed: number): Promise<void> {
      svc.cancel()
      // preview is one-off: bypass the configured chain/voice but keep fallback to the system voice
      const chain = buildChain(engine, d.engines, { kokoroInstalled: d.kokoroInstalled(), hasOpenRouterKey: d.hasOpenRouterKey() })
      previewSvc(chain, engine, voiceId, speed).speak('preview', PREVIEW_TEXT)
    },
    interviewInstallVoice: async (_engine: 'kokoro') => d.install(),
  }
  const previewSvc = (chain: TtsEngine[], engine: string, voiceId: string, speed: number) => {
    const s = createTtsService({ chain: () => chain, voice: () => ({ voiceId: voiceId || null, speed, engine }), send: d.send, onError: () => d.notify('Could not play the preview') })
    const speak = s.speak.bind(s)
    return { speak: (id: string, t: string) => { speak(id, t); s.end(id) } }
  }
  return {
    handlers,
    gate: currentGate,
    service: svc,
    /** One sentence of an interviewer utterance (feeds the text-echo filter too). */
    speak(utteranceId: string, sentence: string) { currentGate().noteSpoken(sentence); svc.speak(utteranceId, sentence) },
    end: (utteranceId: string) => svc.end(utteranceId),
    cancel: cancelSvc,
    /** Push-to-interrupt hotkey. */
    interrupt: () => currentGate().interrupt(),
    /** `careerloom:ttsPlayback` from the renderer. */
    onPlayback: (e: KbEvents['ttsPlayback']) => currentGate().onPlayback(e.phase, e.utteranceId),
  }
}
export type TtsRuntime = ReturnType<typeof createTtsRuntime>
