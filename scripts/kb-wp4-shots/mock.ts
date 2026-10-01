// Screenshot harness only (not shipped): the Copilot shots mock plus the KB/interviewer calls and a tiny event bus (`window.__emit`).
import '../copilot-shots/mock'

type Fn = (...a: unknown[]) => unknown
const base = (window as unknown as { careerloom: Record<string, Fn> }).careerloom
const q = new URLSearchParams(location.search)
const now = Date.now()

const bus = new Map<string, Set<(p: unknown) => void>>()
;(window as unknown as { __emit: (n: string, p: unknown) => void }).__emit = (n, p) => bus.get(n)?.forEach(cb => cb(p))

const skill = (skillId: string, name: string, inCv: boolean) => ({ skillId, name, have: 6, need: 6, expected: 'working', inCv })
const kb = { jobId: 'j1', status: 'complete', researchedAt: now, items: 46, sourcedPct: 64, sources: 21, costUsd: 0.13, inputChanged: false, runId: null,
  coverage: [skill('k8s', 'Kubernetes', false), skill('obs', 'Observability', false), skill('kafka', 'Kafka', true), skill('pg', 'PostgreSQL', true), skill('sd', 'System design', true), skill('lead', 'Leadership', true)] }
const voice = (id: string, name: string, over: Record<string, unknown> = {}) => ({ engine: 'system', id, name, lang: 'en-IN', offline: true, installed: true, sizeMb: null, note: 'system voice', ...over })
const kbItem = (id: string, text: string, skills: string[], provenance: string) => ({ id, text, skills, provenance, type: 'technical', difficulty: 3 })
const R = (itemId: string, s: number[], ev: string[]) => ({ itemId, score: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10, hintUsed: itemId === 'k3', skipped: false, criteria: ['Structure', 'Specifics', 'Evidence', 'Concision'].map((criterion, i) => ({ criterion, score: s[i], evidence: ev[i] ?? '' })) })
const session = {
  id: 's1', startedAt: now - 3_600_000, endedAt: now - 1_800_000, mode: 'practice', jobId: 'j1', jobTitle: 'Senior Platform Engineer', company: 'Northwind Labs', questions: 4, durationSec: 1800, score: 3.4,
  transcript: [], suggestions: [],
  questionsList: [
    { id: 'k1', text: 'Idempotent payment capture on timeout', type: 'system-design', confidence: 1, at: now - 3_000_000, auto: true },
    { id: 'k2', text: 'What Kafka guarantees, and what you would give up', type: 'technical', confidence: 1, at: now - 2_800_000, auto: true },
    { id: 'k3', text: 'Reducing p99 on a hot database path', type: 'technical', confidence: 1, at: now - 2_500_000, auto: true },
    { id: 'k4', text: 'A stalled Kubernetes rollout', type: 'technical', confidence: 1, at: now - 2_200_000, auto: true },
  ],
  scorecard: { structure: 3.8, specifics: 3, evidence: 3.2, concision: 3.5, notes: [] },
  interview: { planHash: 'abc', itemIds: ['k1', 'k2', 'k3', 'k4'], perQuestion: [
    R('k1', [3.5, 3, 3.2, 3.8], ['', '', 'You named the unknown-outcome case but skipped reconciliation.']), R('k2', [4.2, 3.9, 4, 4.1], ['Clear trade-off, no example from your work.']),
    R('k3', [2.8, 2.2, 2.4, 3.3], ['No metric in the result.']), R('k4', [3, 2.6, 2.8, 3.2], ['Diagnosis order was sound.']),
  ] },
}
const extra: Record<string, Fn> = {
  kbSummary: () => (q.has('nokb') ? { status: 'not-implemented', method: 'kbSummary' } : kb),
  kbList: () => [kbItem('k1', 'Idempotent payment capture on timeout', ['sd', 'kafka'], 'sourced'), kbItem('k2', 'What Kafka guarantees', ['kafka'], 'sourced'), kbItem('k3', 'Reducing p99 on a hot database path', ['pg'], 'generated'), kbItem('k4', 'A stalled Kubernetes rollout', ['k8s'], 'sourced')],
  interviewVoices: () => [voice('Aman', 'Aman · English (India)'), voice('Tara', 'Tara · English (India)'), voice('Kokoro', 'Kokoro · British, warm', { engine: 'kokoro', lang: 'en-GB', installed: false, sizeMb: 80, note: 'not Indian-accented' })],
  interviewPlanPreview: () => ({ questions: 8, sourced: 6, usd: 0.04, minutes: 30 }),
  interviewPreviewVoice: () => null,
  copilotListSessions: () => [session],
  copilotGetSession: () => session,
  copilotGetConfig: async () => { const c = (await (base.copilotGetConfig as Fn)()) as Record<string, Record<string, unknown>>; return { ...c, overlay: { ...c.overlay, layout: 'panel', theme: q.get('theme') ?? 'dark', anchor: 'tl' } } },
  onCopilotEvent: ((name: string, cb: (p: unknown) => void) => { const s = bus.get(name) ?? new Set(); s.add(cb); bus.set(name, s); return () => { s.delete(cb) } }) as Fn,
}
;(window as unknown as { careerloom: unknown }).careerloom = new Proxy(base, { get: (t, k: string) => (k === 'onCopilotEvent' ? extra[k] : k in extra ? (...a: unknown[]) => Promise.resolve(extra[k]!(...a)) : t[k]) })
