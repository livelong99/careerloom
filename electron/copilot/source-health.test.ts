import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSourceHealth, peakOf, SILENT_MS, TICK_MS } from './source-health'
import type { SourceHealth } from './types'

const chunk = (v: number) => new Int16Array(1600).fill(v).buffer // 100 ms

afterEach(() => vi.useRealTimers())

describe('silent-source detector', () => {
  it('peakOf reads PCM16', () => { expect(peakOf(chunk(-300))).toBe(300); expect(peakOf(chunk(0))).toBe(0) })

  it('dead track (zeros, or nothing) flips to silent within SILENT_MS + one tick, under 3 s', () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const seen: Array<[SourceHealth['status'], number]> = []
    const h = createSourceHealth('mic', e => seen.push([e.status, Date.now()]))
    h.start()
    for (let t = 0; t < 4000; t += 100) { h.feed(chunk(0)); vi.advanceTimersByTime(100) } // zeros keep arriving
    h.stop()
    expect(seen).toHaveLength(1)
    expect(seen[0]![0]).toBe('silent')
    expect(seen[0]![1]).toBeGreaterThanOrEqual(SILENT_MS)
    expect(seen[0]![1]).toBeLessThanOrEqual(SILENT_MS + TICK_MS)
    expect(seen[0]![1]).toBeLessThan(3000)
  })

  it('real audio keeps it ok and recovers from silent', () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const seen: string[] = []
    const h = createSourceHealth('system', e => seen.push(e.status))
    h.start()
    vi.advanceTimersByTime(3000)             // nothing arrives at all
    expect(seen).toEqual(['missing'])
    h.feed(chunk(1200)); expect(seen).toEqual(['missing', 'ok']); expect(h.level).toBeCloseTo(1200 / 32768)
    h.stop()
  })

  it('no frames at all is "missing" (device never opened), zeros are "silent"', () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const seen: string[] = []
    const h = createSourceHealth('mic', e => seen.push(e.status))
    h.start()
    vi.advanceTimersByTime(SILENT_MS + TICK_MS)
    expect(seen).toEqual(['missing'])
    h.feed(chunk(500)) // the device finally delivers: recovers
    expect(seen).toEqual(['missing', 'ok'])
    h.stop()
  })
})
