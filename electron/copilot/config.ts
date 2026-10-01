import { app } from 'electron'
import fs from 'node:fs'

import { userFile } from '../context'
import { defaultEngine } from './stt/runtime'
import type { Anchor, CopilotConfig, DeepPartial, SttBenchmark } from './types'

const FILE = 'copilot.json'
const PANIC = 'Control+Alt+Shift+X'

export const DEFAULT_CONFIG: CopilotConfig = {
  version: 1,
  audio: { micDeviceId: null, useSystem: false, systemSource: 'loopback', virtualDeviceId: null },
  // S2 bake-off: Whisper small on Apple silicon, Moonshine small elsewhere; 650 ms of quiet ends an utterance
  stt: { engine: defaultEngine(), model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 650, vocab: [] },
  engine: {
    tier: 'fast', escalateForDesignCoding: true, provider: 'openrouter',
    openrouter: { dataCollection: 'deny', zdr: false, sort: 'latency' },
    models: { fast: null, balanced: null, deep: null },
    factCheck: true, vision: 'vision', autoAnswer: false,
  },
  coaching: { shape: 'cues+star', length: 2, tone: 'direct', persona: '', quoteResume: true },
  overlay: { layout: 'strip', anchor: 'tr', displayId: null, width: 440, fontPx: 14, opacity: 0.94, theme: 'app', clickThroughIdle: true, aboveFullscreen: true },
  hotkeys: {
    answer: 'Control+Alt+A', followup: 'Control+Alt+F', clarify: 'Control+Alt+C', screenshot: 'Control+Alt+S', summarise: 'Control+Alt+M',
    expand: 'Control+Alt+E', listen: 'Control+Alt+L', toggle: 'Control+Alt+H', quickHide: 'Control+Alt+Shift+H', panic: PANIC,
  },
  privacy: {
    retentionDays: 90, localOnly: false, redact: true,
    mode: { enabled: false, noticeVersion: null, hideFromCapture: false, noDockIcon: false, neutralTitle: false, indicator: 'chip' },
  },
  practice: { followups: true, readAloud: false, answerMinutes: 2 },
}

// ————— Field sanitizers: a bad value falls back to the default for that field only —————
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
const pick = <T extends string | number>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d)
const num = (v: unknown, d: number, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d)
const intOrNull = (v: unknown, d: number | null, min: number, max: number): number | null => (v === null ? null : typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : d)
const strOrNull = (v: unknown, d: string | null, max = 200): string | null => (v === null ? null : typeof v === 'string' && v.length <= max ? v : d)
const text = (v: unknown, d: string, max = 500): string => (typeof v === 'string' && v.length <= max ? v : d)
const words = (v: unknown, d: string[]): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 60).slice(0, 200) : d)

const ANCHORS: readonly Anchor[] = ['tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br']
const INDICATORS = ['chip', 'dot', 'off'] as const

function benchmark(v: unknown): SttBenchmark | null {
  const b = obj(v)
  if (typeof b.at !== 'number' || typeof b.p50FinalMs !== 'number' || typeof b.realTimeFactor !== 'number') return null
  return {
    at: b.at, p50FinalMs: b.p50FinalMs, realTimeFactor: b.realTimeFactor,
    ramMb: typeof b.ramMb === 'number' ? b.ramMb : null, wer: typeof b.wer === 'number' ? b.wer : null,
  }
}

