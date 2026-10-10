import { AGENTS, WORK } from './content-work'
import { CONFIGURE, INTERVIEW, REFERENCE } from './content-more'
import { FIND, START } from './content-start'
import type { Topic } from './types'

export const TOPICS: Topic[] = [...START, ...FIND, ...WORK, ...AGENTS, ...INTERVIEW, ...CONFIGURE, ...REFERENCE]
export const topicById = (id: string | null | undefined): Topic | undefined => TOPICS.find(t => t.id === id)

/** Goal-first entry points: what the reader wants → the topics to read, in order. */
export const GOALS: ReadonlyArray<{ id: string; label: string; path: string[] }> = [
  { id: 'setup', label: 'Get set up', path: ['welcome', 'setup', 'runners', 'providers'] },
  { id: 'find', label: 'Find jobs worth my time', path: ['boards', 'jobs', 'overview'] },
  { id: 'apply', label: 'Apply to one job well', path: ['job', 'resume'] },
  { id: 'interview', label: 'Prepare for an interview', path: ['prep', 'copilot-practice', 'copilot', 'copilot-privacy'] },
  { id: 'tune', label: 'Change how it looks or works', path: ['appearance', 'workflow-settings', 'copilot-tuning', 'settings'] },
  { id: 'cost', label: 'Understand cost and failures', path: ['runs', 'monitoring', 'monitoring-settings', 'troubleshooting'] },
]

/** The pipeline map: one node per stage, each opens its topic. */
export const PIPELINE: ReadonlyArray<{ id: string; label: string; hint: string }> = [
  { id: 'boards', label: 'Boards', hint: 'collect' },
  { id: 'jobs', label: 'Jobs', hint: 'pre-screen, evaluate' },
  { id: 'job', label: 'Job page', hint: 'match, report' },
  { id: 'resume', label: 'Résumé', hint: 'tailor, export' },
  { id: 'prep', label: 'Prep', hint: 'questions, practice' },
  { id: 'copilot', label: 'Copilot', hint: 'live help' },
]

/** Case-insensitive match over title, summary, keywords and body. Empty query → everything. */
export function searchTopics(query: string, topics: Topic[] = TOPICS): Topic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return topics
  const scored = topics.map(t => {
    const head = `${t.title} ${t.keywords ?? ''}`.toLowerCase()
    const body = [t.summary, ...t.when, ...t.steps.flatMap(s => [s.title, s.body]), ...(t.tips ?? []), ...(t.faq ?? []).flatMap(f => [f.q, f.a])].join(' ').toLowerCase()
    let score = 0
    for (const w of words) {
      if (head.includes(w)) score += 3
      else if (body.includes(w)) score += 1
      else return { t, score: 0 }
    }
    return { t, score }
  })
  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).map(s => s.t)
}
