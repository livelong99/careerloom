// Phases with checkpoints in run.json, resume, progress events (plan §3.2): plan → search → fetch+extract → dedupe → generate → commit.
// Everything external is injected (search backends, fetch, LLM, store, state), so the whole run is deterministic on fakes.
import { createHash } from 'node:crypto'

import type { KbItem, KbManifest, KbNotes, ResearchOptions, ResearchProgress, ResearchSourceGroup, SkillNode, SourceRef } from '../types'
import type { KbData } from '../store'
import { classifyHost } from '../sources'
import { createBudget } from './budget'
import { classify } from './classify'
import { dedupe } from './dedupe'
import { extractPage, type Llm } from './extract'
import type { FetchOutcome } from './fetch'
import { enrich, fillGaps } from './generate'
import { evidenceHolds, hasInjection, sanitize, squash } from './guard'
import { confidenceOf, makeItem } from './item'
import { buildPlan, type PlanInput } from './plan'
import type { SearchBackend, SearchResult } from './search/adapter'
import type { Checkpoint, PageRecord, ResearchState } from './state'

export type PipelineDeps = {
  runId: string
  job: Omit<PlanInput, 'depth' | 'backend'>
  /** Changes when the posting, gaps, role or company change (plan.ts `inputHashOf`). */
  inputHash: string
  /** Fallback chain, best first. Empty ⇒ nothing is searched and the bank is generated only. */
  backends: SearchBackend[]
  fetch(url: string, signal: AbortSignal): Promise<FetchOutcome>
  /** One text-only, tool-less model call; `usd` is what it cost. */
  llm(system: string, user: string, signal: AbortSignal): Promise<{ text: string; usd: number }>
  store: { read(jobId: string): KbData; commit(jobId: string, data: Partial<KbData>): KbData }
  state: ResearchState
  enabledGroups?: ReadonlySet<ResearchSourceGroup>
  onProgress(p: ResearchProgress): void
  signal: AbortSignal
  now?: () => number
  concurrency?: number
  runner?: string
  /** Read at commit time: the model the helper tier actually used. */
  model?: () => string | null
}
export type ResearchResult = { status: KbManifest['status']; items: number; sourced: number; generated: number; costUsd: number; searches: number; pages: number; skipped: number }

const PAGE_CAP = { quick: 10, standard: 25, deep: 45 } as const
export const MAX_ITEMS = 400
const FAIL_LIMIT = 2
class BudgetStop extends Error {}

const canonical = (raw: string): string => {
  try {
    const u = new URL(raw)
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) u.searchParams.delete(k)
    u.hostname = u.hostname.toLowerCase()
    return u.toString().replace(/\/$/, '')
  } catch { return raw }
}
const sourceId = (url: string): string => createHash('sha1').update(url).digest('hex').slice(0, 12)

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await fn(items[next++] as T)
  }))
}

