// Binds the pure pipeline to the app: the user's profile/CV, the configured runner as the batched model, career-ops'
// own scripts for numbering and merging, and one tracked Run so progress, cost and Cancel show up on the Runs page.
import fs from 'node:fs'
import path from 'node:path'

import { parseCv } from '../ats/model'
import { careerOpsRoot, dataRoot, launchTask, readSettings, runScript, startAgentPrompt, summary, type RunRecord, type RunSummary } from '../context'
import type { JobListing } from '../contract'
import { modelFor } from '../job-view/agent'
import { evaluateSelected, mergeTracker, prefetchJd, profileProblems } from '../jobs-batch'
import { defaultPolicy, profileHash, readProfile, readStore, writeStore, type PrescreenEntry } from '../prescreen-core'
import { parseRange } from './stage4-write'
import { runPipeline } from './run'
import type { Candidate, EvalJob, LlmCall, StageMetric } from './types'
import { sha, writeJson } from './util'

const read = (file: string) => { try { return fs.readFileSync(file, 'utf8') } catch { return '' } }
const KEEP_DAYS = 7
const toEval = (j: JobListing): EvalJob => ({ id: j.id, url: j.url, title: j.title, company: j.company, location: j.location })

export function buildCandidate(): Candidate {
  const data = dataRoot()
  const cvText = read(path.join(data, 'cv.md'))
  const profile = readProfile(read(path.join(data, 'config', 'profile.yml')), read(path.join(data, 'modes', '_profile.md')), cvText)
  const store = readStore(data)
  const policy = store.policy ?? defaultPolicy(profile)
  const cv = parseCv(cvText)
  const pinned = new Set(Object.entries(store.feedback).filter(([, f]) => f.relevant).map(([id]) => id))
  return { profile, policy, cv, pinned, profileKey: `${profileHash(profile, policy)}-${sha(cvText, 8)}` }
}

/** The configured runner as a one-shot, text-only model call on its cheap (helper) tier. */
function agentLlm(): LlmCall {
  return req => new Promise((resolve, reject) => {
    const model = req.model ?? modelFor(readSettings(), 'helper')
    try {
      startAgentPrompt('Triage batch', 'evaluate-batch', `${req.system}\n\n${req.user}`, null, {
        textOnly: true, neutral: true, model,
        onExit: (r: RunRecord) => r.status === 'done'
          ? resolve({ text: r.log, inputTokens: r.usage?.inputTokens ?? Math.ceil((req.system.length + req.user.length) / 4), outputTokens: r.usage?.outputTokens ?? Math.ceil(r.log.length / 4), model: model ?? 'default', usd: r.usage?.costUsd ?? null })
          : reject(new Error(`the agent run ${r.status}`)),
      })
    } catch (err) { reject(err) }
  })
}

const reserve = async (n: number) => {
  const r = await runScript(['reserve-report-num.mjs', '--count', String(n)])
  if (r.code !== 0) throw new Error(r.stderr.split('\n')[0] || r.stdout)
  return parseRange(r.stdout, n)
}
const release = async (nums: string[]) => { for (const n of nums) await runScript(['reserve-report-num.mjs', '--release', n]) }

/** Resume the newest unfinished run for this exact selection, else start a new folder; drop old ones. */
function runFolder(root: string, ids: string[], profileKey: string): { runId: string; runDir: string } {
  const base = path.join(root, 'batch', 'careerloom', 'eval-runs')
  fs.mkdirSync(base, { recursive: true })
  const key = sha([...ids].sort().join('\n') + profileKey, 10)
  for (const d of fs.readdirSync(base)) {
    const dir = path.join(base, d)
    if (fs.statSync(dir).isDirectory() && Date.now() - fs.statSync(dir).mtimeMs > KEEP_DAYS * 864e5) fs.rmSync(dir, { recursive: true, force: true })
  }
  const open = fs.readdirSync(base).filter(d => d.startsWith(`${key}-`) && !fs.existsSync(path.join(base, d, 'done.json'))).sort().at(-1)
  const runId = open ?? `${key}-${Date.now().toString(36)}`
  return { runId, runDir: path.join(base, runId) }
}

