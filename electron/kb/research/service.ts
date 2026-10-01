// Research as a tracked Run (kind `research`, mode `job-research`, jobId stamped) so it shows on the Runs page and can be cancelled
// there (plan §2, §3.2 step 1). Pure of electron: every side effect arrives through `ServiceEnv` (wiring.ts supplies the real ones).
import type { RunRecord, RunStart } from '../../context'
import type { JobPosting } from '../../job-view/types'
import type { InterviewConfig, KbEvents, ResearchEstimate, ResearchOptions, SearchBackendId } from '../types'
import type { KbStore } from '../store'
import { createBraveBackend } from './search/brave'
import { createExaBackend } from './search/exa'
import { createSerperBackend } from './search/serper'
import { createSearxngBackend } from './search/searxng'
import type { SearchBackend } from './search/adapter'
import { createFetcher, type FetchDeps } from './fetch'
import { runResearch, type PipelineDeps } from './pipeline'
import { inputHashOf } from './plan'
import type { ResearchState } from './state'

export type JobFacts = { title: string; company: string; posting: JobPosting | null; /** CV keywords the job wants that the CV lacks. */ gaps: string[]; cv: string; userName?: string }
export type ServiceEnv = {
  config(): InterviewConfig
  secret(id: 'brave' | 'exa' | 'serper'): string | null
  /** Throws when the job is no longer in the list. */
  job(jobId: string): JobFacts
  /** One tool-less helper-tier call; `tokens` null when the runner does not say. */
  llm(prompt: string, jobId: string): Promise<{ text: string; tokens: number | null; model: string | null }>
  store(): Pick<KbStore, 'read' | 'commit'>
  state: ResearchState
  net: Pick<FetchDeps, 'http' | 'resolve' | 'cdp' | 'firecrawl' | 'now' | 'sleep' | 'userAgent'>
  launch(record: RunStart, work: (log: (t: string) => void, run: RunRecord) => Promise<void>, onExit?: (run: RunRecord) => void): RunRecord
  getRun(id: string): RunRecord | undefined
  emit<K extends 'kbProgress' | 'kbChanged'>(event: K, payload: KbEvents[K]): void
  /** Dollars for a call: the model's table price when known, else a conservative flat rate. */
  priceCall(model: string | null, tokens: number | null): number
  /** Backends for tests; default builds the real adapters from keys/config. */
  backends?: (cfg: InterviewConfig) => SearchBackend[]
  fetch?: typeof fetch
}

const DEPTH = { quick: { searches: 8, pages: 10, minutes: 1.5 }, standard: { searches: 18, pages: 25, minutes: 3 }, deep: { searches: 28, pages: 45, minutes: 6 } } as const
const CALL_USD = { low: 0.002, high: 0.006 }
const ID_MAX = 2000

export class ResearchRefused extends Error {}

