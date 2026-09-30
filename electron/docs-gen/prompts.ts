import { CONDENSED_RULES, NO_TOOLS } from '../humanizer'
import type { JobPosting } from '../job-view/types'

const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)
const postingBrief = (p: JobPosting | null, company: string, role: string) => JSON.stringify({
  company, role, summary: p?.summary, responsibilities: p?.responsibilities.slice(0, 8), required: p?.requirements.required.slice(0, 10), preferred: p?.requirements.preferred.slice(0, 6), techStack: p?.techStack, seniority: p?.seniority,
})

export type ResumeInput = { cv: string; posting: JobPosting | null; company: string; role: string; plan: Array<{ section: string; proposed: string; why: string }>; missing: string[] }

export function resumePrompt(i: ResumeInput): string {
  return `You tailor a résumé to one job by editing it in place. Reply with ONE JSON object and nothing else (no code fence). ${NO_TOOLS}
Schema: {"edits":[{"section":string,"before":string,"after":string,"cv_source_quote":string}]}
Rules:
- At most 8 edits. Each "before" is copied EXACTLY, character for character, from the résumé (a line or a phrase of one).
- "after" may reorder, reword, tighten or re-emphasise what "before" already says so it speaks to this job. It must not add any number, employer, title, date, tool, skill or claim that is not already in the résumé.
- "cv_source_quote" is a short exact quote from the résumé that supports the edit.
- Do not mention skills from MISSING. The job asks for them and the résumé lacks them.
- Prefer the summary and the most relevant experience bullets. Leave everything else alone.
${CONDENSED_RULES}

JOB: ${postingBrief(i.posting, i.company, i.role)}
MISSING SKILLS: ${i.missing.join(', ') || 'none'}
EVALUATION TAILORING PLAN (ideas, not facts): ${JSON.stringify(i.plan.slice(0, 6))}

RÉSUMÉ:
${cap(i.cv, 14_000)}`
}

export type CoverInput = {
  cv: string; posting: JobPosting | null; company: string; role: string; candidate: string
  strengths: string[]; missing: string[]; voiceSample?: string; tone: 'concise' | 'warm' | 'formal'; length: 'short' | 'standard'
}

export function coverPrompt(i: CoverInput): string {
  const words = i.length === 'short' ? '150 to 200' : '250 to 320'
  return `Write a cover letter from ${i.candidate || 'the candidate'} to ${i.company} for the ${i.role} role. Reply in exactly this tagged format and nothing else (no JSON, no code fence, no reasoning, no commentary; keep it short):
<letter>
First paragraph.

Second paragraph.
</letter>
<claims>
one sentence exactly as written in the letter ||| a short exact quote from the résumé that supports it
(one line per claim sentence)
</claims>
<learning>comma-separated skills that appear only as interest, or empty</learning>
Rules:
- ${NO_TOOLS} Do not count words with a tool; just keep to the length.
- ${words} words in 3 or 4 paragraphs. Tone: ${i.tone}. Plain text, no greeting line, no sign-off (added later).
- This is a letter, not a résumé in prose. Use at most 3 résumé facts in total, the ones closest to what THIS role does day to day, and tell each as a short story: the problem, what was done, the result. Do not list tools or every achievement.
- Paragraph 1: what the team at ${i.company} builds or needs (from the job), and the one résumé fact that answers it most directly. Middle: the second fact and why it carries over. Last: one honest interest or gap if any, and a plain closing line inviting a conversation.
- Open with a concrete fact or the problem the role solves, never with "I am writing to apply" or "I am excited". No general praise of the company.
- Every claim about the candidate's experience must be in the résumé. <claims> lists each such sentence exactly as written in the letter, with a short exact quote from the résumé that supports it.
- Skills in MISSING may appear at most once, only as honest interest ("I want to build depth in X"), never as experience or as something in progress. List any such skill in <learning>.
- Numbers, employers, titles and dates only as they appear in the résumé.
${CONDENSED_RULES}
${i.voiceSample?.trim() ? `\nVOICE SAMPLE (match rhythm and word choice, not content):\n${cap(i.voiceSample.trim(), 1500)}\n` : ''}
JOB: ${postingBrief(i.posting, i.company, i.role)}
STRENGTHS THE EVALUATION FOUND: ${i.strengths.slice(0, 5).join('; ') || 'none listed'}
MISSING SKILLS: ${i.missing.join(', ') || 'none'}

RÉSUMÉ:
${cap(i.cv, 14_000)}`
}

/** Runs are single-shot (no session), so a retry repeats the prompt plus what was wrong. */
export const withProblems = (prompt: string, why: string[]): string =>
  `${prompt}\n\nYOUR PREVIOUS ATTEMPT HAD THESE PROBLEMS. Fix them and reply again with ONE JSON object in the same schema, nothing else:\n- ${why.slice(0, 8).join('\n- ')}`
