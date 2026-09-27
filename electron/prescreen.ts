import fs from 'node:fs'
import path from 'node:path'

import { dataRoot, str, userFile, type Handler } from './context'
import type { JobListing, PrescreenModel, PrescreenPolicy, PrescreenRun, PrescreenStatus } from './contract'
import { BASE_HEAD_VERSION, killSidecars, runSidecar, sidecarScript } from './fit-sidecar'
import { iscoLabel } from './isco3'
import { jobsHandlers } from './jobs'
import {
  buildExamples, cleanPolicy, defaultPolicy, keywordPrior, keywordSignals, labelHash, personalReady, profileHash, readProfile, readStore, screen, withStaleness, writeStore,
  type PrescreenBucket, type PrescreenEntry, type PrescreenGate, type PrescreenMap, type Profile,
} from './prescreen-core'
import { assertMemory, findRuntime, localModelHandlers, MODEL, type Runtime } from './prescreen-model'

// Pre-screen: rule gates (location → function → seniority) drop what basic reasoning can, then the local
// model sorts the rest: a shipped base head (public ESCO data) scores fit to the profile's target occupations
// with zero labels; a personal layer on top is used only when it beats the base in CV. No local model → rules only.

type Layer = { a: number; b: number; w: number[] }
type FitFile = { layer: Layer | null; ship: boolean; reason: 'labels' | 'no-gain' | null; gain: number; dLogloss: number; groups: string[]; n: number; pos: number; neg: number; trainedAt: string; labelHash: string }

const read = (file: string) => { try { return fs.readFileSync(file, 'utf8') } catch { return '' } }
const fitFile = (root: string) => path.join(root, 'data', 'careerloom-fit.json')
const readFit = (root: string): FitFile | null => { try { const f = JSON.parse(read(fitFile(root))) as FitFile; return Array.isArray(f.groups) ? f : null } catch { return null } } // older formats → retrain
const modelInfo = (f: FitFile | null): PrescreenModel | null => f && { personal: !!f.layer, gain: f.gain, groups: f.groups.map(iscoLabel), n: f.n, pos: f.pos, neg: f.neg, trainedAt: f.trainedAt }
const NO_TARGETS = 'Add target roles to config/profile.yml so the local model knows what you’re looking for — rules only for now'

function currentProfile(root: string): Profile {
  return readProfile(read(path.join(root, 'config', 'profile.yml')), read(path.join(root, 'modes', '_profile.md')), read(path.join(root, 'cv.md')))
}

function context() {
  const root = dataRoot()
  const profile = currentProfile(root)
  const store = readStore(root)
  const policy = store.policy ?? defaultPolicy(profile)
  return { root, profile, store, policy, hash: profileHash(profile, policy) }
}

// ponytail: one sidecar at a time app-wide (one model in memory); each exits when done, so idle = unloaded.
let queue: Promise<unknown> = Promise.resolve()
const sidecar = <T>(rt: Runtime, body: object): Promise<T> => {
  const dir = userFile('fit')
  const call = async () => {
    await assertMemory()
    return runSidecar<T>(rt.python, [sidecarScript(dir)], { ...body, model: rt.model, weights: rt.weights, cache: path.join(dir, 'cache') })
  }
  const next = queue.then(call, call)
  queue = next.catch(() => {})
  return next
}

/** The personal layer for the current labels, profile targets and base head: reused while all three are
 *  unchanged, else refit and re-gated; the gate result is kept in careerloom-fit.json. null = under 5 labels
 *  of each class (the gate would refuse), so the base model scores alone without spawning. */
async function ensureLayer(rt: Runtime, force = false): Promise<FitFile | null> {
  const { root, profile, store } = context()
  const examples = buildExamples(jobsHandlers.listJobs!() as JobListing[], profile, store.feedback)
  if (!personalReady(examples)) return null
  const hash = labelHash(examples, rt.model + BASE_HEAD_VERSION + JSON.stringify(profile.targets))
  const cur = readFit(root)
  if (!force && cur?.labelHash === hash) return cur
  const res = await sidecar<Omit<FitFile, 'trainedAt' | 'labelHash'>>(rt, { cmd: 'personal_fit', examples, targets: profile.targets })
  const fit: FitFile = { ...res, trainedAt: new Date().toISOString(), labelHash: hash }
  fs.mkdirSync(path.dirname(fitFile(root)), { recursive: true })
  fs.writeFileSync(fitFile(root), JSON.stringify(fit))
  return fit
}

export function prescreenStatus(): PrescreenStatus {
  const { root, profile, store, policy } = context()
  const rt = findRuntime()
  const examples = buildExamples(jobsHandlers.listJobs!() as JobListing[], profile, store.feedback)
  const pos = examples.filter(e => e.label === 1).length
  return {
    available: !!rt,
    backend: rt ? MODEL : null,
    reason: !rt ? 'No local model installed — using rules and keywords' : profile.targets.length ? null : NO_TARGETS,
    model: rt ? modelInfo(readFit(root)) : null,
    groups: rt && store.groups ? store.groups.map(iscoLabel) : [],
    labels: { pos, neg: examples.length - pos },
    policy,
    defaults: defaultPolicy(profile),
    feedback: Object.fromEntries(Object.entries(store.feedback).map(([id, f]) => [id, f.relevant])),
  }
}

