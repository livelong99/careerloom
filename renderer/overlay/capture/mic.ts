// Mic → 16 kHz PCM16 frames (plan §3.1). Runs in the overlay/capture renderer; frames go to main over
// `copilotAudio` (send, not invoke). Chromium resamples the device into the 16 kHz context; the pipeline
// still resamples properly if a platform hands back another rate.
import { createPipeline } from './pipeline'
import workletUrl from './worklet.js?worker&url'

export type MicHandle = { stop(): void }

export async function startMic(o: { deviceId?: string | null; onFrame: (pcm16: ArrayBuffer) => void; onEnded?: () => void }): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: o.deviceId ? { exact: o.deviceId } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })
  const ctx = new AudioContext({ sampleRate: 16000 })
  try {
    await ctx.audioWorklet.addModule(workletUrl)
  } catch (err) {
    stream.getTracks().forEach(t => t.stop()); void ctx.close(); throw err
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
