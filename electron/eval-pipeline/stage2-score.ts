// Stage 2: local score from code only — skill overlap against the résumé (ats/skills), title fit, experience fit.
// Cheap enough for thousands of jobs; drops what clearly does not match so the model sees only plausible ones.
import { buildCvIndex, extractSkills, matchSkill, type CvIndex } from '../ats/skills'
import { keywordSignals } from '../prescreen-core'
import { yearsAsked } from './stage1-filter'
import type { Candidate, FetchedJob, JobResult } from './types'
import { round1 } from './util'

export type LocalScore = { score: number; coverage: number; skills: number; matched: string[]; missing: string[] }

/** 0-100: 70 skill coverage, 15 title fit, 15 experience fit — so a JD sharing nothing with the résumé cannot reach the
 *  default cut-off on title and years alone. No skills found in the JD → coverage is neutral. */
export function localScore(job: FetchedJob, c: Candidate, idx: CvIndex): LocalScore {
  const want = [...extractSkills(`${job.title}\n${job.jd}`)]
  const hits = want.map(s => ({ s, w: matchSkill(s, idx).weight }))
  const coverage = want.length ? hits.reduce((a, h) => a + h.w, 0) / want.length : 0.5
  const title = keywordSignals(job.title, c.profile).targetRole ? 1 : 0.4
  const asked = yearsAsked(job.jd)
  const years = asked === null || c.policy.years === null || c.policy.years >= asked ? 1 : Math.max(0, 1 - (asked - c.policy.years) / 5)
  return {
    score: round1(100 * (0.7 * coverage + 0.15 * title + 0.15 * years)), coverage, skills: want.length,
    matched: hits.filter(h => h.w >= 0.8).map(h => h.s), missing: hits.filter(h => h.w === 0).map(h => h.s),
  }
}

export function stage2(jobs: FetchedJob[], c: Candidate, skipBelow: number): { pass: Array<FetchedJob & { local: LocalScore }>; settled: JobResult[] } {
  const idx = buildCvIndex(c.cv)
  const pass: Array<FetchedJob & { local: LocalScore }> = []
  const settled: JobResult[] = []
  for (const j of jobs) {
    const local = localScore(j, c, idx)
    if (local.score < skipBelow && !c.pinned?.has(j.id)) settled.push({ jobId: j.id, fate: 'skip', stage: 'score', reason: `Low overlap: ${local.score}/100 (${Math.round(local.coverage * 100)}% of ${local.skills} skills)`, local: local.score, light: null })
    else pass.push({ ...j, local })
  }
  return { pass, settled }
}
