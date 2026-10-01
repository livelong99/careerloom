// Mic → 16 kHz PCM16 frames (plan §3.1). Runs in the overlay/capture renderer; frames go to main over
// `copilotAudio` (send, not invoke). Chromium resamples the device into the 16 kHz context; the pipeline
// still resamples properly if a platform hands back another rate.
import { createPipeline } from './pipeline'
import workletUrl from './worklet.js?worker&url'

export type MicHandle = { stop(): void }

/** One sentence per failure a person can act on (getUserMedia rejects with a bare DOMException name). */
export function describeMicError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name
  switch (name) {
    case 'NotAllowedError': case 'SecurityError': return 'Microphone access is blocked: allow Careerloom in System Settings → Privacy & Security → Microphone.'
    case 'NotFoundError': return 'No microphone found. Plug one in or pick another input in Settings → Copilot → Audio.'
    case 'NotReadableError': return 'The microphone is in use by another app or could not be opened. Close the other app and try again.'
    case 'OverconstrainedError': return 'The selected microphone is not available. Pick another input in Settings → Copilot → Audio.'
    case 'AbortError': return 'The microphone could not start. Try again.'
    default: return e instanceof Error && e.message ? `Microphone failed: ${e.message}` : 'Microphone failed to start.'
  }
}

const GONE = new Set(['OverconstrainedError', 'NotFoundError'])
const audio = (deviceId?: string | null): MediaTrackConstraints => ({ deviceId: deviceId ? { exact: deviceId } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true })

/** `onFallback` fires when the saved device is gone and the system default was used instead; `onEnded` when the device disappears mid-run (unplugged, default changed). */
export async function startMic(o: { deviceId?: string | null; onFrame: (pcm16: ArrayBuffer) => void; onEnded?: () => void; onFallback?: () => void }): Promise<MicHandle> {
  let stream: MediaStream
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: audio(o.deviceId) })
    } catch (err) {
      if (!o.deviceId || !GONE.has((err as { name?: string }).name ?? '')) throw err
      stream = await navigator.mediaDevices.getUserMedia({ audio: audio() }) // the saved device was unplugged or its id changed
      o.onFallback?.()
    }
  } catch (err) { throw new Error(describeMicError(err), { cause: err }) } // cause keeps the DOMException name for callers that branch on it
  const ctx = new AudioContext({ sampleRate: 16000 })
  try {
    await ctx.audioWorklet.addModule(workletUrl)
    if (ctx.state !== 'running') await ctx.resume() // a suspended context never runs the worklet: no frames, no error
  } catch (err) {
    stream.getTracks().forEach(t => t.stop()); void ctx.close(); throw new Error(`Audio capture could not start (${err instanceof Error ? err.message : String(err)})`)
  }
  const pipeline = createPipeline({ inRate: ctx.sampleRate, onFrame: o.onFrame })
  const src = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'pcm-capture-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
  const mute = ctx.createGain(); mute.gain.value = 0 // keeps the graph pulling without playing the mic back
  node.port.onmessage = e => pipeline.write(e.data instanceof Float32Array ? e.data : new Float32Array(e.data))
  src.connect(node); node.connect(mute); mute.connect(ctx.destination)
  const track = stream.getAudioTracks()[0]
  if (track) track.onended = () => o.onEnded?.()
  return {
    stop() {
      node.port.onmessage = null
      for (const n of [src, node, mute]) { try { n.disconnect() } catch { /* already gone */ } }
      stream.getTracks().forEach(t => t.stop())
      void ctx.close()
    },
  }
}