/** Screen `ids` (empty = every job without an evaluation report) into likely / uncertain / unlikely.
 *  Nothing is discarded: every bucket can still be evaluated. */
export async function prescreenJobs(rawIds: unknown): Promise<PrescreenRun> {
  if (rawIds != null && (!Array.isArray(rawIds) || !rawIds.every(x => typeof x === 'string'))) throw new Error('ids must be an array of strings')
  const wanted = new Set((rawIds as string[] | null | undefined) ?? [])
  const all = jobsHandlers.listJobs!() as JobListing[]
  const jobs = wanted.size ? all.filter(j => wanted.has(j.id)) : all.filter(j => j.reportNum === null)
  if (!jobs.length) throw new Error(wanted.size ? 'Those jobs are no longer listed — refresh and try again' : 'No unevaluated jobs to pre-screen')

  const { root, profile, store, policy, hash } = context()
  const rt = findRuntime()
  let fit: FitFile | null = null
  let note = !rt ? prescreenStatus().reason : profile.targets.length ? null : NO_TARGETS
  let fits: number[] | null = null
  let groups: string[] | undefined
  if (rt && !note) {
    try {
      fit = await ensureLayer(rt)
      const texts = jobs.map(j => j.title.trim() || j.url)
      const kw = jobs.map(j => keywordPrior(keywordSignals(j.title, profile)))
      const res = await sidecar<{ p: number[]; groups: string[] }>(rt, { cmd: 'predict', texts, kw, targets: profile.targets, layer: fit?.layer ?? null })
      fits = res.p
      groups = res.groups
    } catch (err) {
      fit = null
      note = `Local model failed — rules only: ${(err as Error).message}`
    }
  }

  const method = fits ? 'model' : 'rules'
  const at = new Date().toISOString()
  const counts: Record<PrescreenBucket, number> = { likely: 0, uncertain: 0, unlikely: 0 }
  const dropped: Partial<Record<PrescreenGate, number>> = {}
  const results: PrescreenMap = Object.fromEntries(jobs.map((j, i) => {
    const signals = keywordSignals(j.title, profile)
    const p = fits?.[i] ?? null
    const v = screen(j, signals, profile, policy, p, store.feedback[j.id]?.relevant)
    counts[v.bucket]++
    if (v.bucket === 'unlikely') dropped[v.gate] = (dropped[v.gate] ?? 0) + 1
    return [j.id, { ...v, fit: p, signals, at, profileHash: hash, method } satisfies PrescreenEntry]
  }))
  writeStore(root, { results, groups })
  return { results, method, model: modelInfo(fit), note, counts, dropped }
}

/** Persisted results for merging into Jobs; `stale` where the profile or policy changed since. */
export function readPrescreen() {
  const { store, hash } = context()
  return withStaleness(store.results, hash)
}

export function savePrescreenPolicy(raw: unknown): PrescreenPolicy {
  const policy = cleanPolicy(raw)
  writeStore(dataRoot(), { policy })
  return policy
}

/** The user's own label: overrides that job's bucket now and trains the model next time (weight 5). */
export function prescreenFeedback(rawId: unknown, relevant: unknown): PrescreenEntry | null {
  const id = str(rawId, 'id')
  if (relevant !== null && typeof relevant !== 'boolean') throw new Error('relevant must be true, false or null')
  const { root, profile, store, policy, hash } = context()
  const job = (jobsHandlers.listJobs!() as JobListing[]).find(j => j.id === id)
  if (!job) throw new Error('That job is no longer listed — refresh and try again')
  const { [id]: _old, ...rest } = store.feedback
  const feedback = relevant === null ? rest : { ...rest, [id]: { relevant, text: job.title, at: new Date().toISOString() } }
  const prev = store.results[id]
  const signals = keywordSignals(job.title, profile)
  const v = screen(job, signals, profile, policy, prev?.fit ?? null, relevant ?? undefined)
  const entry: PrescreenEntry = { ...v, fit: prev?.fit ?? null, signals, at: new Date().toISOString(), profileHash: hash, method: prev?.method ?? 'rules' }
  writeStore(root, { feedback, results: { [id]: entry } })
  return entry
}

export async function retrainPrescreen(): Promise<PrescreenModel> {
  const rt = findRuntime()
  if (!rt) throw new Error(prescreenStatus().reason ?? 'The local model is unavailable')
  const fit = await ensureLayer(rt, true)
  if (!fit) throw new Error('The personal layer needs at least 5 Relevant and 5 Not relevant jobs — the base model scores until then')
  return modelInfo(fit)!
}

/** App quit: stop any in-flight sidecar. */
export const stopPrescreen = killSidecars

export const prescreenHandlers: Record<string, Handler> = {
  prescreenStatus,
  prescreenJobs,
  readPrescreen,
  savePrescreenPolicy,
  prescreenFeedback,
  retrainPrescreen,
  ...localModelHandlers,
}
