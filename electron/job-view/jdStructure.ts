// Posting text -> JobPosting. Deterministic pre-pass first; ONE small-model call fills only the gaps
// (strict JSON, every field nullable, ~8k chars in). Invalid output gets one repair retry, then the
// deterministic result stands: the UI never waits on, or breaks because of, the model.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { extractJson } from '../ats/prompt'
import { NO_TOOLS } from '../humanizer'
import { extractSkills, familyOf } from '../ats/skills'
import type { JobPosting, JobViewMeta } from './types'

export const SCHEMA_VERSION = 1
export const PROMPT_VERSION = 2
const SUMMARY_WORDS = 60
const THEME_FAMILIES = new Set(['practice', 'architecture', 'leadership', 'ml', 'llm', 'security', 'process', 'data-science'])
const MODEL_INPUT_CAP = 8000

export type ModelCall = (prompt: string) => Promise<{ text: string; tokens: number | null; model: string | null }>
type Meta = { title: string | null; company: string | null; location: string | null }

const EMPTY = (m: Meta): JobPosting => ({ title: m.title, company: m.company, location: m.location, workMode: null, employmentType: null, seniority: null, salary: null, summary: null, responsibilities: [], requirements: { required: [], preferred: [] }, benefits: [], aboutCompany: null, techStack: [], skills: [], fullDescription: null, deadline: null })

const words = (s: string) => s.split(/\s+/).filter(Boolean)
/** First sentences up to `n` words, ending on a sentence boundary when it can. */
export function clipWords(s: string, n = SUMMARY_WORDS): string {
  const w = words(s)
  if (w.length <= n) return s.trim()
  const cut = w.slice(0, n).join(' ')
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return end > cut.length / 2 ? cut.slice(0, end + 1) : `${cut.replace(/[,;:]$/, '')}…`
}

const SECTION_KINDS: Array<[string, RegExp]> = [
  ['summary', /about the (role|job|position|team)|overview|the role|summary|position|stelle/i],
  ['preferred', /nice to have|preferred|bonus|plus|desirable|wunsch/i],
  ['required', /what you.?ll bring|requirements?|qualifications?|you have|must.have|who you are|what we.?re looking|skills|anforderung|profil/i],
  ['responsibilities', /what you.?ll do|responsibilit|duties|in this role|your role|day.to.day|aufgaben|the work/i],
  ['benefits', /benefits|perks|what we offer|why join|we offer|compensation and|supports? full|bieten/i],
  ['about', /about (us|the company|[A-Z][\w&. -]{1,40}$)|who we are|our (mission|story)|company|[uü]ber uns/i],
]
const heading = (l: string) => {
  const t = l.trim()
  const m = t.match(/^#{1,6}\s+(.+)$/)?.[1] ?? t.match(/^\*\*([^*]{2,80})\*\*:?$/)?.[1] ?? (/^[A-Z][^.!?]{2,60}:$/.test(t) ? t.slice(0, -1) : null)
  return m ? m.replace(/\*\*/g, '').trim() : null
}
const bullet = (l: string) => l.match(/^\s*(?:[-*•·]|\d+[.)])\s+(.+)$/)?.[1]?.trim() ?? null
const money = (s: string) => Number(s.replace(/[,\s]/g, '')) * (/k$/i.test(s) ? 1000 : 1)

function salaryOf(text: string): JobPosting['salary'] {
  const m = text.match(/(?:(US\$|\$|€|£|₹)|\b(USD|EUR|GBP|INR|CAD)\b)\s?(\d[\d,.]*\s?[kK]?)\s*(?:-|–|—|to)\s*(?:(?:US\$|\$|€|£|₹)\s?)?(\d[\d,.]*\s?[kK]?)\s*(USD|EUR|GBP|INR|CAD)?/)
  if (!m) return null
  const sym: Record<string, string> = { $: 'USD', 'US$': 'USD', '€': 'EUR', '£': 'GBP', '₹': 'INR' }
  const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 40)
  const period = /(?:per|a|\/)\s*(year|yr|annum|month|hour|hr)|annual|yearly/i.exec(after)
  const p = period ? (period[1] ?? 'year').toLowerCase().replace(/^(yr|annum)$/, 'year').replace('hr', 'hour') : null
  return { min: money(m[3]!), max: money(m[4]!), currency: m[5] ?? m[2] ?? sym[m[1] ?? ''] ?? null, period: p, text: m[0].trim() }
}

