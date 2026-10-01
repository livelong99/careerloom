// Dev-only fake KB backend (`?fakeKb=ready|running|empty|nokey|partial|offline|stale`, `1` = ready). Never reached in a production build.
import type {
  InterviewConfig, KbApi, KbEvents, KbFilter, KbItemDetail, KbItemView, KbSummary, KbQuestionType, Provenance, ResearchEstimate, ResearchOptions, ResearchProgress, SourceRef,
} from '../../electron/kb/types'

export type FakeState = 'ready' | 'running' | 'empty' | 'nokey' | 'partial' | 'offline' | 'stale'
export const FAKE_STATES: readonly FakeState[] = ['ready', 'running', 'empty', 'nokey', 'partial', 'offline', 'stale']

const DAY = 86_400_000
const SKILLS: Array<[string, number, number, boolean, 'aware' | 'working' | 'strong' | 'expert']> = [
  ['Kafka', 9, 8, true, 'strong'], ['PostgreSQL', 8, 6, true, 'strong'], ['System design', 11, 10, true, 'strong'], ['Go', 6, 6, true, 'working'],
  ['Kubernetes', 2, 6, false, 'working'], ['Leadership', 5, 5, true, 'working'], ['Observability', 1, 4, false, 'working'],
]
type Seed = [string, KbQuestionType, string, 1 | 2 | 3 | 4 | 5, Provenance, string, boolean, number]
const SEEDS: Seed[] = [
  ['How would you design an idempotent payment-capture flow when the card network times out?', 'system-design', 'System design', 4, 'sourced', 'Eng blog · payments at scale', true, 3],
  ['What guarantees does Kafka give you, and which would you give up first to cut latency?', 'technical', 'Kafka', 3, 'sourced', 'GitHub · system-design-primer', false, 4],
  ['Walk me through a time you reduced p99 latency on a hot database path.', 'behavioural', 'PostgreSQL', 3, 'generated', 'Generated from your gap: no tuning story', false, 0],
  ['A Kubernetes rollout stalls at 50%. How do you find out why?', 'technical', 'Kubernetes', 3, 'sourced', 'Stack Overflow · CC BY-SA', false, 2],
  ['Tell me about a time you disagreed with a design and how it ended.', 'behavioural', 'Leadership', 2, 'sourced', 'O*NET task statements', false, 2],
  ['How do you decide what to put on an on-call dashboard?', 'situational', 'Observability', 3, 'generated', 'Generated from JD: own observability', false, 0],
  ['Explain MVCC and where it bites in long-running transactions.', 'technical', 'PostgreSQL', 4, 'sourced', 'Docs · postgresql.org', false, 3],
  ['When would you choose exactly-once over at-least-once with idempotency?', 'technical', 'Kafka', 4, 'sourced', 'Eng blog · stream processing', false, 2],
  ['Which of my questions would you push back on in a design review?', 'behavioural', 'Leadership', 2, 'user', 'Added by you', false, 0],
]
const HOSTS: Array<[string, SourceRef['kind'], string | null]> = [['example-payments.dev', 'eng-blog', null], ['github.com', 'github', 'CC BY 4.0'], ['postgresql.org', 'official-doc', null]]

const hash = (s: string): string => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h).toString(16).padStart(8, '0') }

function viewOf(s: Seed, i: number, hidden = false): KbItemView {
  const [text, type, skill, difficulty, provenance, , pinned, seen] = s
  return {
    id: `it-${i}`, text, type, skills: [skill.toLowerCase().replace(/\s+/g, '-')], difficulty, provenance, seen, confidence: provenance === 'generated' ? 0.4 : 0.8,
    idealOutline: ['Clarify failure modes, volume and consistency needs', 'State the key decision and the trade-off', 'Close with how you would monitor it'],
    rubric: [{ criterion: 'Correctness', good: 'Names the unknown-outcome case', weak: 'Assumes the timeout means failure' }, { criterion: 'Trade-offs', good: 'Compares two designs', weak: 'Only one design' }],
    followUps: ['What if the key store is down?', 'How do you test this?'], redFlags: ['“Just retry until it works.”'],
    user: { pinned, hidden, edited: provenance === 'user', notes: null }, stats: { asked: seen ? 2 : 0, lastScore: seen ? 3.2 : null, avgScore: seen ? 3.2 : null },
    sourceCount: provenance === 'sourced' ? Math.max(1, seen) : 0, whyForYou: i === 0 ? 'The posting says “own payment correctness”, and your résumé shows Kafka and Postgres but no idempotency story. Your best-fit STAR story: Ledger migration.' : null,
  }
}
const sourceOf = (i: number): SourceRef => {
  const [host, kind, licence] = HOSTS[i % HOSTS.length]!
  return { id: `src-${i}`, url: `https://${host}/q/${i}`, title: `${host} · discussion ${i + 1}`, host, kind, licence, fetchedAt: Date.now() - 2 * DAY, contentHash: hash(host + i), trust: 1 }
}

