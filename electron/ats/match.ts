// Job match 0-100: skill coverage 35, semantic similarity 20, seniority 15, evidence depth 15, bullet quality 15.
// Code owns every number here; the agent only supplies requirements and quote-backed judgements. Pure.
import type { ScoreBlock, ScoreBlockPart, ScoreCap } from '../contract'
import { bulletQuality, type BulletNote } from './bullets'
import { findRanges, yearsCovered } from './dates'
import type { JdReq, Judgement } from './llm'
import type { CvModel } from './model'
import { buildCvIndex, canonicalize, extractSkills, matchSkill, type MatchKind, type SkillMatch } from './skills'

export type MatchInput = {
  cv: CvModel
  reqs: JdReq[]
  judgements?: Judgement[]
  notes?: BulletNote[]
  /** requirement id → cosine of its best résumé bullet; null = no local model (degraded mode). */
  similarities: Record<string, number> | null
  jdText: string
  now?: number
}

export type ReqResult = { req: JdReq; match: SkillMatch; depth: 'bullet' | 'list' | 'none'; uncertain: boolean; quote?: string }
export type MatchResult = ScoreBlock & { perReq: ReqResult[]; degraded: { embeddings: boolean }; yearsHave: number; yearsNeed: number | null; weakBullets: ReturnType<typeof bulletQuality>['weakest'] }

const W = { coverage: 35, semantic: 20, seniority: 15, evidence: 15, bullets: 15 }
const weight = (r: JdReq) => (r.required ? 3 : 1)
const round1 = (n: number) => Math.round(n * 10) / 10
const MAX_SKILLS_PER_BULLET = 4 // beyond this a bullet is a keyword dump, not evidence
// ponytail: fixed cosine window for the small encoder (related text ≈ .86+, unrelated ≈ .74). Re-fit on the labelled golden set.
const COS_FLOOR = 0.74
const COS_CEIL = 0.9

/** A model-judged synonym only counts when its quote really appears in the résumé. */
function synonymFor(req: JdReq, judgements: Judgement[], cv: CvModel): { via: string; certain: boolean } | null {
  const j = judgements.find(x => x.req_id === req.id && x.match === 'synonym' && x.cv_quote)
  return j && cv.markdown.toLowerCase().includes(j.cv_quote!.toLowerCase()) ? { via: j.cv_quote!, certain: j.certain } : null
}

function depthOf(req: JdReq, m: SkillMatch, cv: CvModel): ReqResult['depth'] {
  if (m.kind === 'none') return 'none'
  const target = canonicalize(req.skill) ?? canonicalize(m.via ?? '') ?? req.skill
  const hit = cv.bullets.some(b => {
    if (!b.evidence) return false
    const skills = extractSkills(b.text)
    if (skills.size > MAX_SKILLS_PER_BULLET) return false
    return skills.has(target) || (!canonicalize(req.skill) && b.text.toLowerCase().includes((m.via ?? req.skill).toLowerCase()))
  })
  return hit ? 'bullet' : 'list'
}

function requiredYears(reqs: JdReq[], jdText: string): number | null {
  const fromReqs = reqs.filter(r => r.required && r.years).map(r => r.years!)
  const fromText = [...jdText.matchAll(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?/gi)].map(m => +m[1]!).filter(n => n > 0 && n < 25)
  const all = [...fromReqs, ...fromText]
  return all.length ? Math.max(...all) : null
}

