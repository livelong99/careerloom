// Screenshot harness only (not shipped): a fake `window.careerloom` with prototype-like data, installed before any app module loads.
const DAY = 86_400_000
const now = Date.now()
const at = (d: number, h: number, m: number): number => { const x = new Date(now - d * DAY); x.setHours(h, m, 0, 0); return x.getTime() }

let config: Record<string, unknown> = {
  version: 1,
  audio: { micDeviceId: null, useSystem: false, systemSource: 'loopback', virtualDeviceId: null },
  stt: { engine: 'moonshine', model: 'small-streaming', device: 'auto', language: 'en', lastBenchmark: { at: now, p50FinalMs: 82, realTimeFactor: 0.08, ramMb: 610, wer: null }, endSilenceMs: 800, vocab: ['Kubernetes', 'Northwind', 'Terraform'] },
  engine: { tier: 'fast', escalateForDesignCoding: true, provider: 'openrouter', openrouter: { dataCollection: 'deny', zdr: false, sort: 'latency' }, models: { fast: 'provider/small-fast-model', balanced: 'provider/mid-model', deep: 'provider/large-model' }, factCheck: true, vision: 'vision', autoAnswer: false },
  coaching: { shape: 'cues+star', length: 2, tone: 'direct', persona: '', quoteResume: true },
  overlay: { layout: 'strip', anchor: 'tr', displayId: null, width: 440, fontPx: 14, opacity: 0.94, theme: 'app', clickThroughIdle: true, aboveFullscreen: true },
  hotkeys: { answer: 'Control+Alt+A', followup: 'Control+Alt+F', clarify: 'Control+Alt+C', screenshot: 'Control+Alt+S', summarise: 'Control+Alt+M', expand: 'Control+Alt+E', listen: 'Control+Alt+L', toggle: 'Control+Alt+H', quickHide: 'Control+Alt+Shift+H', panic: 'Control+Alt+Shift+X' },
  privacy: { retentionDays: 90, localOnly: false, redact: true, mode: { enabled: new URLSearchParams(location.search).has('pm'), noticeVersion: null, hideFromCapture: false, noDockIcon: false, neutralTitle: false, indicator: 'chip' } },
  practice: { followups: true, readAloud: false, answerMinutes: 2 },
}
const merge = (a: unknown, b: unknown): unknown => {
  const o = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  if (!o(a) || !o(b)) return b
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = merge(out[k], v)
  return out
}

const job = (id: string, title: string, company: string, score: number, state = 'evaluated') => ({ id, url: id, title, company, portalId: null, ats: null, location: null, postedAt: null, firstSeen: null, trustScore: null, trustFlags: [], state, status: null, score, reportNum: 1, reportPath: 'r.md', evaluatedAt: null, stale: false })
const summary = (id: string, startedAt: number, mins: number, questions: number, score: number | null, mode = 'practice', jobId = 'j1', jobTitle = 'Senior Platform Engineer', company = 'Northwind Labs') => ({ id, startedAt, endedAt: startedAt + mins * 60_000, mode, jobId, jobTitle, company, questions, durationSec: mins * 60, score })
const sessions = [summary('s1', at(0, 9, 40), 18, 6, 3.9), summary('s2', at(1, 16, 5), 12, 4, 3.6), summary('s3', at(3, 10, 0), 41, 11, null, 'live'), summary('s4', at(5, 15, 30), 9, 3, 3.2, 'practice', 'j2', 'Staff Backend Engineer', 'Tessellate')]
const detail = {
  ...sessions[0], transcript: [
    { id: 't0', speaker: 'interviewer', text: 'Tell me about a time you pushed back on a deadline.', final: true, t0: sessions[0]!.startedAt, t1: null },
    { id: 't1', speaker: 'you', text: 'We shipped the core path on time by cutting scope with the team.', final: true, t0: sessions[0]!.startedAt + 1, t1: null },
  ],
  questionsList: [{ id: 'q1', text: 'Tell me about a time you pushed back on a deadline without losing trust.', type: 'behavioural', confidence: 1, at: sessions[0]!.startedAt, auto: false }], suggestions: [],
  scorecard: { structure: 4.2, specifics: 3.8, evidence: 3.5, concision: 4.0, notes: [{ questionId: 'q1', tip: 'Lead with the result. You gave the outcome last, after two minutes of setup. Open with "we shipped the core path on time", then explain how.', suggestedLine: 'Cut release lead time from 4 days to 6 hours across 40 services.' }] },
}

const impl: Record<string, (...a: unknown[]) => unknown> = {
  platform: () => 'darwin',
  listJobs: () => [job('j1', 'Senior Platform Engineer', 'Northwind Labs', 4.3, 'interview'), job('j2', 'Staff Backend Engineer', 'Tessellate', 3.9), job('j3', 'Engineering Manager, Infra', 'Harbor & Pine', 3.7)],
  copilotGetConfig: () => config,
  copilotSetConfig: (p: unknown) => (config = merge(config, p) as typeof config),
  copilotReadiness: (id: unknown) => ({ context: { jobId: id, title: 'Senior Platform Engineer', company: 'Northwind Labs', hasPosting: true, hasReport: true, hasCv: true, stories: 6 }, mic: 'granted', system: 'denied', stt: 'ready', engine: 'ready' }),
  copilotContextPreview: () => ({ tokens: 5200, posting: 9, strengths: 4, gaps: 2, facts: 38, stories: 6, text: 'Role: Senior Platform Engineer at Northwind Labs\n\nRequirements:\n- Kubernetes at scale\n- Incident response' }),
  copilotSessionsForJob: (id: unknown) => ({ sessions: sessions.filter(s => s.jobId === id), trend: [] }),
  copilotListSessions: () => sessions,
  copilotGetSession: () => detail,
  copilotPracticeQuestions: () => [
    { id: 'q1', text: 'Tell me about a time you pushed back on a deadline without losing trust.', type: 'behavioural', source: 'report', lastScore: 3.6 },
    { id: 'q2', text: 'How did you migrate 40 services off the old pipeline with no downtime?', type: 'technical', source: 'report', lastScore: null },
    { id: 'q3', text: 'Design a deploy system for 200 engineers across three regions.', type: 'system-design', source: 'report', lastScore: null },
    { id: 'q4', text: 'What gap in your background worries you most for this role?', type: 'behavioural', source: 'report', lastScore: null },
  ],
  copilotListSttModels: () => ({ status: 'not-implemented', method: 'copilotListSttModels' }),
  copilotListLlmModels: () => ({ status: 'not-implemented', method: 'copilotListLlmModels' }),
  copilotOverlay: () => ({ status: 'not-implemented', method: 'copilotOverlay' }),
  copilotCheckHotkey: () => ({ ok: true }),
  copilotAckPrivacyNotice: () => ({ ok: true }),
  copilotProbeAudio: () => ({ source: 'mic', status: 'ok', level: 0.4 }),
  getSettings: () => ({ root: null, runner: 'claude', models: {}, helperModels: {}, hasApiKey: true, hasOpencodeKey: false, rootCheck: null }),
}
;(window as unknown as { careerloom: unknown }).careerloom = new Proxy(impl, {
  get: (t, k: string) => (k in t ? (k === 'platform' ? 'darwin' : (...a: unknown[]) => Promise.resolve(t[k]!(...a))) : k.startsWith('on') ? () => () => {} : () => Promise.resolve(null)),
})
