import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

import type {
  JobListing, PrescreenBucket, PrescreenEntry, PrescreenGate, PrescreenMethod, PrescreenPolicy, PrescreenSignals as Signals,
} from './contract'
import { canonicalCountry, parseLocation } from './prescreen-geo'

// Pure pieces of the job pre-screen: profile read, the rule gates (location → function → seniority),
// the model gate, training labels, and the persisted store. No Electron imports.

export type { PrescreenBucket, PrescreenEntry, PrescreenGate, PrescreenMethod, PrescreenPolicy, Signals }
export type PrescreenMap = Record<string, PrescreenEntry>
/** `targets`: weighted role strings the base model maps to target occupations (primary 1, archetypes by fit, headline and current CV role 0.5). */
export type Profile = { roles: string[]; levels: string[]; headline: string; location: string; countries: string[]; years: number | null; targets: Array<[string, number]> }

/** Role nouns of another function: always drop unless the user targets them. */
const DENY_ROLE = [
  'manager', 'director', 'vice president', 'vp', 'chief of staff', 'counsel', 'attorney', 'paralegal', 'recruiter',
  'account executive', 'accountant', 'representative', 'executive assistant', 'hrbp', 'analyst', 'strategist', 'business partner',
]
/** Function areas: drop only when the title has no target-role word ("Engineer, Sales Platform" stays). */
const DENY_AREA = [
  'sales', 'business development', 'legal', 'recruiting', 'talent acquisition', 'people partner', 'payroll', 'accounting',
  'tax', 'finance', 'procurement', 'marketing', 'renewals', 'customer success', 'candidate experience', 'communications', 'events',
]
const STOP = new Set(['senior', 'junior', 'staff', 'principal', 'lead', 'mid', 'iii', 'ii', 'sde', 'and', 'or', 'the', 'of', 'a', 'an', 'for', 'with', 'full', 'stack'])
/** Title word → typical minimum years; first match wins, most senior first. */
const SENIORITY: Array<[RegExp, string, number]> = [
  [/\b(distinguished|fellow)\b/, 'Distinguished', 12],
  [/\b(chief|cto|vp|vice president)\b/, 'VP', 10],
  [/\bhead of\b/, 'Head-of', 10],
  [/\bdirector\b/, 'Director', 10],
  [/\bprincipal\b/, 'Principal', 10],
  [/\bstaff\b/, 'Staff', 8],
]

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [])
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean)
const hasPhrase = (text: string, phrase: string) => new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text)
const FIT_WEIGHT: Record<string, number> = { primary: 1, secondary: 0.5, adjacent: 0.25 }
const yearsIn = (text: string) => { const m = /(\d{1,2})\+?\s*(?:years|yrs)\b/i.exec(text); return m ? Number(m[1]) : null }

