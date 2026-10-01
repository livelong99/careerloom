// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createEchoGate } from './echo-gate'

const mk = (echo: 'speakers' | 'headphones' = 'speakers', tailMs = 350) => {
  let t = 1000
  const cancel = vi.fn()
  const gate = createEchoGate({ echo, tailMs, now: () => t, cancel })
  return { gate, cancel, tick: (ms: number) => { t += ms } }
}

describe('echo gate (speakers, half-duplex)', () => {
  it('idle drops nothing; speaking drops mic frames; tail keeps dropping; then listens', () => {
    const { gate, tick } = mk()
    expect(gate.phase()).toBe('idle'); expect(gate.drops()).toBe(false)
    gate.onPlayback('started', 'u1')
    expect(gate.phase()).toBe('speaking'); expect(gate.drops()).toBe(true)
    tick(5000)
    expect(gate.drops()).toBe(true) // still speaking, no timeout
    gate.onPlayback('ended', 'u1')
    expect(gate.phase()).toBe('tail'); expect(gate.drops()).toBe(true)
    tick(349); expect(gate.drops()).toBe(true)
    tick(2); expect(gate.phase()).toBe('listening'); expect(gate.drops()).toBe(false)
  })
  it('a new utterance during the tail cancels the tail; overlapping utterances keep speaking until all end', () => {
    const { gate, tick } = mk()
    gate.onPlayback('started', 'a'); gate.onPlayback('ended', 'a'); tick(100)
    gate.onPlayback('started', 'b'); tick(1000)
    expect(gate.phase()).toBe('speaking')
    gate.onPlayback('started', 'c'); gate.onPlayback('ended', 'b')
    expect(gate.phase()).toBe('speaking')
    gate.onPlayback('ended', 'c'); expect(gate.phase()).toBe('tail')
  })
  it('push-to-interrupt cancels TTS, then tail, then listening', () => {
    const { gate, cancel, tick } = mk()
    gate.onPlayback('started', 'u')
    expect(gate.interrupt()).toBe(true); expect(cancel).toHaveBeenCalledTimes(1)
    expect(gate.phase()).toBe('tail')
    gate.onPlayback('cancelled', 'u') // renderer confirmation does not extend past one tail
    tick(351); expect(gate.phase()).toBe('listening')
  })
  it('interrupt while not speaking is a no-op', () => {
    const { gate, cancel } = mk()
    expect(gate.interrupt()).toBe(false); expect(cancel).not.toHaveBeenCalled()
  })
  it('VAD barge-in is ignored in speakers mode', () => {
    const { gate, cancel } = mk()
    gate.onPlayback('started', 'u')
    expect(gate.bargeIn({ speechMs: 900, words: 5 })).toBe(false); expect(cancel).not.toHaveBeenCalled()
  })
  it('tail is tunable', () => {
    const { gate, tick } = mk('speakers', 100)
    gate.onPlayback('started', 'u'); gate.onPlayback('ended', 'u'); tick(101)
    expect(gate.phase()).toBe('listening')
  })
})

describe('echo gate (headphones)', () => {
  it('never drops frames', () => {
    const { gate } = mk('headphones')
    gate.onPlayback('started', 'u'); expect(gate.drops()).toBe(false)
  })
  it.each([[299, 3, false], [300, 1, false], [300, 2, true], [1200, 6, true]])('barge-in %ims %iwords → %s', (speechMs, words, cancelled) => {
    const { gate, cancel } = mk('headphones')
    gate.onPlayback('started', 'u')
    expect(gate.bargeIn({ speechMs, words })).toBe(cancelled)
    expect(cancel).toHaveBeenCalledTimes(cancelled ? 1 : 0)
  })
  it('barge-in when nothing is speaking does nothing', () => {
    const { gate, cancel } = mk('headphones')
    expect(gate.bargeIn({ speechMs: 900, words: 5 })).toBe(false); expect(cancel).not.toHaveBeenCalled()
  })
})

describe('text-echo filter', () => {
  const spoken = ['Tell me about a time you disagreed with a teammate.', 'What did you do next and how did it turn out?']
  it('discards a final that echoes the last two spoken sentences (≥ 0.8 overlap)', () => {
    const { gate } = mk()
    spoken.forEach(s => gate.noteSpoken(s))
    expect(gate.isEcho('tell me about a time you disagreed with a teammate')).toBe(true)
    expect(gate.isEcho('what did you do next and how did it turn')).toBe(true)
  })
  it('keeps a real answer, even one that reuses a few words', () => {
    const { gate } = mk()
    spoken.forEach(s => gate.noteSpoken(s))
    expect(gate.isEcho('I once disagreed with a teammate about the database schema and we ran a spike')).toBe(false)
  })
  it('only the last two sentences count', () => {
    const { gate } = mk()
    ;['An old sentence about kubernetes clusters and rollouts.', ...spoken].forEach(s => gate.noteSpoken(s))
    expect(gate.isEcho('an old sentence about kubernetes clusters and rollouts')).toBe(false)
  })
  it('very short finals are never treated as echo', () => {
    const { gate } = mk()
    gate.noteSpoken('Are you ready to begin the interview now?')
    expect(gate.isEcho('ready to begin')).toBe(false)
  })
})
