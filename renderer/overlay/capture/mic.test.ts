// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { describeMicError, startMic } from './mic'

const domErr = (name: string, message = name) => Object.assign(new Error(message), { name })

function stubAudio(gum: (c: MediaStreamConstraints) => Promise<MediaStream>, ctxState: AudioContextState = 'running') {
  const track = { onended: null as null | (() => void), stop: vi.fn() }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream
  const resume = vi.fn(async () => undefined)
  class Ctx {
    sampleRate = 16000; state = ctxState; destination = {}
    audioWorklet = { addModule: vi.fn(async () => undefined) }
    createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() } }
    createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } }
    resume = resume
    close = vi.fn(async () => undefined)
  }
  class Node { port = { onmessage: null }; connect = vi.fn(); disconnect = vi.fn() }
  vi.stubGlobal('AudioContext', Ctx); vi.stubGlobal('AudioWorkletNode', Node)
  const getUserMedia = vi.fn(gum)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  return { getUserMedia, track, stream, resume }
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe('startMic', () => {
  it('falls back to the system default when the saved device is gone, and says so', async () => {
    const s = stubAudio(async c => { if ((c.audio as MediaTrackConstraints).deviceId) throw domErr('OverconstrainedError'); return s.stream })
    const onFallback = vi.fn()
    await startMic({ deviceId: 'unplugged', onFrame: () => undefined, onFallback })
    expect(s.getUserMedia).toHaveBeenCalledTimes(2)
    expect((s.getUserMedia.mock.calls[1]![0].audio as MediaTrackConstraints).deviceId).toBeUndefined()
    expect(onFallback).toHaveBeenCalledTimes(1)
  })

  it('does not retry on a permission denial: that would just prompt twice', async () => {
    const s = stubAudio(async () => { throw domErr('NotAllowedError') })
    await expect(startMic({ deviceId: 'x', onFrame: () => undefined })).rejects.toThrow(/blocked/i)
    expect(s.getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('resumes a suspended AudioContext (otherwise the worklet never runs and no frame arrives)', async () => {
    const s = stubAudio(async () => s.stream, 'suspended')
    await startMic({ onFrame: () => undefined })
    expect(s.resume).toHaveBeenCalled()
  })

  it('reports an unplugged device through onEnded', async () => {
    const s = stubAudio(async () => s.stream)
    const onEnded = vi.fn()
    await startMic({ onFrame: () => undefined, onEnded })
    s.track.onended?.()
    expect(onEnded).toHaveBeenCalledTimes(1)
  })
})

describe('describeMicError', () => {
  it.each([
    ['NotAllowedError', /blocked.*System Settings/i],
    ['NotFoundError', /no microphone/i],
    ['NotReadableError', /in use|another app/i],
    ['OverconstrainedError', /not available/i],
    ['AbortError', /could not start/i],
  ])('%s → a sentence a person can act on', (name, re) => expect(describeMicError(domErr(name))).toMatch(re))
  it('keeps unknown errors readable', () => expect(describeMicError(new Error('boom'))).toContain('boom'))
})
