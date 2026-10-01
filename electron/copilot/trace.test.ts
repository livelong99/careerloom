import { describe, expect, it } from 'vitest'
import { createTraceLog, percentile, summarizeTraces } from './trace'

describe('trace', () => {
  it('derives stage deltas from absolute marks', () => {
    const log = createTraceLog()
    const t = log.start('q1', { speechEndAt: 1000, sttFinalAt: 1300, detectedAt: 1310 }, 1320)
    t.mark('requestSentAt', 1330); t.mark('firstByteAt', 1500); t.mark('firstTokenAt', 1600); t.mark('firstSayAt', 1650); t.mark('doneAt', 2400)
    t.finish({ promptTokens: 6000, cachedTokens: 5400 })
    expect(log.last()!.ms).toEqual({ stt: 300, detect: 10, connect: 170, ttft: 270, firstSay: 320, endToSay: 650, total: 1070, promptTokens: 6000, cachedTokens: 5400 })
  })
  it('keeps only the newest N turns and never stores text', () => {
    const log = createTraceLog(2)
    for (const id of ['a', 'b', 'c']) log.start(id, {}, 0).finish()
    expect(log.all().map(x => x.questionId)).toEqual(['b', 'c'])
    expect(JSON.stringify(log.all())).not.toMatch(/"text"/)
  })
  it('marks only once (first wins) and omits unknown stages', () => {
    const t = createTraceLog().start('q', {}, 0)
    t.mark('firstTokenAt', 5); t.mark('firstTokenAt', 9)
    expect(t.snapshot().firstTokenAt).toBe(5)
    expect(t.finish().ms.stt).toBeNull()
  })
  it('percentiles and per-session summary', () => {
    expect(percentile([100, 200, 300, 400], 0.5)).toBe(200)
    expect(percentile([], 0.5)).toBeNull()
    const s = summarizeTraces([{ ttft: 100, firstSay: 150, endToSay: null, total: 900, promptTokens: 1000, cachedTokens: 0 }, { ttft: 300, firstSay: 350, endToSay: 1400, total: 1100, promptTokens: 1000, cachedTokens: 800 }])
    expect(s.turns).toBe(2)
    expect(s.ttft).toEqual({ p50: 100, p95: 300 })
    expect(s.endToSay).toEqual({ p50: 1400, p95: 1400 })
    expect(s.cacheHitRate).toBeCloseTo(0.4)
  })
})
