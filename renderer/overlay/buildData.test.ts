import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG } from '../../electron/copilot/config'
import { PRIVACY_NOTICE_VERSION } from '../../electron/copilot/privacy-mode'
import type { CopilotConfig, Suggestion } from '../../electron/contract'
import { initialOverlayModel, reduceOverlay, type OverlayEvent, type OverlayModel } from '../lib/copilot'
import { buildOverlayData } from './buildData'

const run = (events: OverlayEvent[]): OverlayModel => events.reduce(reduceOverlay, initialOverlayModel)
const listening = (over: Partial<CopilotConfig['stt']> = {}): OverlayEvent => ({ type: 'copilotState', payload: { state: 'listening', mode: 'live', sessionId: 's', sources: ['mic'], startedAt: 10_000 } })
const ctx = (over: Partial<Parameters<typeof buildOverlayData>[1]> = {}) => ({ cfg: DEFAULT_CONFIG, layout: 'panel' as const, now: 10_000 + 252_000, wiped: false, ...over })
const sug = (over: Partial<Suggestion> = {}): Suggestion => ({ questionId: 'q', model: 'm', tier: 'fast', say: 'x', bullets: [], star: null, proof: [], flags: [], done: true, firstTokenMs: 1100, totalMs: 2000, costUsd: 0.02, ...over })

describe('buildOverlayData', () => {
  it('idle by default with hotkey glyphs and the default indicator', () => {
    const d = buildOverlayData(initialOverlayModel, ctx())
    expect(d.state).toBe('idle')
    expect(d.keys.answer).toBe('⌃⌥A')
    expect(d.keys.panic).toBe('⌃⌥⇧X')
    expect(d.indicator).toBe('chip')
  })

  it('shows elapsed time, latency and cost, "mic only" when no system source', () => {
    const d = buildOverlayData(run([listening(), { type: 'copilotSuggestion', payload: sug() }]), ctx())
    expect(d.time).toBe('04:12')
    expect(d.latency).toBe('1.1 s')
    expect(d.cost).toBe('$0.02')
    expect(d.sys).toBe(false)
  })

  it('no answer yet: latency dash', () => {
    expect(buildOverlayData(run([listening()]), ctx()).latency).toBe('— s')
  })

  it('click-through look only while listening with nothing to act on, and only if the setting is on', () => {
    const m = run([listening()])
    expect(buildOverlayData(m, ctx()).passive).toBe(true)
    const off = { ...DEFAULT_CONFIG, overlay: { ...DEFAULT_CONFIG.overlay, clickThroughIdle: false } }
    expect(buildOverlayData(m, ctx({ cfg: off })).passive).toBe(false)
    const q = run([listening(), { type: 'copilotQuestion', payload: { id: 'q', text: 'Why?', type: 'other', confidence: 1, at: 1, auto: false } }])
    expect(buildOverlayData(q, ctx()).passive).toBe(false)
  })

  it('practice sessions say Practice', () => {
    const m = run([{ type: 'copilotState', payload: { state: 'listening', mode: 'practice', sessionId: 's', sources: ['mic'], startedAt: 0 } }])
    expect(buildOverlayData(m, ctx()).practice).toBe(true)
  })

  it('the indicator variant needs Privacy mode enabled and acknowledged', () => {
    const pm = (noticeVersion: string | null): CopilotConfig => ({ ...DEFAULT_CONFIG, privacy: { ...DEFAULT_CONFIG.privacy, mode: { ...DEFAULT_CONFIG.privacy.mode, enabled: true, noticeVersion, indicator: 'dot' } } })
    expect(buildOverlayData(initialOverlayModel, ctx({ cfg: pm(PRIVACY_NOTICE_VERSION) })).indicator).toBe('dot')
    expect(buildOverlayData(initialOverlayModel, ctx({ cfg: pm(null) })).indicator).toBe('chip')
  })

  it('permission problems name the silent source', () => {
    const sys = run([{ type: 'copilotState', payload: { state: 'listening', mode: 'live', sessionId: 's', sources: ['mic', 'system'], startedAt: 0 } }, { type: 'copilotHealth', payload: { source: 'system', status: 'silent', level: 0 } }])
    expect(buildOverlayData(sys, ctx()).problem).toEqual({ kind: 'system' })
    const mic = run([listening(), { type: 'copilotHealth', payload: { source: 'mic', status: 'denied', level: 0 } }])
    expect(buildOverlayData(mic, ctx()).problem).toEqual({ kind: 'mic' })
  })

  it('stt errors carry the retry attempt; other errors carry their message', () => {
    const stt = run([listening(), { type: 'copilotError', payload: { kind: 'stt', message: 'lost', retrying: true, attempt: 2 } }])
    expect(buildOverlayData(stt, ctx()).problem).toMatchObject({ kind: 'stt', attempt: 2 })
    const eng = run([listening(), { type: 'copilotError', payload: { kind: 'engine', message: 'No API key', retrying: false } }])
    expect(buildOverlayData(eng, ctx()).problem).toMatchObject({ kind: 'error', message: 'No API key' })
  })

  it('transcript lines map speakers and partials; question types get readable labels', () => {
    const m = run([listening(), { type: 'copilotTranscript', payload: { id: 'a', speaker: 'interviewer', text: 'hi', final: false, t0: 0, t1: null } }, { type: 'copilotQuestion', payload: { id: 'q', text: 'Design a cache', type: 'system-design', confidence: 1, at: 1, auto: false } }])
    const d = buildOverlayData(m, ctx())
    expect(d.lines).toEqual([{ id: 'a', who: 'Interviewer', text: 'hi', partial: true }])
    expect(d.question).toEqual({ type: 'System design', text: 'Design a cache' })
  })

  it('stopped: minutes kept come from the frozen clock', () => {
    const m = run([listening(), { type: 'copilotState', payload: { state: 'stopped', mode: 'live', sessionId: 's', sources: [], startedAt: 10_000 } }])
    expect(buildOverlayData(m, ctx({ now: 10_000 + 14 * 60_000 })).savedMinutes).toBe(14)
  })
})