export async function runResearch(jobId: string, opts: ResearchOptions, deps: PipelineDeps): Promise<ResearchResult> {
  const now = deps.now ?? Date.now
  const { signal, state } = deps
  const resumed = state.loadRun(jobId)
  const cp: Checkpoint = resumed && resumed.inputHash === deps.inputHash
    ? resumed
    : { schema: 1, jobId, inputHash: deps.inputHash, startedAt: now(), spentUsd: 0, searches: 0, queries: {}, pages: {} }
  const budget = createBudget({ usd: opts.budgetUsd, minutes: opts.minutes, spentUsd: cp.spentUsd }, now)
  let skipped = 0
  let itemsFound = 0
  let stopped = false
  const save = () => { cp.spentUsd = budget.spentUsd(); state.saveRun(cp) }
  const emit = (phase: ResearchProgress['phase'], done: number, total: number, note?: string) =>
    deps.onProgress({ runId: deps.runId, phase, done, total, spentUsd: budget.spentUsd(), elapsedMs: budget.elapsedMs(), pages: Object.values(cp.pages).filter(p => !p.skipped).length, itemsFound, skipped, ...(note ? { note } : {}) })

  const ask: Llm = async (system, user) => {
    signal.throwIfAborted()
    if (budget.exhausted()) throw new BudgetStop('budget')
    const r = await deps.llm(system, user, signal)
    budget.spend(r.usd)
    save()
    return r.text
  }

  // 1. plan
  const plan = buildPlan({ ...deps.job, depth: opts.depth, backend: deps.backends[0]?.id === 'fake' ? 'brave' : (deps.backends[0]?.id ?? 'none') })
  emit('plan', 1, 1, `${plan.queries.length} queries, ${plan.skills.length} skills`)

  // 2. search (sequential: exact budget accounting and a stable order)
  const searchOn = !opts.noSearch && deps.backends.length > 0
  const failures = new Map<string, number>()
  const ordered: Array<{ query: string; results: SearchResult[] }> = []
  if (searchOn) {
    let qi = 0
    for (const query of plan.queries) {
      signal.throwIfAborted()
      emit('search', qi++, plan.queries.length, query)
      let results: SearchResult[] | null = cp.queries[query] ?? null
      if (!results) {
        for (const b of deps.backends) {
          if ((failures.get(b.id) ?? 0) >= FAIL_LIMIT) continue
          const cached = state.getQuery(b.id, query)
          if (cached) { results = cached; break }
          if (budget.wouldExceed(b.usdPerCall) || budget.exhausted()) { stopped = true; break }
          try {
            results = await b.search(query, signal)
            budget.spend(b.usdPerCall); cp.searches++
            state.putQuery(b.id, query, results)
            failures.set(b.id, 0)
            break
          } catch (err) {
            if (signal.aborted) throw err
            budget.spend(b.usdPerCall)
            failures.set(b.id, (failures.get(b.id) ?? 0) + 1)
          }
        }
        if (stopped) break
        if (results) cp.queries[query] = results; else skipped++
        save()
      }
      if (results) ordered.push({ query, results })
    }
  }

  // 3. pick pages: allowed hosts only, by trust then search rank
  const seenUrl = new Set<string>()
  const picks: Array<{ url: string; title: string; score: number }> = []
  ordered.forEach(({ results }, qi) => results.forEach((r, rank) => {
    const url = canonical(r.url)
    if (seenUrl.has(url)) return
    seenUrl.add(url)
    const c = classifyHost(url, deps.job.company)
    if (!c.allowed || (c.group && deps.enabledGroups && !deps.enabledGroups.has(c.group))) { skipped++; return }
    picks.push({ url, title: r.title, score: c.trust * 10 - rank - qi * 0.01 })
  }))
  const urls = picks.map((p, i) => ({ ...p, i })).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, PAGE_CAP[opts.depth])

  // 4. fetch + extract, concurrency 6 (the fetcher itself spaces requests per host)
  let done = 0
  await pool(urls, deps.concurrency ?? 6, async ({ url, title }) => {
    try {
      signal.throwIfAborted()
      if (cp.pages[url]) return
      const cached = state.getPage(url)
      if (cached) { cp.pages[url] = cached; if (cached.skipped) skipped++; return }
      if (budget.exhausted()) { stopped = true; return }
      emit('fetch', done, urls.length, url)
      const out = await deps.fetch(url, signal)
      const meta = classifyHost(url, deps.job.company)
      const base = { url, title: sanitize(title, 200), kind: meta.kind, licence: meta.licence, trust: meta.trust, at: now() }
      if (!out.ok) { cp.pages[url] = { ...base, contentHash: '', candidates: [], notes: [], skipped: out.reason }; state.putPage(cp.pages[url]); skipped++; return }
      const { page } = out
      if (hasInjection(page.text)) { cp.pages[url] = { ...base, contentHash: page.contentHash, candidates: [], notes: [], skipped: 'injection' }; state.putPage(cp.pages[url]); skipped++; return }
      emit('extract', done, urls.length, url)
      const ex = await extractPage(page.text, ask)
      const rec: PageRecord = {
        ...base, contentHash: page.contentHash,
        candidates: ex.candidates.filter(c => evidenceHolds(c, page.text)).map(({ evidence: _e, ...c }) => c),
        notes: ex.notes.filter(n => evidenceHolds(n, page.text)).map(({ evidence: _e, ...n }) => n),
      }
      cp.pages[url] = rec
      state.putPage(rec)
      itemsFound += rec.candidates.length
    } catch (err) {
      if (signal.aborted) throw err
      if (err instanceof BudgetStop) stopped = true; else skipped++
    } finally { done++; save() }
  })
  signal.throwIfAborted()

  // 5. assemble in search order, so the result never depends on which fetch finished first
  emit('dedupe', 0, 1)
  const skills: SkillNode[] = plan.skills
  const byName = new Map(skills.map(s => [s.name.toLowerCase(), s.id]))
  const sources: SourceRef[] = []
  const notes: KbNotes = { company: [], role: [], interviewerStyle: [], loop: [] }
  const noteSeen = new Set<string>()
  const trustOf = new Map<string, 0 | 1 | 2>()
  let raw: KbItem[] = []
  for (const { url } of urls) {
    const rec = cp.pages[url]
    if (!rec || rec.skipped || (rec.candidates.length === 0 && rec.notes.length === 0)) continue
    const id = sourceId(url)
    const host = new URL(url).hostname
    sources.push({ id, url, title: rec.title, host, kind: rec.kind, licence: rec.licence, fetchedAt: rec.at, contentHash: rec.contentHash, trust: rec.trust })
    trustOf.set(id, rec.trust)
    for (const n of rec.notes) {
      const k = `${n.kind}:${squash(n.text)}`
      if (!noteSeen.has(k) && notes[n.kind].length < 6) { noteSeen.add(k); notes[n.kind].push(n.text) }
    }
    for (const c of rec.candidates) {
      let cls
      try { cls = await classify(c.text, skills, ask, c.type) } catch (err) { if (err instanceof BudgetStop) { stopped = true; cls = await classify(c.text, skills, undefined, c.type) } else throw err }
      const named = (c.skills ?? []).map(s => byName.get(s.toLowerCase())).filter((s): s is string => !!s)
      raw.push(makeItem({ text: c.text, type: cls.type, skills: [...new Set([...cls.skills, ...named])], difficulty: cls.difficulty, provenance: 'sourced', sources: [{ sourceId: id, note: c.note }], trust: rec.trust }))
    }
  }
  raw = dedupe(raw).map(it => {
    const trust = it.sources.reduce<0 | 1 | 2>((m, s) => Math.max(m, trustOf.get(s.sourceId) ?? 0) as 0 | 1 | 2, 0)
    return { ...it, seen: it.sources.length, confidence: confidenceOf('sourced', it.sources.length, trust) }
  })
  signal.throwIfAborted()
  emit('dedupe', 1, 1, `${raw.length} distinct`)

  // keep what the user already curated: their own items and anything pinned, hidden or edited
  const existing = deps.store.read(jobId)
  const mine = existing.items.filter(i => i.provenance === 'user' || i.user.pinned || i.user.hidden || i.user.edited)
  const known = new Set(raw.map(i => i.id))
  let items = [...raw, ...mine.filter(i => !known.has(i.id))]

  // 6. generate: outlines/rubrics for the sourced, gap-fill for under-covered skills (cap 30 %)
  emit('generate', 0, 2)
  try { items = await enrich(items, ask) } catch (err) { if (err instanceof BudgetStop) stopped = true; else if (signal.aborted) throw err }
  emit('generate', 1, 2)
  try { items = await fillGaps(items, skills, ask, deps.job.title) } catch (err) { if (err instanceof BudgetStop) stopped = true; else if (signal.aborted) throw err }
  emit('generate', 2, 2)
  signal.throwIfAborted() // classify/enrich/fillGaps swallow the abort error; a stopped run must not commit a "complete" KB
  items = items.sort((a, b) => Number(b.provenance !== 'generated') - Number(a.provenance !== 'generated') || b.confidence - a.confidence).slice(0, MAX_ITEMS)
  itemsFound = items.length

  // 7. commit atomically through the store; the checkpoint goes only after the KB is safely written
  emit('commit', 0, 1)
  const sourced = items.filter(i => i.provenance === 'sourced').length
  const generated = items.filter(i => i.provenance === 'generated').length
  const coverage: Record<string, number> = Object.fromEntries(skills.map(s => [s.id, items.filter(i => i.skills.includes(s.id)).length]))
  const status: KbManifest['status'] = items.length === 0 ? 'failed' : stopped || budget.exhausted() ? 'partial' : 'complete'
  const pages = Object.values(cp.pages).filter(p => !p.skipped).length
  deps.store.commit(jobId, {
    manifest: { schema: 1, jobId, inputHash: deps.inputHash, researchedAt: now(), runner: deps.runner ?? 'research', model: deps.model?.() ?? null, costUsd: +budget.spentUsd().toFixed(4), searches: cp.searches, pages, status, coverage },
    items, sources, skills, notes,
  })
  state.clearRun(jobId)
  emit('commit', 1, 1, status)
  return { status, items: items.length, sourced, generated, costUsd: budget.spentUsd(), searches: cp.searches, pages, skipped }
}
