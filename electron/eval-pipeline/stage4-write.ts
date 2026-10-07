// Stage 4: deterministic writer. One report + one tracker addition + one batch-state row per light verdict, in the
// exact shapes career-ops' own worker writes, then a single merge-tracker + reconcile-pipeline for the whole run
// (the per-job flow spawns both after every job). No model involved.
import fs from 'node:fs'
import path from 'node:path'
import { stringify } from 'yaml'

import type { FetchedJob, JobResult, Light } from './types'

export type WriteDeps = {
  /** career-ops checkout: reports/, batch/ live under it (same place the headless worker writes). */
  root: string
  /** Reserve `n` (<= 50) consecutive report numbers, zero-padded. */
  reserve: (n: number) => Promise<string[]>
  /** Release numbers that were reserved but not written (best effort). */
  release?: (nums: string[]) => Promise<void>
  /** Run merge-tracker + reconcile-pipeline once after all files are written. */
  finalize?: () => Promise<void>
  date: string
  runId: string
}

const RESERVE_MAX = 50
const cell = (s: string) => s.replace(/[\t\r\n|]+/g, ' ').trim()
export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'company'
const list = (xs: string[], none: string) => (xs.length ? xs.map(x => `- ${x}`).join('\n') : none)

/** The report markdown: header + archived JD + Machine Summary + A-G sections the parser and tracker rely on. */
export function reportMarkdown(job: FetchedJob, v: Light, num: string, d: { date: string; runId: string; local: number | null }): string {
  const summary = {
    company: job.company, role: job.title, score: v.fit, legitimacy_tier: 'Proceed with Caution', archetype: v.archetype, final_decision: v.decision,
    hard_stops: v.hardStop ? [v.hardStop] : [], soft_gaps: v.gaps, top_strengths: v.strengths, risk_level: v.hardStop ? 'High' : 'Medium', confidence: 'Low',
    next_action: v.decision === 'Skip' ? 'Skip unless something changes' : 'Run a full evaluation before applying',
    work_auth: 'unstated', discard_reasons: v.decision === 'Skip' || v.decision === 'Consider' ? ['other'] : [], via: null, company_confidential: false,
    advertised_comp: null, reports_to: null, requirement_importance: [],
  }
  return `# Evaluation: ${job.company} — ${job.title}

**Date:** ${d.date}
**Archetype:** ${v.archetype}
**Score:** ${v.fit.toFixed(1)}/5
**Legitimacy:** Proceed with Caution
**Work Auth:** ⚠️ Unstated
**URL:** ${cell(job.url)}
**PDF:** not generated — run /career-ops pdf ${slug(job.company)} to create on demand
**Batch ID:** ${d.runId}
**Depth:** quick (batched triage${d.local === null ? '' : `, local score ${d.local}/100`}) — re-run a full evaluation for the deep analysis

---

## Job Description (archived verbatim)

${job.jd}

---

## Machine Summary

\`\`\`yaml
${stringify(summary).trimEnd()}
\`\`\`

## A) Role Summary

| Field | Value |
|---|---|
| Archetype | ${cell(v.archetype)} |
| Location | ${cell(job.location ?? 'Not stated')} |
| TL;DR | ${cell(v.summary) || 'n/a'} |

## B) CV Match

**Strengths**
${list(v.strengths, '- none listed')}

**Gaps**
${list(v.gaps, '- none listed')}

## C) Level and Strategy

Not assessed in a quick triage.

## D) Compensation and Demand

Not assessed in a quick triage.

## E) Personalization Plan

Not assessed in a quick triage.

## F) Interview Plan

Not assessed in a quick triage.

## G) Posting Legitimacy

Not assessed in a quick triage (tier defaults to Proceed with Caution).

## Risk Summary

- Legitimacy: proceed_with_caution
${v.hardStop ? `- Blocker: ${v.hardStop}\n` : ''}
## Extracted Keywords

${v.strengths.concat(v.gaps).join(', ') || 'n/a'}
`
}