type Promised<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<R> : never }
/** The slice of the bridge the KB tab uses; satisfied by `window.careerloom` and by this fake. */
export type KbClient = Pick<Promised<KbApi>, 'kbSummary' | 'kbList' | 'kbItem' | 'kbEstimate' | 'kbResearchStart' | 'kbResearchStop' | 'kbItemUpdate' | 'kbItemAdd' | 'kbItemRemove' | 'kbExport' | 'kbSearchKeyTest' | 'kbOpenSource' | 'interviewConfig' | 'interviewSetConfig'> & {
  onKbEvent<K extends 'kbProgress' | 'kbChanged'>(event: K, cb: (p: KbEvents[K]) => void): () => void
}

const PROGRESS: Array<Pick<ResearchProgress, 'phase' | 'done' | 'total' | 'note'>> = [
  { phase: 'plan', done: 18, total: 18 }, { phase: 'search', done: 18, total: 18 }, { phase: 'fetch', done: 17, total: 29 },
]

/** In-memory backend: same shapes as the real handlers, plus a timer-driven research run for the live states. */
const CONFIG: InterviewConfig = {
  version: 1,
  research: { model: null, depth: 'standard', budgetUsd: 0.3, minutes: 5, allowAgent: false, search: { backend: 'brave', fallbackOrder: ['brave', 'exa', 'serper', 'searxng'], searxngUrl: null },
    sources: { stackexchange: true, github: true, taxonomy: true, hn: true, companyPages: true, articles: true }, consentVersion: null, refreshAfterDays: 30 },
  voice: { engine: 'system', voiceId: null, speed: 1, echo: 'speakers', tailMs: 400, pushToInterrupt: 'Alt+Space' },
  kb: { retentionDays: null, maxItems: 400 },
}