/** Coerce anything (old/newer file, renderer patch) into a valid CopilotConfig; unknown keys are dropped. */
export function normalizeConfig(raw: unknown): CopilotConfig {
  const d = DEFAULT_CONFIG
  const r = obj(raw)
  const audio = obj(r.audio), stt = obj(r.stt), eng = obj(r.engine), or = obj(eng.openrouter), models = obj(eng.models)
  const co = obj(r.coaching), ov = obj(r.overlay), hk = obj(r.hotkeys), pr = obj(r.privacy), pm = obj(pr.mode), pc = obj(r.practice)
  const accel = (k: keyof typeof d.hotkeys) => text(hk[k], d.hotkeys[k], 60) || d.hotkeys[k]
  return {
    version: 1,
    audio: {
      micDeviceId: strOrNull(audio.micDeviceId, d.audio.micDeviceId), useSystem: bool(audio.useSystem, d.audio.useSystem),
      systemSource: pick(audio.systemSource, ['loopback', 'virtual'], d.audio.systemSource), virtualDeviceId: strOrNull(audio.virtualDeviceId, d.audio.virtualDeviceId),
    },
    stt: {
      engine: pick(stt.engine, ['moonshine', 'whisper-mlx'], d.stt.engine), model: strOrNull(stt.model, d.stt.model), // faster-whisper has no adapter: a stale value would fail every session start
      device: pick(stt.device, ['auto', 'cpu', 'coreml', 'cuda'], d.stt.device), language: 'en',
      lastBenchmark: benchmark(stt.lastBenchmark), endSilenceMs: num(stt.endSilenceMs, d.stt.endSilenceMs, 200, 3000), vocab: words(stt.vocab, d.stt.vocab),
    },
    engine: {
      tier: pick(eng.tier, ['fast', 'balanced', 'deep'], d.engine.tier), escalateForDesignCoding: bool(eng.escalateForDesignCoding, d.engine.escalateForDesignCoding), provider: 'openrouter',
      openrouter: { dataCollection: pick(or.dataCollection, ['deny', 'allow'], d.engine.openrouter.dataCollection), zdr: bool(or.zdr, d.engine.openrouter.zdr), sort: pick(or.sort, ['latency', 'price'], d.engine.openrouter.sort) },
      models: { fast: strOrNull(models.fast, null), balanced: strOrNull(models.balanced, null), deep: strOrNull(models.deep, null) },
      factCheck: bool(eng.factCheck, d.engine.factCheck), vision: pick(eng.vision, ['vision', 'ocr'], d.engine.vision), autoAnswer: bool(eng.autoAnswer, d.engine.autoAnswer),
    },
    coaching: {
      shape: pick(co.shape, ['cues', 'cues+star', 'script'], d.coaching.shape), length: pick(co.length, [1, 2, 3], d.coaching.length),
      tone: pick(co.tone, ['direct', 'warm', 'formal'], d.coaching.tone), persona: text(co.persona, d.coaching.persona, 2000), quoteResume: bool(co.quoteResume, d.coaching.quoteResume),
    },
    overlay: {
      layout: pick(ov.layout, ['strip', 'panel'], d.overlay.layout), anchor: pick(ov.anchor, ANCHORS, d.overlay.anchor), displayId: intOrNull(ov.displayId, d.overlay.displayId, 0, Number.MAX_SAFE_INTEGER),
      width: num(ov.width, d.overlay.width, 280, 1200), fontPx: num(ov.fontPx, d.overlay.fontPx, 10, 28), opacity: num(ov.opacity, d.overlay.opacity, 0.6, 1),
      theme: pick(ov.theme, ['app', 'dark', 'light'], d.overlay.theme), clickThroughIdle: bool(ov.clickThroughIdle, d.overlay.clickThroughIdle), aboveFullscreen: bool(ov.aboveFullscreen, d.overlay.aboveFullscreen),
    },
    hotkeys: {
      answer: accel('answer'), followup: accel('followup'), clarify: accel('clarify'), screenshot: accel('screenshot'), summarise: accel('summarise'),
      expand: accel('expand'), listen: accel('listen'), toggle: accel('toggle'), quickHide: accel('quickHide'), panic: PANIC, // fixed by design
    },
    privacy: {
      retentionDays: intOrNull(pr.retentionDays, d.privacy.retentionDays, 0, 3650), localOnly: bool(pr.localOnly, d.privacy.localOnly), redact: bool(pr.redact, d.privacy.redact),
      mode: {
        enabled: bool(pm.enabled, false), noticeVersion: strOrNull(pm.noticeVersion, null, 40), hideFromCapture: bool(pm.hideFromCapture, false),
        noDockIcon: bool(pm.noDockIcon, false), neutralTitle: bool(pm.neutralTitle, false), indicator: pick(pm.indicator, INDICATORS, 'chip'),
      },
    },
    practice: { followups: bool(pc.followups, d.practice.followups), readAloud: bool(pc.readAloud, d.practice.readAloud), answerMinutes: num(pc.answerMinutes, d.practice.answerMinutes, 1, 10) },
  }
}

/** Plain objects merge key by key; arrays and scalars (incl. null) replace. */
function merge(base: unknown, patch: unknown): unknown {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch) || typeof base !== 'object' || base === null || Array.isArray(base)) return patch
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = merge(out[k], v)
  return out
}

export function readCopilotConfig(): CopilotConfig {
  try { return normalizeConfig(JSON.parse(fs.readFileSync(userFile(FILE), 'utf8'))) } catch { return DEFAULT_CONFIG }
}

/** Validate-then-persist (temp file + rename, so a crash never leaves half a file). Returns the stored config. */
export function writeCopilotConfig(patch: DeepPartial<CopilotConfig>): CopilotConfig {
  const next = normalizeConfig(merge(readCopilotConfig(), patch))
  const file = userFile(FILE)
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2))
  fs.renameSync(`${file}.tmp`, file)
  return next
}
