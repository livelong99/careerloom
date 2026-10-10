import { app } from 'electron'
import fs from 'node:fs'

import { userFile } from '../context'
import { PROVIDER_IDS, type ProviderId } from '../llm/providers'
import { isFastFor } from './fast-models'
import { defaultHotkeys, migrateHotkey } from './hotkey-defaults'
import { sameAccelerator, validateAccelerator } from './hotkeys'
import { parseModelId } from './stt/hf-models'
import { DEFAULT_HF_OPTIONS, defaultEngine } from './stt/runtime'
import type { Anchor, CopilotConfig, DeepPartial, SttBenchmark } from './types'

const FILE = 'copilot.json'

export const DEFAULT_CONFIG: CopilotConfig = {
  version: 1,
  audio: { micDeviceId: null, useSystem: false, systemSource: 'loopback', virtualDeviceId: null },
  // S2 bake-off: Whisper small on Apple silicon, Moonshine small elsewhere; 650 ms of quiet ends an utterance
  stt: { engine: defaultEngine(), model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 650, vocab: [], hf: { ...DEFAULT_HF_OPTIONS } },
  engine: {
    tier: 'fast', escalateForDesignCoding: true, provider: 'openrouter',
    openrouter: { dataCollection: 'allow', zdr: false, sort: 'latency', policyMigrated: true }, // user-approved: free models (which may train) work out of the box
    models: { fast: null, balanced: null, deep: null },
    factCheck: true, vision: 'vision', screenshots: false, autoAnswer: false, speculativeStart: false,
    gate: { engine: 'heuristic', baseUrl: 'https://openrouter.ai/api', endpoint: 'systemone' },
  },
  coaching: { shape: 'cues+star', length: 2, tone: 'direct', persona: '', quoteResume: true },
  overlay: { layout: 'strip', anchor: 'tr', displayId: null, width: 440, fontPx: 14, opacity: 0.94, theme: 'app', clickThroughIdle: true, aboveFullscreen: true },
  hotkeys: defaultHotkeys(),
  privacy: {
    retentionDays: 90, localOnly: false, redact: true,
    mode: { enabled: false, noticeVersion: null, hideFromCapture: false, noDockIcon: false, neutralTitle: false, indicator: 'chip' },
  },
  practice: { followups: true, answerMinutes: 2 },
}

