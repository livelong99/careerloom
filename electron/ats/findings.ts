// Findings the code can make without an agent, skill buckets, and merging them with the agent's proposals. Pure.
import type { AtsFinding, SkillGap } from '../contract'
import { applyOp, haveId } from './apply'
import type { BulletVerdict } from './bullets'
import type { ReqResult } from './match'
import type { Issue } from './types'
import { canonicalize } from './skills'
import { sha } from './store'

const sev = { critical: 0, major: 1, minor: 2, info: 3 } as const

export function parseFindings(issues: Issue[]): AtsFinding[] {
  return issues.map(i => ({
    ...i, status: 'open' as const,
    // Content drift has a real fix that needs no agent and no network: rebuild the template data from cv.md.
    ...(i.id === 'parse.coverage' ? { apply: { op: 'rebuild-profile' as const, target: '', after: '', requires_answers: [] } } : {}),
  }))
}

export function bulletFindings(weak: BulletVerdict[]): AtsFinding[] {
  return weak.slice(0, 5).map(v => ({
    id: `bullet:${sha(v.text)}`, severity: v.points < 0.4 ? 'major' : 'minor', category: 'bullet', status: 'open',
    title: `Strengthen: "${v.text.length > 70 ? `${v.text.slice(0, 67)}…` : v.text}"`, detail: v.issues.join('. ') + '.', evidence: `line ${v.line}`,
  }))
}

/** A skill that only shows up in the Skills list is weak evidence: show it in a bullet. */
export function evidenceFindings(perReq: ReqResult[]): AtsFinding[] {
  return perReq.filter(r => r.depth === 'list').sort((a, b) => Number(b.req.required) - Number(a.req.required)).slice(0, 4).map(r => ({
    id: `evidence:${r.req.skill.toLowerCase()}`, severity: r.req.required ? 'major' : 'minor', category: 'evidence', status: 'open',
    title: `${r.req.skill} appears only in your Skills list`,
    detail: `The job asks for ${r.req.skill}${r.req.required ? ' (required)' : ''}. A parser counts a keyword much higher when it also appears in a role bullet that says what you did with it. Add it to a bullet where it is true.`,
  }))
}

export function seniorityFinding(have: number, need: number | null): AtsFinding[] {
  if (!need || have >= need) return []
  return [{ id: 'seniority:years', severity: 'minor', category: 'seniority', status: 'open', title: `The job asks for ${need}+ years; your roles cover ${have}`, detail: 'Make the span of relevant experience clear: include the start month of each role and mention earlier internships or projects that used the same stack.' }]
}

const defaultHow = (skill: string) => `Build something small with ${skill} (a real project or a work task), then add it to your Skills and describe what you did in a bullet. Do not list it until you have used it.`

/** Concepts the JD wrote in lower case ("observability") read better capitalised; known names keep their canonical form. */
const display = (skill: string) => canonicalize(skill) ?? (skill === skill.toLowerCase() ? skill[0]!.toUpperCase() + skill.slice(1) : skill)

export function skillGaps(perReq: ReqResult[], hints: Record<string, string>): SkillGap[] {
  return perReq.map(r => ({
    skill: display(r.req.skill), canonical: canonicalize(r.req.skill) ?? r.req.skill.toLowerCase(), required: r.req.required,
    bucket: r.match.kind === 'none' ? 'gap' as const : r.match.kind === 'exact' ? 'existing' as const : 'supported' as const,
    ...(r.uncertain ? { lowConfidence: true } : {}),
    howToAdd: hints[r.req.skill.toLowerCase()] || (r.match.kind === 'none' ? defaultHow(r.req.skill) : r.match.kind === 'exact' ? 'Already on your résumé.' : `Your résumé already points to this (“${r.match.via}”). Name ${display(r.req.skill)} explicitly in a bullet if you have used it.`),
  })).sort((a, b) => Number(b.required) - Number(a.required))
}

/** One Apply per missing skill: adds it to Skills only after the user confirms they really have it. */
export function skillFindings(gaps: SkillGap[]): AtsFinding[] {
  return gaps.filter(g => g.bucket === 'gap').slice(0, 8).map(g => ({
    id: `skill:${g.skill.toLowerCase()}`, severity: g.required ? 'major' : 'minor', category: 'skill', status: 'open',
    title: `${g.skill} is ${g.required ? 'required' : 'preferred'} and missing`,
    detail: g.howToAdd,
    apply: { op: 'append', target: 'Skills', after: `- **Additional:** ${g.skill}`, requires_answers: [haveId(g.skill)] },
  }))
}

/** Deterministic first, then the agent's; an agent Apply whose target is not really in cv.md is dropped (the advice stays). */
export function mergeFindings(deterministic: AtsFinding[], agent: AtsFinding[], cv: string, prior: AtsFinding[] = []): AtsFinding[] {
  const status = new Map(prior.map(f => [f.id, f.status]))
  const seen = new Set<string>()
  const out: AtsFinding[] = []
  const agentText = agent.map(a => `${a.title} ${a.detail}`.toLowerCase())
  // The agent already covered this skill in its own words: keep its (richer) finding, not ours.
  const covered = (f: AtsFinding) => /^(skill|evidence):/.test(f.id) && agentText.some(t => t.includes(f.id.replace(/^[a-z]+:/, '')))
  for (const f of [...agent.map(a => checked(a, cv)), ...deterministic.filter(d => !covered(d))]) {
    if (seen.has(f.id)) continue
    seen.add(f.id)
    const prev = status.get(f.id)
    if (prev === 'applied' || prev === 'dismissed') { out.push({ ...f, status: prev }); continue }
    out.push(f)
  }
  // What the user already applied stays visible (and undoable) even when the rescore no longer raises it.
  for (const f of prior) if (f.status === 'applied' && !seen.has(f.id)) out.push(f)
  return out.sort((a, b) => sev[a.severity] - sev[b.severity])
}

function checked(f: AtsFinding, cv: string): AtsFinding {
  if (!f.apply || f.apply.op === 'rebuild-profile') return f
  const dry = applyOp(cv, f.apply, Object.fromEntries(f.apply.requires_answers.map(id => [id, '…'])))
  return dry.ok ? f : { ...f, apply: undefined }
}
