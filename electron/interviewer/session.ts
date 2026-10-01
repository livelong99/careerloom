// Glue between Copilot practice and the interviewer engine: builds the runner from the job's question base and records what
// happened (SessionDetail.interview, KbItem stats, skill signal). The KB store, the voice and the overlay events are injected (WP1/WP5).
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { PracticeSink } from '../copilot/practice'
import type { KbItem, KbSkillSignal, SkillNode } from '../kb/types'
import { planHash, previewPlan } from './plan'
import { createInterviewerRunner, type InterviewerRunner, type SpeakState, type Speaker } from './runner'
import type { InterviewPlan, InterviewRecord, QuestionResult } from './types'

export type InterviewPool = { items: KbItem[]; skills: SkillNode[]; /** ids asked in the last few sessions */ recent?: ReadonlySet<string> }
export type InterviewDeps = {
  /** The job's question base (WP1 store); null = none yet. */
  pool(jobId: string): InterviewPool | null
  /** Model call sized for probes and scoring (JSON, ~500 tokens); falls back to the practice follow-up call. */
  complete?(system: string, user: string): Promise<string>
  /** The voice (WP5); absent = captions only. */
  speaker?(plan: InterviewPlan): Speaker
  /** Write-back of per-item stats (WP1 store). */
  recordStats?(jobId: string, itemId: string, stats: KbItem['stats']): void
  /** The session is over (stop or done): release the voice. */
  ended?(): void
  onState?(s: { state: SpeakState; questionId: string | null; voice: string | null }): void
}
export type Interview = { runner: InterviewerRunner; record(): InterviewRecord; control(c: 'replay' | 'skip' | 'hint'): void; skillSignal(): SkillSignal }
/** Mean score per skill from this session's scored questions, for the Skill-up ordering. */
export type SkillSignal = KbSkillSignal

export const NO_BASE = 'This job has no question base yet: research it in the Knowledge base tab, or practise with the report questions'

export function createInterview(o: {
  jobId: string; sessionId: string; plan: InterviewPlan; deps: InterviewDeps; sink: PracticeSink
  complete?: (system: string, user: string) => Promise<string>; answerMs: number; now?: () => number
}): Interview {
  const pool = o.deps.pool(o.jobId)
  if (!pool || previewPlan(pool.items, o.plan, { skills: pool.skills }).questions === 0) throw new Error(NO_BASE)
  const byId = new Map(pool.items.map(i => [i.id, i]))
  const runner = createInterviewerRunner({
    plan: o.plan, sessionId: o.sessionId, pool: pool.items, skills: pool.skills, recent: pool.recent, sink: o.sink, complete: o.deps.complete ?? o.complete,
    speak: o.deps.speaker?.(o.plan), answerMs: o.answerMs, now: o.now,
    onState: s => o.deps.onState?.({ ...s, voice: o.plan.voice.voiceId }),
    onResult: (_r, item, stats) => { try { o.deps.recordStats?.(o.jobId, item.id, stats) } catch { /* stats are best effort */ } },
  })
  const results = (): QuestionResult[] => runner.results()
  return {
    runner,
    record: () => ({ planHash: planHash(o.plan), itemIds: runner.state().asked, perQuestion: results() }),
    control: c => { if (c === 'replay') runner.replay(); else if (c === 'skip') runner.skip(); else runner.hint() },
    skillSignal: () => {
      const acc: Record<string, number[]> = {}
      for (const r of results()) if (r.score !== null) for (const s of byId.get(r.itemId)?.skills ?? []) (acc[s] ??= []).push(r.score)
      return { jobId: o.jobId, at: (o.now ?? Date.now)(), skills: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { avg: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10, n: v.length }])) }
    },
  }
}

const signalFile = (dir: string, jobId: string): string => join(dir, 'skill-signal', `${createHash('sha256').update(jobId).digest('hex').slice(0, 24)}.json`)
/** Null when there is none (or it is unreadable): the signal only reorders Skill-up, never gates it. */
export function readSkillSignal(dir: string, jobId: string): SkillSignal | null {
  try { const s = JSON.parse(readFileSync(signalFile(dir, jobId), 'utf8')) as SkillSignal; return s && typeof s.skills === 'object' && s.skills !== null ? s : null } catch { return null }
}
/** One small file per job under `<dir>/skill-signal/`; the Skill-up tab reads it when an IPC for it exists (deferred: contract is frozen). */
export function writeSkillSignal(dir: string, s: SkillSignal): void {
  if (Object.keys(s.skills).length === 0) return
  const folder = join(dir, 'skill-signal')
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const file = signalFile(dir, s.jobId)
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 })
  renameSync(tmp, file)
}
