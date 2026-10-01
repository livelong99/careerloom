// Queries from the structured posting + gaps + skills; the privacy filter (plan §3.2 step 2, §9).
// Queries are built from role/company/skill strings only. The cv is read solely to REJECT a query that echoes it.
import { createHash } from 'node:crypto'

import type { Expected, ResearchOptions, ResearchPlan, SearchBackendId, SkillNode } from '../types'
import { squash } from './guard'

export type PlanInput = {
  jobId: string; title: string; company: string; seniority?: string | null
  techStack: string[]; skills: string[]; requirements?: string[]; gaps: string[]
  cv: string; userName?: string; depth: ResearchOptions['depth']; backend: SearchBackendId | 'none'
}

const QUERY_CAP = { quick: 8, standard: 18, deep: 28 } as const
const SKILL_CAP = { quick: 4, standard: 8, deep: 12 } as const
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/
const SPAN = 6

const words = (s: string): string[] => squash(s).split(' ').filter(Boolean)
const grams = (w: string[], n: number): Set<string> => { const out = new Set<string>(); for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' ')); return out }

/** True when the query is safe to send out (no emails, phones, name or ≥ 6-word spans of the cv). */
export function privacyFilter(query: string, cv: string, userName?: string): boolean {
  if (EMAIL.test(query) || PHONE.test(query)) return false
  if (userName && userName.trim().length >= 3 && squash(query).includes(squash(userName))) return false
  const q = words(query)
  if (q.length < SPAN) return true
  const spans = grams(words(cv), SPAN)
  for (const g of grams(q, SPAN)) if (spans.has(g)) return false
  return true
}

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9+#.]+/g, '-').replace(/^-+|-+$/g, '')
const level = (w: number, seniority: string | null | undefined): Expected => {
  const senior = /\b(senior|staff|principal|lead|head|director)\b/i.test(seniority ?? '')
  return w >= 0.75 ? (senior ? 'expert' : 'strong') : w >= 0.5 ? (senior ? 'strong' : 'working') : 'aware'
}

/** Tech stack first (position = JD emphasis), then competencies; a CV gap boosts weight; `inCv` is a substring check on the CV. */
export function skillNodes(i: Pick<PlanInput, 'techStack' | 'skills' | 'requirements' | 'gaps' | 'cv' | 'seniority' | 'depth'>): SkillNode[] {
  const cv = squash(i.cv)
  const gaps = new Set(i.gaps.map(g => g.toLowerCase()))
  const required = squash((i.requirements ?? []).join(' '))
  const seen = new Set<string>()
  const nodes: SkillNode[] = []
  ;[...i.techStack, ...i.skills].forEach((raw, pos) => {
    const name = raw.replace(/\s+/g, ' ').trim()
    const id = slug(name)
    if (!id || name.length > 40 || seen.has(id)) return
    seen.add(id)
    const gap = gaps.has(name.toLowerCase())
    const weight = Math.min(1, Math.max(0.3, 1 - pos * 0.04) + (required.includes(squash(name)) ? 0.1 : 0) + (gap ? 0.2 : 0))
    nodes.push({ id, name, family: null, origin: gap ? 'gap' : 'jd', expected: level(weight, i.seniority), weight: +weight.toFixed(2), inCv: cv.includes(squash(name)) })
  })
  return nodes.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)).slice(0, SKILL_CAP[i.depth] * 2)
}

export function buildPlan(input: PlanInput): ResearchPlan {
  const skills = skillNodes(input)
  const top = skills.slice(0, SKILL_CAP[input.depth])
  const role = input.title.trim()
  const company = input.company.trim()
  const raw: string[] = []
  for (const s of top) raw.push(`${s.name} interview questions`, `${s.name} ${role} interview`)
  if (company) raw.push(`${company} interview process`, `${company} ${role} interview questions`, `${company} engineering blog`, `${company} tech stack`, `${company} culture values hiring`)
  raw.push(`${role} behavioural interview questions`, `${role} system design interview questions`, `${role} interview process`)
  for (const s of top.filter(x => !x.inCv).slice(0, 3)) raw.push(`${s.name} common mistakes interview`)
  const seen = new Set<string>()
  const queries = raw.map(q => q.replace(/\s+/g, ' ').trim()).filter(q => q.length > 8 && q.length <= 120 && privacyFilter(q, input.cv, input.userName)).filter(q => !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()))
  return { jobId: input.jobId, skills, queries: queries.slice(0, QUERY_CAP[input.depth]), backend: input.backend }
}

/** Same recipe as hash.ts `inputHash` (WP1): changes when the posting, gaps, role or company change. */
export function inputHashOf(parts: { jd: unknown; gaps: unknown; role: string; company: string }): string {
  return createHash('sha1').update(JSON.stringify([parts.jd, parts.gaps, parts.role, parts.company])).digest('hex')
}