// ————— Field sanitizers: a bad value falls back to the default for that field only —————
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
const pick = <T extends string | number>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d)
const num = (v: unknown, d: number, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d)
const intOrNull = (v: unknown, d: number | null, min: number, max: number): number | null => (v === null ? null : typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : d)
const strOrNull = (v: unknown, d: string | null, max = 200): string | null => (v === null ? null : typeof v === 'string' && v.length <= max ? v : d)
const text = (v: unknown, d: string, max = 500): string => (typeof v === 'string' && v.length <= max ? v : d)
/** https only (the key goes with the request); anything else falls back. */
const httpUrl = (v: unknown, d: string): string => (typeof v === 'string' && /^https:\/\/[^\s/]+(?:\/[^\s?#]*)?$/.test(v) && v.length <= 200 ? v.replace(/\/+$/, '') : d)
/** The Copilot is live: a model that is not on the provider's fast list is dropped (null = the provider's default fast model). */
const fastOnly = (provider: ProviderId, v: unknown): string | null => { const m = strOrNull(v, null); return m !== null && isFastFor(provider, m) ? m : null }
const words = (v: unknown, d: string[]): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 60).slice(0, 200) : d)

const ANCHORS: readonly Anchor[] = ['tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br']
const INDICATORS = ['chip', 'dot', 'off'] as const

function benchmark(v: unknown): SttBenchmark | null {
  const b = obj(v)
  if (typeof b.at !== 'number' || typeof b.p50FinalMs !== 'number' || typeof b.realTimeFactor !== 'number') return null
  return {
    at: b.at, p50FinalMs: b.p50FinalMs, realTimeFactor: b.realTimeFactor,
    ramMb: typeof b.ramMb === 'number' ? b.ramMb : null, wer: typeof b.wer === 'number' ? b.wer : null,
    ...(typeof b.p95FinalMs === 'number' ? { p95FinalMs: b.p95FinalMs } : {}), ...(typeof b.p50DecodeMs === 'number' ? { p50DecodeMs: b.p50DecodeMs } : {}),
    ...(typeof b.p95DecodeMs === 'number' ? { p95DecodeMs: b.p95DecodeMs } : {}), ...(b.device === 'cuda' || b.device === 'cpu' ? { device: b.device } : {}),
  }
}

/** `def`, or the same modifiers with another letter, whichever no other action already uses (def again if all are taken). */
function freeShortcut(h: CopilotConfig['hotkeys'], key: keyof CopilotConfig['hotkeys'], def: string): string {
  const prefix = def.slice(0, def.lastIndexOf('+') + 1)
  const taken = (a: string) => (Object.keys(h) as Array<keyof typeof h>).some(k => k !== key && sameAccelerator(h[k], a))
  return [def, ...'GJUYOPBNW'.split('').map(l => prefix + l)].find(a => !taken(a)) ?? def
}

/** Coerce anything (old/newer file, renderer patch) into a valid CopilotConfig; unknown keys are dropped. */
export function normalizeConfig(raw: unknown): CopilotConfig {
  const d = DEFAULT_CONFIG
  const r = obj(raw)
  const audio = obj(r.audio), stt = obj(r.stt), eng = obj(r.engine), or = obj(eng.openrouter), models = obj(eng.models), gt = obj(eng.gate)
  const co = obj(r.coaching), ov = obj(r.overlay), hk = obj(r.hotkeys), pr = obj(r.privacy), pm = obj(pr.mode), pc = obj(r.practice)
  const hf = obj(stt.hf), sttEngine = pick(stt.engine, ['moonshine', 'whisper-mlx', 'faster-whisper', 'parakeet', 'hf'] as const, d.stt.engine), sttModel = strOrNull(stt.model, d.stt.model)
  const provider = pick<ProviderId>(eng.provider, PROVIDER_IDS, d.engine.provider)
  const accel = (k: keyof typeof d.hotkeys) => { const a = migrateHotkey(k, text(hk[k], d.hotkeys[k], 60) || d.hotkeys[k]); return validateAccelerator(a).ok ? a : d.hotkeys[k] }
  const hotkeys: CopilotConfig['hotkeys'] = {
    answer: accel('answer'), followup: accel('followup'), clarify: accel('clarify'), screenshot: accel('screenshot'), summarise: accel('summarise'), detail: accel('detail'),
    expand: accel('expand'), listen: accel('listen'), toggle: accel('toggle'), quickHide: accel('quickHide'), clear: accel('clear'), panic: d.hotkeys.panic, // fixed by design
  }
  // More detail came after people had set their own shortcuts: a file without it gets the first default no other action uses.
  if (hk.detail === undefined) hotkeys.detail = freeShortcut(hotkeys, 'detail', d.hotkeys.detail)
  return {
    version: 1,
    audio: {
      micDeviceId: strOrNull(audio.micDeviceId, d.audio.micDeviceId), useSystem: bool(audio.useSystem, d.audio.useSystem),
      systemSource: pick(audio.systemSource, ['loopback', 'virtual'], d.audio.systemSource), virtualDeviceId: strOrNull(audio.virtualDeviceId, d.audio.virtualDeviceId),
    },
    stt: {
      engine: sttEngine, model: sttEngine === 'hf' && sttModel !== null && !parseModelId(sttModel) ? null : sttModel, // hf: only `owner/name@<commit>` is a model
      hf: { language: typeof hf.language === 'string' && /^(auto|[a-z]{2,3}-[A-Z]{2})$/.test(hf.language) ? hf.language : d.stt.hf!.language, lookahead: pick(hf.lookahead, [0, 3, 6, 13] as const, d.stt.hf!.lookahead) },
      device: pick(stt.device, ['auto', 'cpu', 'coreml', 'cuda'], d.stt.device), language: 'en',
      lastBenchmark: benchmark(stt.lastBenchmark), endSilenceMs: num(stt.endSilenceMs, d.stt.endSilenceMs, 200, 3000), vocab: words(stt.vocab, d.stt.vocab),
    },
    engine: {
      tier: pick(eng.tier, ['fast', 'balanced', 'deep'], d.engine.tier), escalateForDesignCoding: bool(eng.escalateForDesignCoding, d.engine.escalateForDesignCoding), provider,
      // Files written before the default flipped (no marker) get 'allow' once; from then on the user's pick stands.
      openrouter: { dataCollection: or.policyMigrated === true ? pick(or.dataCollection, ['deny', 'allow'], d.engine.openrouter.dataCollection) : 'allow', policyMigrated: true, zdr: bool(or.zdr, d.engine.openrouter.zdr), sort: pick(or.sort, ['latency', 'price'], d.engine.openrouter.sort) },
      models: { fast: fastOnly(provider, models.fast), balanced: fastOnly(provider, models.balanced), deep: fastOnly(provider, models.deep) },
      factCheck: bool(eng.factCheck, d.engine.factCheck), vision: pick(eng.vision, ['vision', 'ocr'], d.engine.vision), screenshots: bool(eng.screenshots, d.engine.screenshots), autoAnswer: bool(eng.autoAnswer, d.engine.autoAnswer),
      speculativeStart: bool(eng.speculativeStart, d.engine.speculativeStart),
      gate: { engine: pick(gt.engine, ['heuristic', 'jev'], d.engine.gate.engine), baseUrl: httpUrl(gt.baseUrl, d.engine.gate.baseUrl), endpoint: pick(gt.endpoint, ['systemone', 'decisions'], d.engine.gate.endpoint) },
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
    hotkeys,
    privacy: {
      retentionDays: intOrNull(pr.retentionDays, d.privacy.retentionDays, 0, 3650), localOnly: bool(pr.localOnly, d.privacy.localOnly), redact: bool(pr.redact, d.privacy.redact),
      mode: {
        enabled: bool(pm.enabled, false), noticeVersion: strOrNull(pm.noticeVersion, null, 40), hideFromCapture: bool(pm.hideFromCapture, false),
        noDockIcon: bool(pm.noDockIcon, false), neutralTitle: bool(pm.neutralTitle, false), indicator: pick(pm.indicator, INDICATORS, 'chip'),
      },
    },
    practice: { followups: bool(pc.followups, d.practice.followups), answerMinutes: num(pc.answerMinutes, d.practice.answerMinutes, 1, 10) },
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
  const merged = normalizeConfig(merge(readCopilotConfig(), { ...patch, engine: { ...patch.engine, models: undefined } })) // provider first, so the slots below are judged against it
  for (const [slot, m] of Object.entries(patch.engine?.models ?? {})) {
    if (typeof m === 'string' && !isFastFor(merged.engine.provider, m)) throw new Error(`"${m}" is not a fast model for ${merged.engine.provider}. The Copilot answers live, so it only uses fast models (${slot} slot).`)
  }
  const next = normalizeConfig(merge(readCopilotConfig(), patch))
  const file = userFile(FILE)
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2))
  fs.renameSync(`${file}.tmp`, file)
  return next
}