export function scoreMatch(input: MatchInput): MatchResult {
  const { cv, reqs, jdText } = input
  const judgements = input.judgements ?? []
  const idx = buildCvIndex(cv)

  const perReq: ReqResult[] = reqs.map(req => {
    const syn = synonymFor(req, judgements, cv)
    const m = matchSkill(req.skill, idx, syn?.via)
    const judged = judgements.find(j => j.req_id === req.id)
    const uncertain = (m.kind === 'synonym' && !syn?.certain) || (judged?.certain === false && m.kind !== 'exact')
    return { req, match: m, depth: depthOf(req, m, cv), uncertain, quote: syn?.via }
  })
  const totalW = perReq.reduce((s, r) => s + weight(r.req), 0) || 1
  const sum = (f: (r: ReqResult) => number) => perReq.reduce((s, r) => s + weight(r.req) * f(r), 0) / totalW

  // 1. Coverage; the low/high bounds treat every uncertain requirement as 0 / as a full match.
  const cov = sum(r => r.match.weight)
  const covLow = sum(r => (r.uncertain ? 0 : r.match.weight))
  const covHigh = sum(r => (r.uncertain ? 1 : r.match.weight))

  // 2. Semantic similarity (null = degraded: the component is dropped and the rest renormalised).
  const sims = input.similarities
  const semantic = sims
    ? sum(r => { const c = sims[r.req.id]; return c === undefined ? 0 : Math.min(1, Math.max(0, (c - COS_FLOOR) / (COS_CEIL - COS_FLOOR))) })
    : null

  // 3. Seniority / years fit.
  const now = input.now ?? Date.now()
  const nowYm = new Date(now).getFullYear() * 12 + new Date(now).getMonth()
  const yearsHave = yearsCovered(findRanges(cv.sections.filter(s => /experience|employment|work|intern/i.test(s.title)).map(s => s.lines.join('\n')).join('\n'), nowYm).ranges)
  const yearsNeed = requiredYears(reqs, jdText)
  const ratio = yearsNeed ? yearsHave / yearsNeed : null
  const seniority = ratio === null ? 0.7 : ratio >= 1 ? (ratio > 2.5 ? 0.8 : 1) : Math.max(0, ratio) ** 1.5

  // 4. Evidence depth: a keyword in an experience bullet beats one in a Skills list; nothing beats nothing.
  const evidence = sum(r => (r.depth === 'bullet' ? r.match.weight : r.depth === 'list' ? r.match.weight * 0.4 : 0))

  // 5. Bullet quality.
  const bq = bulletQuality(cv.bullets, input.notes ?? [], W.bullets)

  const parts: ScoreBlockPart[] = [
    { id: 'coverage', label: 'Skill coverage', got: round1(cov * W.coverage), max: W.coverage, evidence: `${perReq.filter(r => r.match.kind !== 'none').length} of ${perReq.length} JD skills found (required count 3x)` },
    ...(semantic === null ? [] : [{ id: 'semantic', label: 'Semantic similarity', got: round1(semantic * W.semantic), max: W.semantic, evidence: 'Best matching bullet per requirement' }]),
    { id: 'seniority', label: 'Seniority and years', got: round1(seniority * W.seniority), max: W.seniority, evidence: yearsNeed ? `${yearsHave} years covered vs ${yearsNeed} asked` : 'The JD states no years, so this is neutral' },
    { id: 'evidence', label: 'Evidence depth', got: round1(evidence * W.evidence), max: W.evidence, evidence: 'Skills used in experience bullets count fully; Skills-list-only counts 40%' },
    { id: 'bullets', label: 'Bullet quality', got: bq.got, max: W.bullets, evidence: `${bq.verdicts.length} bullets judged` },
  ]
  // Renormalise to 100 when the semantic part is unavailable.
  const maxSum = parts.reduce((s, p) => s + p.max, 0)
  const scale = 100 / maxSum
  const raw = parts.reduce((s, p) => s + p.got, 0) * scale
  const swing = (covHigh - cov) * W.coverage * scale
  const swingLow = (cov - covLow) * W.coverage * scale

  const caps: ScoreCap[] = [{ id: 'ceiling', max: 97, reason: 'A keyword heuristic cannot certify a perfect match' }]
  const missingRequired = perReq.filter(r => r.req.required && r.match.kind === 'none').length
  if (missingRequired > 3) caps.push({ id: 'missing-required-many', max: 59, reason: `${missingRequired} required skills are missing` })
  else if (missingRequired > 0) caps.push({ id: 'missing-required', max: 79, reason: `${missingRequired} required skill${missingRequired > 1 ? 's are' : ' is'} missing` })
  const ceiling = Math.min(...caps.map(c => c.max))
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(ceiling, n)))

  // Confidence: how much the inputs deserve trust.
  const vocab = extractSkills(jdText)
  const llmSkills = new Set(perReq.map(r => canonicalize(r.req.skill)).filter((x): x is string => !!x))
  const agreement = vocab.size ? [...vocab].filter(s => llmSkills.has(s)).length / vocab.size : 1
  const signals = [jdText.split(/\s+/).length >= 150, reqs.length >= 6, agreement >= 0.6, sims !== null].filter(Boolean).length
  const confidence: ScoreBlock['confidence'] = signals >= 4 ? 'high' : signals >= 3 ? 'medium' : 'low'

  const score = clamp(raw)
  return {
    score, low: clamp(raw - swingLow), high: clamp(raw + swing), confidence, parts, caps: caps.filter(c => c.max < 100),
    perReq, degraded: { embeddings: sims === null }, yearsHave, yearsNeed, weakBullets: bq.weakest,
  }
}

export type { MatchKind }