export function trackerRow(job: FetchedJob, v: Light, num: string, d: { date: string }): string {
  const file = `${num}-${slug(job.company)}-${d.date}.md`
  const header = 'num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl'
  const note = `${cell(v.summary) || 'Batched triage'}; quick triage (${v.decision})`
  const row = [num, d.date, cell(job.company), cell(job.title), v.decision === 'Skip' ? 'SKIP' : 'Evaluated', `${v.fit.toFixed(1)}/5`, '❌', `[${num}](reports/${file})`, note, cell(job.url)]
  return `${header}\n${row.join('\t')}\n`
}

const parseRange = (out: string, n: number): string[] => {
  const m = /^(\d+)(?:-(\d+))?$/.exec(out.trim())
  if (!m) throw new Error(`Unexpected report-number reply: ${out.trim().slice(0, 40)}`)
  const lo = Number(m[1]), hi = Number(m[2] ?? m[1])
  if (hi - lo + 1 !== n) throw new Error(`Asked for ${n} report numbers, got ${out.trim()}`)
  return Array.from({ length: n }, (_, i) => String(lo + i).padStart(m[1]!.length, '0'))
}
export { parseRange }

export type Stage4Out = { written: Array<{ jobId: string; num: string; report: string }>; errors: number; failed: JobResult[]; /** merge/reconcile failed: the files are written and the next merge-tracker run picks them up. */ finalizeError?: string }

export async function stage4(items: Array<{ job: FetchedJob; result: JobResult }>, deps: WriteDeps): Promise<Stage4Out> {
  const written: Stage4Out['written'] = []
  const failed: JobResult[] = []
  let errors = 0
  const reports = path.join(deps.root, 'reports')
  const additions = path.join(deps.root, 'batch', 'tracker-additions')
  const stateFile = path.join(deps.root, 'batch', 'batch-state.tsv')
  fs.mkdirSync(reports, { recursive: true })
  fs.mkdirSync(additions, { recursive: true })
  const states: string[] = []
  const now = new Date().toISOString()

  for (let i = 0; i < items.length; i += RESERVE_MAX) {
    const chunk = items.slice(i, i + RESERVE_MAX)
    let nums: string[]
    try { nums = await deps.reserve(chunk.length) } catch (err) {
      errors += chunk.length
      chunk.forEach(({ result }) => failed.push({ ...result, fate: 'failed', stage: 'write', reason: `Couldn't reserve report numbers: ${(err as Error).message}`, light: null }))
      continue
    }
    const unused: string[] = []
    chunk.forEach(({ job, result }, k) => {
      const num = nums[k]!
      const v = result.light!
      const file = `${num}-${slug(job.company)}-${deps.date}.md`
      try {
        fs.writeFileSync(path.join(reports, file), reportMarkdown(job, v, num, { date: deps.date, runId: deps.runId, local: result.local }), { flag: 'wx' })
        fs.writeFileSync(path.join(additions, `${deps.runId}-${num}.tsv`), trackerRow(job, v, num, { date: deps.date }))
        states.push([`${deps.runId}-${num}`, job.url, 'completed', now, now, num, v.fit.toFixed(1), '-', '0'].map(cell).join('\t'))
        written.push({ jobId: job.id, num, report: `reports/${file}` })
      } catch (err) {
        errors++; unused.push(num)
        failed.push({ ...result, fate: 'failed', stage: 'write', reason: `Couldn't write report: ${(err as Error).message}`, light: null })
      }
    })
    if (unused.length) await deps.release?.(unused).catch(() => undefined)
  }

  if (states.length) {
    if (!fs.existsSync(stateFile)) fs.writeFileSync(stateFile, 'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries\n')
    fs.appendFileSync(stateFile, states.join('\n') + '\n')
    try { await deps.finalize?.() } catch (err) { errors++; return { written, errors, failed, finalizeError: (err as Error).message } }
  }
  return { written, errors, failed }
}
