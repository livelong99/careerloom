// The one voice runtime of the app (electron main): engines, echo gate and the `Speaker` the interviewer talks through.
import { broadcast, readSecret } from '../context'
import { createSplitter } from '../tts/split'
import type { Speaker } from '../interviewer/runner'
import type { InterviewPlan } from '../interviewer/types'
import { createKokoroEngine } from '../tts/kokoro'
import { findKokoro, installKokoro } from '../tts/install'
import { createOpenRouterEngine } from '../tts/openrouter'
import { createSystemEngine } from '../tts/say'
import { createTtsRuntime, type TtsRuntime } from '../tts/runtime'
import { secretName } from '../settings/keys'
import { readInterviewConfig } from './config'
import type { InterviewConfig, KbEvents } from './types'

/** The running interview's voice and echo choices win over interview.json until it ends. */
let session: Pick<InterviewPlan, 'voice' | 'echo'> | null = null
const voiceConfig = (): InterviewConfig['voice'] => {
  const v = readInterviewConfig().voice
  return session ? { ...v, engine: session.voice.engine, voiceId: session.voice.voiceId, speed: session.voice.speed, echo: session.echo } : v
}

let rt: TtsRuntime | null = null
export function ttsRuntime(): TtsRuntime {
  return (rt ??= createTtsRuntime({
    config: voiceConfig,
    send: m => broadcast('careerloom:ttsAudio', m),
    notify: text => broadcast('careerloom:interviewerNotice', { text }),
    engines: { system: createSystemEngine(), kokoro: createKokoroEngine(), openrouter: createOpenRouterEngine({ getKey: () => readSecret(secretName('openrouter')) }) },
    kokoroInstalled: () => findKokoro() !== null,
    hasOpenRouterKey: () => readSecret(secretName('openrouter')) !== null,
    install: installKokoro,
  }))
}
export const voiceHandlers = () => ttsRuntime().handlers

const waiting = new Map<string, () => void>()
/** `careerloom:ttsPlayback` from the overlay: feeds the echo gate and releases whoever waits for that utterance to finish. */
export function onTtsPlayback(e: KbEvents['ttsPlayback']): void {
  if (process.env.CL_KB_E2E === '1') console.log('[kb-e2e] ttsPlayback', e.phase, e.utteranceId) // QA evidence (unpackaged runs only use the flag)
  ttsRuntime().onPlayback(e)
  if (e.phase !== 'started') waiting.get(e.utteranceId)?.()
}

/** Resolves when the audio ended (or was cancelled); a timeout covers a window that never plays (no overlay, no engine). */
const SAY_TIMEOUT_BASE_MS = 8_000
const SAY_TIMEOUT_PER_CHAR_MS = 120
let seq = 0
export function interviewSpeaker(plan: InterviewPlan): Speaker {
  session = { voice: plan.voice, echo: plan.echo }
  const rtm = ttsRuntime()
  const pending = new Set<string>()
  const release = (id: string): void => { waiting.get(id)?.(); waiting.delete(id); pending.delete(id) }
  return {
    say: (text, questionId) => new Promise<void>(resolve => {
      const id = `${questionId}#${++seq}`
      const timer = setTimeout(() => release(id), SAY_TIMEOUT_BASE_MS + text.length * SAY_TIMEOUT_PER_CHAR_MS)
      pending.add(id)
      waiting.set(id, () => { clearTimeout(timer); resolve() })
      const split = createSplitter()
      for (const s of [...split.push(text), ...split.flush()]) rtm.speak(id, s)
      rtm.end(id)
    }),
    cancel: () => { rtm.cancel(); for (const id of [...pending]) release(id) },
  }
}
/** Speakers mode pauses the mic while the interviewer talks (the badge in the overlay). */
export const micPausesWhileSpeaking = (): boolean => voiceConfig().echo === 'speakers'
/** The interview is over: back to the configured voice. */
export const endInterviewVoice = (): void => { session = null }