export function deterministicPosting(jd: string, meta: Meta): JobPosting {
  const p = EMPTY(meta)
  const lines = (jd ?? '').split('\n')
  let kind: string | null = null
  const prose: Record<string, string[]> = {}
  for (const l of lines) {
    const h = heading(l)
    if (h) { kind = SECTION_KINDS.find(([, re]) => re.test(h))?.[0] ?? null; continue }
    if (!kind || !l.trim()) continue
    const b = bullet(l)
    if (kind === 'required') (b ? p.requirements.required : (prose.required ??= [])).push(b ?? l.trim())
    else if (kind === 'preferred') (b ? p.requirements.preferred : (prose.preferred ??= [])).push(b ?? l.trim())
    else if (kind === 'responsibilities') (b ? p.responsibilities : (prose.responsibilities ??= [])).push(b ?? l.trim())
    else if (kind === 'benefits') (b ? p.benefits : (prose.benefits ??= [])).push(b ?? l.trim())
    else (prose[kind] ??= []).push(b ?? l.trim())
  }
  // Plain sentences under a list-type heading count as one item each.
  for (const k of ['responsibilities', 'benefits'] as const) if (!p[k].length) p[k] = prose[k] ?? []
  if (!p.requirements.required.length) p.requirements.required = prose.required ?? []
  if (!p.requirements.preferred.length) p.requirements.preferred = prose.preferred ?? []
  const full = prose.summary?.join(' ') || null
  p.fullDescription = full
  p.summary = full && words(full).length <= SUMMARY_WORDS ? full : null // longer: the model distils it (clipped if it cannot)
  p.aboutCompany = prose.about?.join(' ') || null
  const low = (jd ?? '').toLowerCase()
  p.workMode = /\bhybrid\b/.test(low) ? 'hybrid' : /\b(fully )?remote\b/.test(low) && !/not remote|no remote/.test(low) ? 'remote' : /\bon.?site\b|\bin.office\b/.test(low) ? 'onsite' : null
  p.employmentType = /full.time/i.test(jd) ? 'Full-time' : /part.time/i.test(jd) ? 'Part-time' : /\bcontract(or)?\b/i.test(jd) ? 'Contract' : /\bintern(ship)?\b/i.test(jd) ? 'Internship' : null
  p.seniority = /\b(principal|staff|senior|lead|junior|entry.level|intern|mid.level)\b/i.exec(`${meta.title ?? ''} ${(jd ?? '').slice(0, 2000)}`)?.[1]?.toLowerCase().replace(/^./, c => c.toUpperCase()) ?? null
  p.salary = salaryOf(jd ?? '')
  p.location ??= /\blocation:\s*([^\n.]{2,60})/i.exec(jd ?? '')?.[1]?.trim() ?? null
  const found = [...extractSkills(jd ?? '')]
  p.techStack = found.filter(k => !THEME_FAMILIES.has(familyOf(k) ?? '')).slice(0, 15)
  p.skills = found.filter(k => THEME_FAMILIES.has(familyOf(k) ?? '')).slice(0, 12)
  return p
}

const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const arr = (v: unknown) => (Array.isArray(v) ? v.flatMap(x => (typeof x === 'string' && x.trim() ? [x.trim()] : [])) : [])
const MODES = new Set(['remote', 'hybrid', 'onsite'])

/** Tolerant: anything mistyped becomes null/empty rather than failing the whole object. */
export function validatePosting(raw: unknown): JobPosting {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const sal = o.salary && typeof o.salary === 'object' ? o.salary as Record<string, unknown> : null
  const req = (o.requirements && typeof o.requirements === 'object' ? o.requirements : {}) as Record<string, unknown>
  return {
    title: s(o.title), company: s(o.company), location: s(o.location),
    workMode: typeof o.workMode === 'string' && MODES.has(o.workMode) ? o.workMode as JobPosting['workMode'] : null,
    employmentType: s(o.employmentType), seniority: s(o.seniority),
    salary: sal ? { min: n(sal.min), max: n(sal.max), currency: s(sal.currency), period: s(sal.period), text: s(sal.text) } : null,
    summary: s(o.summary) ? clipWords(s(o.summary)!, 80) : null, responsibilities: arr(o.responsibilities),
    requirements: { required: arr(req.required), preferred: arr(req.preferred) },
    benefits: arr(o.benefits), aboutCompany: s(o.aboutCompany), techStack: arr(o.techStack).slice(0, 15), skills: arr(o.skills).slice(0, 12), fullDescription: null, deadline: s(o.deadline),
  }
}