const line = (m: StageMetric) => `▸ ${m.stage}: ${m.inCount} → ${m.outCount} in ${(m.ms / 1000).toFixed(1)}s${m.inputTokens ? ` · ${m.inputTokens + m.outputTokens} tokens` : ''}${m.usd ? ` · $${m.usd.toFixed(4)}` : ''}${m.errors ? ` · ${m.errors} errors` : ''}${m.note ? `\n  ⚠ ${m.note}` : ''}\n`

/** Staged evaluation of `jobs`: drops and judges them cheaply, writes quick reports, hands the best to the full agent. */
export async function evaluateStaged(jobs: JobListing[], env: NodeJS.ProcessEnv): Promise<RunSummary> {
  if (readSettings().runner === 'api') return evaluateSelected(jobs, env) // the OpenRouter runner can't take free-form prompts: the legacy path explains it
  const root = careerOpsRoot()
  const problems = profileProblems(root, dataRoot())
  if (problems.length) throw new Error(`Personalize your profile first so scores mean something: ${problems.join('; ')}. Use Resume → Build my profile.`)
  const candidate = buildCandidate()
  const { runId, runDir } = runFolder(root, jobs.map(j => j.id), candidate.profileKey)
  const date = new Date().toISOString().slice(0, 10)
  const record = { runner: 'script' as const, mode: 'evaluate', label: `Evaluate ${jobs.length} jobs (staged)`, input: null, jobId: null }

  return summary(launchTask(record, async (log, run) => {
    const ac = new AbortController()
    const watch = setInterval(() => { if (run.status === 'cancelled') ac.abort() }, 500)
    try {
      const out = await runPipeline(jobs.map(toEval), {
        runId, runDir, cacheFile: path.join(root, 'batch', 'careerloom', 'eval-cache.json'), candidate, fetchJd: j => prefetchJd(j.url), llm: agentLlm(), signal: ac.signal,
        config: { batchSize: 6, jdChars: 1200, maxPromptChars: 12_000, llmConcurrency: 2, budgetUsd: 1, model: modelFor(readSettings(), 'helper') },
        write: { root, date, runId, reserve, release, finalize: () => mergeTracker().then(() => runScript(['reconcile-pipeline.mjs'])).then(() => undefined) },
        onStage: m => log(line(m)),
      })
      const total = out.metrics.reduce((a, m) => ({ i: a.i + m.inputTokens, o: a.o + m.outputTokens }), { i: 0, o: 0 })
      run.usage = { costUsd: out.totalUsd || null, inputTokens: total.i, outputTokens: total.o, turns: null, durationMs: Date.now() - run.startedAt }
      if (out.cancelled) { run.status = 'cancelled'; log('■ Cancelled — finished stages are kept; start the same selection again to resume.\n'); return }
      writeJson(path.join(runDir, 'done.json'), { at: Date.now() })

      // Why each dropped job was dropped: shown on the Jobs screen like any pre-screen verdict ("unlikely", still evaluable).
      const at = new Date().toISOString()
      const results: Record<string, PrescreenEntry> = {}
      for (const r of out.results) if (r.fate === 'skip') results[r.jobId] = { bucket: 'unlikely', fit: null, reason: r.reason, gate: 'keywords', signals: { otherFunction: null, targetRole: null }, at, profileHash: candidate.profileKey, method: 'rules' }
      if (Object.keys(results).length) writeStore(dataRoot(), { results })

      const by = (f: string) => out.results.filter(r => r.fate === f).length
      log(`✓ ${by('light')} quick reports written · ${by('skip')} skipped (reasons on the Jobs screen) · ${by('failed')} left pending · $${out.totalUsd.toFixed(4)}\n`)
      const deep = out.results.filter(r => r.fate === 'deep').map(r => jobs.find(j => j.id === r.jobId)!).filter(Boolean)
      if (deep.length) {
        log(`▸ Escalating ${deep.length} best matches to the full evaluation (one run each, see Runs).\n`)
        await evaluateSelected(deep, env)
      }
    } finally { clearInterval(watch) }
  }))
}

