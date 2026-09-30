// Setup-page context: what the copilot will know about a job. A light, pure fallback; the real grounding prefix is WP2's ContextBuilder.
import type { JobPosting, ReportView } from '../job-view/types'
import type { ContextPreview, ContextSummary } from './types'

export type ContextInput = {
  jobId: string; title: string; company: string
  report: ReportView | null
  posting: Pick<JobPosting, 'requirements' | 'skills' | 'techStack' | 'summary'> | null
  cv: string | null
}

const storiesOf = (report: ReportView | null): string[] => {
  const out: string[] = []
  for (const b of report?.sections.find(s => s.kind === 'interview')?.blocks ?? []) {
    if (b.kind !== 'table') continue
    const story = b.headers.findIndex(h => /story/i.test(h))
    const req = b.headers.findIndex(h => /requirement/i.test(h))
    if (story < 0) continue
    for (const r of b.rows) out.push((r[story] ?? '').trim() || (r[req] ?? '').trim())
  }
  return out.filter(Boolean)
}
const factLines = (cv: string | null): string[] => (cv ?? '').split('\n').filter(l => /^\s*[-*]\s+\S/.test(l)).map(l => l.replace(/^\s*[-*]\s+/, '').trim())

export function buildContext(i: ContextInput): { summary: ContextSummary; preview: ContextPreview } {
  const stories = storiesOf(i.report)
  const facts = factLines(i.cv)
  const reqs = i.posting ? [...i.posting.requirements.required, ...i.posting.requirements.preferred] : []
  const strengths = i.report?.topStrengths ?? []
  const gaps = i.report?.gaps ?? []
  const text = [
    `Role: ${i.title} at ${i.company}`,
    i.posting?.summary ? `Summary: ${i.posting.summary}` : '',
    reqs.length ? `Requirements:\n${reqs.map(r => `- ${r}`).join('\n')}` : '',
    strengths.length ? `Strengths:\n${strengths.map(s => `- ${s}`).join('\n')}` : '',
    gaps.length ? `Gaps to handle:\n${gaps.map(g => `- ${g.title}`).join('\n')}` : '',
    stories.length ? `Stories:\n${stories.map(s => `- ${s}`).join('\n')}` : '',
    facts.length ? `Résumé facts:\n${facts.map(f => `- ${f}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  return {
    summary: { jobId: i.jobId, title: i.title, company: i.company, hasPosting: i.posting !== null, hasReport: i.report !== null, hasCv: i.cv !== null && i.cv.trim() !== '', stories: stories.length },
    preview: { tokens: Math.ceil(text.length / 4), posting: reqs.length, strengths: strengths.length, gaps: gaps.length, facts: facts.length, stories: stories.length, text },
  }
}