const isEmpty = (v: unknown): boolean => v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every(isEmpty))
export const missingFields = (p: JobPosting): string[] => Object.entries(p).filter(([, v]) => isEmpty(v)).map(([k]) => k)

/** Merge: deterministic values win; the model only fills what is empty. */
function fill(base: JobPosting, extra: JobPosting): JobPosting {
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(extra)) if (isEmpty(out[k]) && !isEmpty(v)) out[k] = v
  const r = base.requirements
  out.requirements = { required: r.required.length ? r.required : extra.requirements.required, preferred: r.preferred.length ? r.preferred : extra.requirements.preferred }
  return out as JobPosting
}

const SCHEMA = `{"location":string|null,"workMode":"remote"|"hybrid"|"onsite"|null,"employmentType":string|null,"seniority":string|null,"salary":{"min":number|null,"max":number|null,"currency":string|null,"period":string|null,"text":string|null}|null,"summary":string|null,"responsibilities":string[],"requirements":{"required":string[],"preferred":string[]},"benefits":string[],"aboutCompany":string|null,"techStack":string[],"skills":string[],"deadline":string|null}`

export function fillPrompt(jd: string, missing: string[]): string {
  return `You turn a job posting into structured fields. Reply with ONE JSON object and nothing else, no code fence. ${NO_TOOLS}
Fill ONLY these keys, use null (or []) for anything the posting does not state, never guess, never add facts: ${missing.join(', ')}.
Copy wording from the posting; keep each list item short. summary: a distilled description of the role in at most 60 words, not a copy of the posting. techStack: tools, languages, frameworks and platforms only (max 15). skills: themes and competencies such as leadership or system design (max 10). Schema of the whole object for reference: ${SCHEMA}

POSTING:
${jd.slice(0, MODEL_INPUT_CAP)}`
}
const repairPrompt = (err: string) => `Your previous reply was not usable (${err}). Reply again with ONE valid JSON object matching the schema, nothing else.`

const hash = (jd: string) => createHash('sha256').update(`${SCHEMA_VERSION}|${PROMPT_VERSION}|${jd}`).digest('hex').slice(0, 40)
export type Structured = { posting: JobPosting; meta: Pick<JobViewMeta, 'filled' | 'model' | 'tokens'> }
const cacheFile = (dir: string, jd: string, meta: Meta) => join(dir, `${hash(`${meta.title}|${meta.company}|${jd}`)}.json`)
/** A previous structuring of exactly this text (and schema/prompt version), if any. */
export function cachedPosting(jd: string, meta: Meta, dir: string): Structured | null {
  try { return JSON.parse(readFileSync(cacheFile(dir, jd, meta), 'utf8')) as Structured } catch { return null }
}

export async function structurePosting(jd: string, meta: Meta, deps: { run: ModelCall | null; cacheDir: string; now(): number }): Promise<Structured> {
  const file = cacheFile(deps.cacheDir, jd, meta)
  const hit = cachedPosting(jd, meta, deps.cacheDir)
  if (hit) return hit
  const base = deterministicPosting(jd, meta)
  const missing = missingFields(base).filter(k => !['title', 'company', 'deadline', 'fullDescription', 'skills', 'salary'].includes(k) || (k === 'salary' && /salary|compensation|pay|\$|€|£/i.test(jd)))
  let out: Structured = { posting: base, meta: { filled: 'deterministic', model: null, tokens: null } }
  if (missing.length && deps.run && jd.trim()) {
    let tokens = 0, model: string | null = null, prompt = fillPrompt(jd, missing), ok = false
    try {
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        const r = await deps.run(prompt)
        tokens += r.tokens ?? 0; model = r.model
        const json = extractJson(r.text)
        try { out = { posting: fill(base, validatePosting(JSON.parse(json ?? ''))), meta: { filled: 'model', model, tokens } }; ok = true } catch (e) { console.error('job view: unusable model reply:', r.text.slice(-400)); prompt = repairPrompt(e instanceof Error ? e.message : 'invalid JSON') }
      }
    } catch { /* runner missing or failed: fall through */ }
    if (!ok) out = { posting: base, meta: { filled: 'model-failed', model, tokens: tokens || null } }
  }
  out.posting.summary ??= out.posting.fullDescription ? clipWords(out.posting.fullDescription) : null
  // A failed model run is not cached: the next open may succeed.
  if (out.meta.filled !== 'model-failed') {
    try { mkdirSync(deps.cacheDir, { recursive: true }); writeFileSync(file, JSON.stringify(out)) } catch { /* cache is best-effort */ }
  }
  return out
}