/** config/profile.yml + modes/_profile.md (+ cv.md for years) → what the screen needs. */
export function readProfile(profileYml: string, profileMd: string, cvMd = ''): Profile {
  let doc: Record<string, any> = {}
  try { doc = (parse(profileYml) as Record<string, any>) ?? {} } catch { /* unreadable profile → empty */ }
  const tr = doc.target_roles ?? {}
  const archetypes = Array.isArray(tr.archetypes) ? tr.archetypes as Array<Record<string, unknown>> : []
  const mdLine = profileMd.split('\n').map(l => l.trim()).find(l => l && !/^(#|<!--|\||[-=]{3}|\*\*level)/i.test(l) && !l.endsWith('-->')) ?? ''
  const loc = doc.location ?? {}
  const narrative = doc.narrative ?? {}
  const headline = (typeof narrative.headline === 'string' ? narrative.headline : mdLine).replace(/\s+/g, ' ').trim()
  const experience = cvMd.split('## Experience')[1]?.split(/^## /m)[0] ?? ''
  const cvRole = /^### (.+)$/m.exec(experience)?.[1]?.split(' — ')[0]
  const targets: Array<[string, number]> = [
    ...asStrings(tr.primary).map((s): [string, number] => [s, 1]),
    ...archetypes.filter(a => typeof a.name === 'string' && a.name).map((a): [string, number] => [String(a.name), FIT_WEIGHT[String(a.fit)] ?? 0.5]),
    ...[typeof narrative.headline === 'string' ? narrative.headline : '', cvRole ?? ''].map((s): [string, number] => [s, 0.5]),
  ].map(([s, w]): [string, number] => [s.replace(/\s+/g, ' ').trim(), w]).filter(([s]) => s)
  const countries = [loc.country, ...asStrings(loc.authorized_in)].filter((x): x is string => typeof x === 'string').map(c => canonicalCountry(c) ?? c.trim())
  return {
    roles: [...asStrings(tr.primary), ...archetypes.filter(a => a.fit !== 'adjacent').map(a => String(a.name ?? '')).filter(Boolean)],
    levels: [...new Set(archetypes.map(a => a.level).filter((l): l is string => typeof l === 'string'))],
    headline,
    location: [loc.city, loc.country].filter(x => typeof x === 'string' && x).join(', ') || String(doc.candidate?.location ?? ''),
    countries: [...new Set(countries.filter(Boolean))],
    years: [narrative.exit_story, narrative.headline, profileMd, cvMd].filter((x): x is string => typeof x === 'string').map(yearsIn).find(y => y !== null) ?? null,
    targets,
  }
}

/** Profile defaults: its countries, remote-anywhere off, its years. */
export const defaultPolicy = (p: Profile): PrescreenPolicy => ({ countries: p.countries, remoteAnywhere: false, years: p.years })

/** Validate a policy from the renderer (trust boundary). */
export function cleanPolicy(v: unknown): PrescreenPolicy {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const years = typeof o.years === 'number' && Number.isFinite(o.years) && o.years >= 0 && o.years <= 60 ? Math.round(o.years) : null
  return { countries: [...new Set(asStrings(o.countries).map(c => canonicalCountry(c) ?? c.trim()).slice(0, 50))], remoteAnywhere: o.remoteAnywhere === true, years }
}

/** Bump when the deny lists, gates or dictionary change: stored results then read as stale. */
const POLICY_VERSION = 'v3'
export const profileHash = (p: Profile, policy: PrescreenPolicy) => createHash('sha256').update(POLICY_VERSION + JSON.stringify([p, policy])).digest('hex').slice(0, 16)

/** Keyword read of one title against the profile; deny words the user targets never count. */
export function keywordSignals(title: string, p: Profile): Signals {
  const t = title.toLowerCase()
  const targets = p.roles.join(' ').toLowerCase()
  const tokens = new Set(words(targets).filter(w => w.length > 1 && !STOP.has(w)))
  const targetRole = words(t).find(w => tokens.has(w.replace(/ing$/, ''))) ?? null // engineering → engineer
  const hit = (list: string[]) => list.find(d => !hasPhrase(targets, d) && hasPhrase(t, d)) ?? null
  return { otherFunction: hit(DENY_ROLE) ?? (targetRole ? null : hit(DENY_AREA)), targetRole }
}

export type LocationVerdict = { verdict: 'pass' | 'fail' | 'unsure'; reason: string } | null

/** Any site in an allowed country passes; remote-anywhere / a region with an allowed country passes only
 *  when the policy allows it (else unsure); every site in other countries fails. Unknown sites → no signal. */
export function locationGate(location: string | null, policy: PrescreenPolicy): LocationVerdict {
  const allowed = new Set(policy.countries)
  const sites = parseLocation(location)
  if (!allowed.size || !sites.length) return null
  const want = policy.countries.join(', ')
  const inAllowed = sites.find(s => s.kind === 'country' && allowed.has(s.country))
  if (inAllowed?.kind === 'country') return { verdict: 'pass', reason: `Location: ${inAllowed.country}` }
  const broad = sites.find(s => s.kind === 'anywhere' || (s.kind === 'region' && s.countries.some(c => allowed.has(c))))
  if (broad) {
    const what = broad.kind === 'region' ? broad.name : 'remote anywhere'
    return policy.remoteAnywhere ? { verdict: 'pass', reason: `Location: ${what}` } : { verdict: 'unsure', reason: `Location: ${what} — check it hires in ${want}` }
  }
  if (sites.some(s => s.kind === 'unknown')) return null
  const elsewhere = [...new Set(sites.map(s => (s.kind === 'country' ? s.country : s.kind === 'region' ? s.name : '')))].filter(Boolean)
  return { verdict: 'fail', reason: `Location: ${elsewhere.join(', ')} — you're searching ${want}` }
}

/** Title needs more years than the candidate has → the reason, else null. Unknown years → null. */
export function seniorityGate(title: string, years: number | null): string | null {
  if (years === null) return null
  const t = title.toLowerCase()
  const hit = SENIORITY.find(([re]) => re.test(t))
  return hit && years < hit[2] ? `Seniority: ${hit[1]} roles usually need ${hit[2]}+ years; you have ${years}` : null
}

/** JevGate-style: the model acts alone only when confident; everything undecided stays `uncertain` (→ full agent). */
export const GATE = { likely: 0.8, unlikely: 0.2 }

export type Verdict = { bucket: PrescreenBucket; reason: string; gate: PrescreenGate }

/** Gates in order: user label → location → function → seniority → model (or keywords without one).
 *  A location that's only "maybe" (remote anywhere, region) caps the result at uncertain. */
export function screen(job: Pick<JobListing, 'title' | 'location'>, s: Signals, profile: Profile, policy: PrescreenPolicy, fit: number | null, feedback?: boolean): Verdict {
  if (feedback !== undefined) return { bucket: feedback ? 'likely' : 'unlikely', reason: `You marked this ${feedback ? 'relevant' : 'not relevant'}`, gate: 'feedback' }
  const loc = locationGate(job.location, policy)
  if (loc?.verdict === 'fail') return { bucket: 'unlikely', reason: loc.reason, gate: 'location' }
  if (s.otherFunction) return { bucket: 'unlikely', reason: `Function: ${s.otherFunction} role`, gate: 'function' }
  const senior = seniorityGate(job.title, policy.years)
  if (senior) return { bucket: 'unlikely', reason: senior, gate: 'seniority' }
  const where = loc ? ` · ${loc.reason}` : ''
  let v: Verdict
  if (fit === null) {
    v = s.targetRole
      ? { bucket: 'likely', reason: `Target role (${s.targetRole})${where}`, gate: 'keywords' }
      : { bucket: 'uncertain', reason: `No clear signal${where}`, gate: 'keywords' }
  } else {
    const f = `Model: ${fit.toFixed(2)} fit`
    v = fit >= GATE.likely ? { bucket: 'likely', reason: `${f} — matches your target roles${where}`, gate: 'model' }
      : fit <= GATE.unlikely ? { bucket: 'unlikely', reason: `${f} — unlike your target roles`, gate: 'model' }
        : { bucket: 'uncertain', reason: `${f} — needs the agent${where}`, gate: 'model' }
  }
  return loc?.verdict === 'unsure' && v.bucket === 'likely' ? { bucket: 'uncertain', reason: `${loc.reason} · ${v.reason.replace(where, '')}`, gate: 'location' } : v
}

// ————— training labels (never from location: it isn't in the title text) —————

export type Example = { text: string; label: 0 | 1; weight: number; kw: number }
export type Feedback = { relevant: boolean; text: string; at: string }

const GOOD = /applied|interview|offer|responded|hired/i
const BAD = /skip|discard|reject|no aplicar/i

/** The keyword bucket as the base model's prior: other function .1, target role .9, else .5. Never location. */
export const keywordPrior = (s: Signals) => (s.otherFunction ? 0.1 : s.targetRole ? 0.9 : 0.5)

/** Real labels only — feedback [5] > tracker outcome [3], one per job. Keyword guesses aren't labels: they
 *  already enter as the base model's prior. `kw` is that prior, which the personal layer is anchored to. */
export const WEIGHT = { user: 5, tracker: 3 }
export function buildExamples(jobs: JobListing[], profile: Profile, feedback: Record<string, Feedback>): Example[] {
  const ex = (text: string, label: 0 | 1, weight: number): Example => ({ text, label, weight, kw: keywordPrior(keywordSignals(text, profile)) })
  const out = new Map<string, Example>(Object.entries(feedback).filter(([, f]) => f.text.trim()).map(([id, f]) => [id, ex(f.text, f.relevant ? 1 : 0, WEIGHT.user)]))
  for (const j of jobs) {
    if (out.has(j.id) || !j.title.trim() || j.reportNum === null) continue
    const tracked = (j.score !== null && j.score >= 3.5) || GOOD.test(j.status ?? '') ? 1 : (j.score !== null && j.score < 3) || BAD.test(j.status ?? '') ? 0 : null
    if (tracked !== null) out.set(j.id, ex(j.title, tracked, WEIGHT.tracker))
  }
  return [...out.values()]
}

/** The personal layer's gate needs ≥ 5 labels of each class; below that the base model scores alone. */
export const MIN_PER_CLASS = 5
export function personalReady(examples: Example[]): boolean {
  const pos = examples.filter(e => e.label === 1).length
  return pos >= MIN_PER_CLASS && examples.length - pos >= MIN_PER_CLASS
}
/** `model` = model id@rev + target strings: switching either forces a retrain. */
export const labelHash = (examples: Example[], model: string) =>
  createHash('sha256').update(model + JSON.stringify(examples.map(e => [e.text, e.label, e.weight, e.kw]).sort())).digest('hex').slice(0, 16)

// ————— store: data/careerloom-prescreen.json —————

/** `groups` = the ISCO-3 target groups the last model run picked for the profile. */
export type Store = { policy?: PrescreenPolicy; feedback: Record<string, Feedback>; results: PrescreenMap; groups?: string[] }
export const storeFile = (dataRoot: string) => path.join(dataRoot, 'data', 'careerloom-prescreen.json')

/** v1 files were a bare id → entry map; read them as results. */
export function readStore(dataRoot: string): Store {
  try {
    const raw = JSON.parse(fs.readFileSync(storeFile(dataRoot), 'utf8')) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { feedback: {}, results: {} }
    const o = raw as Partial<Store>
    if (!('results' in o)) return { feedback: {}, results: raw as PrescreenMap }
    return { policy: o.policy ? cleanPolicy(o.policy) : undefined, feedback: o.feedback ?? {}, results: o.results ?? {}, groups: Array.isArray(o.groups) ? o.groups.filter(g => typeof g === 'string') : undefined }
  } catch { return { feedback: {}, results: {} } }
}

/** Merge results by id; policy / feedback replace when given (temp file + rename). */
export function writeStore(dataRoot: string, patch: Partial<Store>): Store {
  const cur = readStore(dataRoot)
  const next: Store = { policy: patch.policy ?? cur.policy, feedback: patch.feedback ?? cur.feedback, results: { ...cur.results, ...patch.results }, groups: patch.groups ?? cur.groups }
  const file = storeFile(dataRoot)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2))
  fs.renameSync(tmp, file)
  return next
}

/** Stored results with `stale` set where the profile or policy changed since the screen ran. */
export const withStaleness = (map: PrescreenMap, hash: string) =>
  Object.fromEntries(Object.entries(map).map(([id, e]) => [id, { ...e, stale: e.profileHash !== hash }]))