export function createResearchService(env: ServiceEnv) {
  const live = new Map<string, { runId: string; ac: AbortController }>()

  function backends(cfg: InterviewConfig): SearchBackend[] {
    if (env.backends) return env.backends(cfg)
    const { search } = cfg.research
    const order: SearchBackendId[] = [...new Set([search.backend, ...search.fallbackOrder])]
    const out: SearchBackend[] = []
    for (const id of order) {
      if (id === 'searxng') { if (search.searxngUrl) out.push(createSearxngBackend({ baseUrl: search.searxngUrl, fetch: env.fetch })); continue }
      const key = env.secret(id)
      if (!key) continue
      out.push({ brave: createBraveBackend, exa: createExaBackend, serper: createSerperBackend }[id]({ key, fetch: env.fetch }))
    }
    return out
  }

  function clampOpts(o: ResearchOptions, cfg: InterviewConfig): ResearchOptions {
    if (!['quick', 'standard', 'deep'].includes(o?.depth)) throw new ResearchRefused('Pick a research depth: quick, standard or deep.')
    const cap = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
    return { depth: o.depth, budgetUsd: cap(o.budgetUsd, cfg.research.budgetUsd, 0.05, 2), minutes: cap(o.minutes, cfg.research.minutes, 1, 20), allowAgent: false, ...(o.noSearch ? { noSearch: true } : {}) }
  }

  const checkId = (jobId: unknown): string => {
    if (typeof jobId !== 'string' || jobId.trim() === '' || jobId.length > ID_MAX) throw new ResearchRefused('That job id is not valid.')
    return jobId
  }

  function estimate(jobId: string, raw: ResearchOptions): ResearchEstimate {
    checkId(jobId)
    const cfg = env.config()
    const o = clampOpts(raw, cfg)
    const list = o.noSearch ? [] : backends(cfg)
    const d = DEPTH[o.depth]
    const price = list[0]?.usdPerCall ?? 0
    const search = o.noSearch ? 0 : d.searches * price
    const pages = o.noSearch ? 0 : d.pages
    return {
      usdLow: +(search + pages * 0.5 * CALL_USD.low).toFixed(3),
      usdHigh: +Math.min(o.budgetUsd, search + pages * CALL_USD.high + 0.03).toFixed(3),
      minutes: d.minutes,
      backend: list[0] ? (list[0].id === 'fake' ? 'brave' : list[0].id) : 'none',
      needsKey: !o.noSearch && list.length === 0,
    }
  }

  function start(jobId: string, raw: ResearchOptions): { runId: string } {
    checkId(jobId)
    const cfg = env.config()
    if (cfg.research.consentVersion === null) throw new ResearchRefused('Review what research sends and fetches first (Settings › Interview prep), then start again.')
    const o = clampOpts(raw, cfg)
    if (live.has(jobId)) throw new ResearchRefused('Research for this job is already running.')
    const list = o.noSearch ? [] : backends(cfg)
    if (!o.noSearch && list.length === 0) throw new ResearchRefused('Add a search key in Settings › API keys, set up SearXNG, or run without web search (generated questions only).')
    const facts = env.job(jobId)
    const posting = facts.posting
    const ac = new AbortController()
    const enabled = new Set(Object.entries(cfg.research.sources).filter(([, on]) => on).map(([g]) => g)) as PipelineDeps['enabledGroups']
    const title = facts.title || posting?.title || 'Untitled role'
    const company = facts.company || posting?.company || ''

    const run = env.launch({ runner: 'research', mode: 'job-research', label: `Job research · ${title}`, input: jobId, jobId }, async (log, runRec) => {
      // The Runs page cancels a task by flipping its status; the pipeline watches for it.
      const watch = setInterval(() => { if (runRec.status === 'cancelled') ac.abort() }, 250)
      let lastPhase = ''
      let model: string | null = null
      try {
        log(`Researching ${title}${company ? ` at ${company}` : ''} · ${o.depth} · cap $${o.budgetUsd.toFixed(2)} / ${o.minutes} min\n`)
        const fetchPage = createFetcher({ ...env.net, company, enabledGroups: enabled })
        const deps: PipelineDeps = {
          runId: runRec.id, signal: ac.signal, now: env.net.now, concurrency: 6, runner: 'research',
          job: {
            jobId, title, company, seniority: posting?.seniority ?? null, techStack: posting?.techStack ?? [], skills: posting?.skills ?? [],
            requirements: [...(posting?.requirements.required ?? []), ...(posting?.requirements.preferred ?? [])], gaps: facts.gaps, cv: facts.cv, ...(facts.userName ? { userName: facts.userName } : {}),
          },
          inputHash: inputHashOf({ jd: { stack: posting?.techStack ?? [], skills: posting?.skills ?? [], req: posting?.requirements ?? null }, gaps: facts.gaps, role: title, company }),
          backends: list, fetch: fetchPage, store: env.store(), state: env.state, enabledGroups: enabled,
          llm: async (system, user) => {
            const r = await env.llm(`${system}\n\n${user}`, jobId)
            model = r.model
            return { text: r.text, usd: env.priceCall(r.model, r.tokens) }
          },
          onProgress: p => {
            env.emit('kbProgress', p)
            if (p.phase !== lastPhase) { lastPhase = p.phase; log(`[${p.phase}] ${p.note ?? ''} · $${p.spentUsd.toFixed(3)} · ${p.itemsFound} items, ${p.pages} pages, ${p.skipped} skipped\n`) }
          },
        }
        const res = await runResearch(jobId, o, { ...deps, model: () => model })
        log(`\n${res.status === 'complete' ? '✓' : res.status === 'partial' ? '◐' : '✗'} ${res.status}: ${res.items} questions (${res.sourced} sourced, ${res.generated} generated) from ${res.pages} pages · ${res.searches} searches · $${res.costUsd.toFixed(3)}\n`)
        if (res.status === 'failed') throw new Error('Research found nothing usable. Try again, or add a search key.')
        if (res.status === 'partial') log('The budget or time cap was reached, so this knowledge base is partial. Run research again to extend it.\n')
      } finally {
        clearInterval(watch)
        live.delete(jobId)
        env.emit('kbChanged', { jobId })
      }
    })
    live.set(jobId, { runId: run.id, ac })
    return { runId: run.id }
  }

  function stop(runId: string): void {
    const entry = [...live.values()].find(l => l.runId === runId)
    const run = env.getRun(runId)
    if (!entry || !run || run.mode !== 'job-research') return
    if (run.status === 'running') run.status = 'cancelled'
    entry.ac.abort()
  }

  return { estimate, start, stop, running: (jobId: string): string | null => live.get(jobId)?.runId ?? null }
}
export type ResearchService = ReturnType<typeof createResearchService>