/** `consentVersion` set = the first-run web-research acknowledgement is already given (`?fakeConsent=0` starts without it). */
export function createFakeKb(state: FakeState, consentVersion: string | null = '2026-10-v1'): KbClient {
  let config: InterviewConfig = { ...CONFIG, research: { ...CONFIG.research, consentVersion } }
  let status: KbSummary['status'] = state === 'empty' || state === 'nokey' ? 'none' : state === 'running' ? 'running' : state === 'partial' ? 'partial' : state === 'stale' ? 'stale' : 'complete'
  let items: KbItemView[] = status === 'none' ? [] : SEEDS.map((s, i) => viewOf(s, i))
  if (state === 'partial') items = items.slice(0, 6)
  if (state === 'running') items = items.slice(0, 3)
  let progress: ResearchProgress | null = null
  let job = 'fake'
  let researchedAt: number | null = status === 'none' || status === 'running' ? null : Date.now() - (state === 'offline' ? 17 : state === 'stale' ? 41 : 0) * DAY - (state === 'ready' || state === 'partial' ? 2 * 3_600_000 : 0)
  const subs = { kbProgress: new Set<(p: ResearchProgress) => void>(), kbChanged: new Set<(p: { jobId: string }) => void>() }
  let timer: ReturnType<typeof setInterval> | null = null
  let tick = 0
  const stop = (): void => { if (timer) clearInterval(timer); timer = null }
  const emitChanged = (): void => subs.kbChanged.forEach(f => f({ jobId: job }))
  const summary = (): KbSummary => ({
    jobId: job, status, researchedAt, items: items.length, sourcedPct: items.length ? Math.round(items.filter(i => i.provenance === 'sourced').length / items.length * 100) : 0,
    sources: items.length ? 14 : 0, costUsd: state === 'partial' ? 0.3 : items.length ? 0.14 : 0, inputChanged: state === 'stale', runId: status === 'running' ? 'run-fake' : state === 'ready' ? 'run-prev' : null,
    coverage: items.length ? SKILLS.map(([name, have, need, inCv, expected]) => ({ skillId: name.toLowerCase().replace(/\s+/g, '-'), name, have: state === 'partial' && have > 6 ? Math.ceil(have / 2) : have, need, expected, inCv })) : [],
  })
  const begin = (): void => {
    status = 'running'; tick = 0; stop(); emitChanged()
    timer = setInterval(() => {
      tick += 1
      const p = PROGRESS[Math.min(tick, PROGRESS.length - 1)]!
      progress = { runId: 'run-fake', ...p, spentUsd: 0.04 * tick, elapsedMs: 12_000 * tick, pages: 17, itemsFound: 31, skipped: 2 }
      subs.kbProgress.forEach(f => f(progress!))
      if (tick >= 6) { stop(); status = 'complete'; items = SEEDS.map((s, i) => viewOf(s, i)); researchedAt = Date.now(); emitChanged() }
    }, 1500)
  }
  if (state === 'running') progress = { runId: 'run-fake', ...PROGRESS[2]!, spentUsd: 0.04, elapsedMs: 72_000, pages: 17, itemsFound: 31, skipped: 2 }
  const find = (id: string): KbItemView => { const it = items.find(i => i.id === id); if (!it) throw new Error('That question is no longer in this base'); return it }
  const swap = (id: string, f: (i: KbItemView) => KbItemView): KbItemView => { const next = f(find(id)); items = items.map(i => (i.id === id ? next : i)); emitChanged(); return next }
  const match = (i: KbItemView, f: KbFilter): boolean =>
    (f.hidden || !i.user.hidden) && (!f.types || f.types.includes(i.type)) && (!f.provenance || f.provenance.includes(i.provenance)) && (!f.text || i.text.toLowerCase().includes(f.text.toLowerCase()))
  const est = (): ResearchEstimate => ({ usdLow: 0.1, usdHigh: 0.2, minutes: 3, backend: state === 'nokey' ? 'none' : 'brave', needsKey: state === 'nokey' })
  return {
    kbSummary: async j => { job = j; return summary() },
    kbList: async (_j, f = {}) => items.filter(i => match(i, f)),
    kbItem: async (_j, id): Promise<KbItemDetail> => {
      const i = find(id); const n = Number(id.slice(3))
      return { ...i, hooks: { storyIds: [], gap: null, cvFacts: [] }, sources: i.provenance === 'sourced' ? Array.from({ length: i.sourceCount }, (_, k) => ({ source: sourceOf(n + k), note: 'Asks for idempotency keys and a reconciliation job.' })) : [] }
    },
    kbEstimate: async () => est(),
    kbResearchStart: async (_j, _o: ResearchOptions) => { if (state === 'nokey' && _o.noSearch !== true) throw new Error('Web search needs a key'); begin(); return { runId: 'run-fake' } },
    kbResearchStop: async () => { stop(); status = items.length ? 'partial' : 'none'; progress = null; emitChanged() },
    kbItemUpdate: async (_j, id, patch) => swap(id, i => ({
      ...i, ...(patch.text !== undefined ? { text: patch.text } : {}), ...(patch.type ? { type: patch.type } : {}), ...(patch.skills ? { skills: patch.skills } : {}), ...(patch.difficulty ? { difficulty: patch.difficulty } : {}),
      user: { ...i.user, ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}), ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}), ...(patch.notes !== undefined ? { notes: patch.notes } : {}), edited: i.user.edited || patch.text !== undefined },
    })),
    kbItemAdd: async (_j, it) => {
      const v: KbItemView = { ...viewOf([it.text, it.type, '', it.difficulty, 'user', '', false, 0], items.length), skills: it.skills, id: `it-u${items.length}`, sourceCount: 0, whyForYou: null }
      items = [v, ...items]; if (status === 'none') status = 'complete'; emitChanged(); return v
    },
    kbItemRemove: async (_j, id) => { items = items.filter(i => i.id !== id); emitChanged() },
    kbExport: async () => '/tmp/careerloom-exports/fake-kb.json',
    interviewConfig: async () => config,
    interviewSetConfig: async patch => { config = { ...config, research: { ...config.research, ...(patch.research as object | undefined) } as InterviewConfig['research'] }; return config },
    kbSearchKeyTest: async () => ({ ok: state !== 'nokey', backend: 'brave' }),
    kbOpenSource: async () => true,
    onKbEvent: <K extends 'kbProgress' | 'kbChanged'>(event: K, cb: (p: KbEvents[K]) => void) => {
      const set = subs[event] as Set<(p: KbEvents[K]) => void>; set.add(cb)
      if (event === 'kbProgress' && progress) queueMicrotask(() => cb(progress as KbEvents[K])) // a tab opened mid-run picks up the latest step
      return () => { set.delete(cb) }
    },
  }
}
