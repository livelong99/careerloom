// Stage 1: deterministic gates, no model. Reuses the pre-screen rules (location → function → seniority) and adds
// JD-level ones: years the JD demands, salary ceiling under the floor, user deny words.
import { keywordSignals, screen } from '../prescreen-core'
import type { Candidate, EvalJob, FetchedJob, JobResult } from './types'

export type FilterRules = {
  /** Skip when the JD's advertised pay tops out below this (same currency only). */
  salaryFloor?: { amount: number; currency: string } | null
  /** Case-insensitive phrases; any hit in the title or JD drops the job. */
  deny?: string[]
  /** Skip when the JD asks for more than this many years over the candidate's. */
  yearsSlack?: number
}

const CURRENCY: Array<[RegExp, string]> = [[/\$|usd/i, 'USD'], [/€|eur/i, 'EUR'], [/£|gbp/i, 'GBP'], [/₹|inr|rs\.?|lpa|lakh/i, 'INR']]
const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|lpa|lakhs?|lacs?|m)?`

/** Highest advertised figure in a "A - B" / "up to B" pay range, normalised to whole units; null when unclear. */
export function advertisedPayMax(jd: string): { max: number; currency: string } | null {
  const m = new RegExp(String.raw`(?:salary|compensation|pay|ctc|base)[^\n]{0,40}?([$€£₹]|usd|eur|gbp|inr|rs\.?)?\s*${NUM}\s*(?:-|–|to)\s*([$€£₹])?\s*${NUM}`, 'i').exec(jd)
  if (!m) return null
  const unit = (s: string | undefined) => (s ? { k: 1e3, m: 1e6 }[s.toLowerCase()] ?? (/^(l|lpa)/i.test(s) ? 1e5 : 1) : 1)
  const hi = Number(m[5]!.replace(/,/g, '')) * unit(m[6])
  const currency = CURRENCY.find(([re]) => re.test(`${m[1] ?? ''}${m[4] ?? ''}${m[3] ?? ''}${m[6] ?? ''}`))?.[1]
  return currency && hi > 0 ? { max: hi, currency } : null
}

/** Largest "N+ years" ask in the JD (ignores absurd values). */
export function yearsAsked(jd: string): number | null {
  const all = [...jd.matchAll(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years|yrs)\b/gi)].map(m => Number(m[1])).filter(n => n > 0 && n < 25)
  return all.length ? Math.max(...all) : null
}

/** The rule gates that need no JD (location → function → seniority from the title): why the job is out, else null.
 *  Run before the JD is fetched, so a job the title already rules out costs nothing. */
export function titleGate(j: Pick<EvalJob, 'id' | 'title' | 'location'>, c: Candidate): string | null {
  if (c.pinned?.has(j.id)) return null
  const v = screen(j, keywordSignals(j.title, c.profile), c.profile, c.policy, null)
  return v.bucket === 'unlikely' ? v.reason : null
}

export function stage1(jobs: FetchedJob[], c: Candidate, rules: FilterRules = {}): { pass: FetchedJob[]; settled: JobResult[] } {
  const pass: FetchedJob[] = []
  const settled: JobResult[] = []
  const drop = (j: FetchedJob, reason: string) => settled.push({ jobId: j.id, fate: 'skip', stage: 'filter', reason, local: null, light: null })
  for (const j of jobs) {
    if (c.pinned?.has(j.id)) { pass.push(j); continue }
    const gated = titleGate(j, c)
    if (gated) { drop(j, gated); continue }
    const hay = `${j.title}\n${j.jd}`.toLowerCase()
    const hit = (rules.deny ?? []).find(d => d.trim() && hay.includes(d.trim().toLowerCase()))
    if (hit) { drop(j, `Deny word: ${hit}`); continue }
    const asked = yearsAsked(j.jd)
    const have = c.policy.years
    if (asked !== null && have !== null && asked - have > (rules.yearsSlack ?? 3)) { drop(j, `Experience: JD asks ${asked}+ years; you have ${have}`); continue }
    const pay = rules.salaryFloor ? advertisedPayMax(j.jd) : null
    if (pay && rules.salaryFloor && pay.currency === rules.salaryFloor.currency && pay.max < rules.salaryFloor.amount) { drop(j, `Pay: tops out at ${pay.max} ${pay.currency}, below your ${rules.salaryFloor.amount}`); continue }
    pass.push(j)
  }
  return { pass, settled }
}
