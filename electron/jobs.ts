import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { listReports, readPipeline, readTracker } from './careerops'
import { careerOpsRoot, dataRoot, launch, readRunHistory, runs, startAgentPrompt, str, summary, type Handler } from './context'
import type { JobListing, Portal } from './contract'
import { firecrawlReady } from './integrations/firecrawl'
import { readRegistry } from './integrations/registry'
import { deletePortals, getPortalDetail, readHiddenJobs, seedDefaultPortals, seedOnce, setPortalsEnabled, switchToStarterPack, unevaluatedOf, updatePortal } from './integrations/portal-admin'
import { latestHealth, mergeScanHistory, parseScanRuns } from './scan-history'
import { readAllSources, subsetScanYaml, type Source } from './integrations/sources'
import { readBoardIndex, scanWebBoards } from './integrations/web-board'
import { isWebBoard, portalIdForUrl } from './integrations/web-board-core'
import { evaluateSelected } from './jobs-batch'
import { deriveJobs, derivePortals, parseScanHistory, readGuidelines, sanitizeName, upsertGuideline } from './jobs-data'
import { resolveBin, spawnSpec } from './runner'

// Jobs: portals + discovered jobs (scan-history/pipeline/tracker), scans, batch evaluation, per-portal guidelines.
// Contract: electron/contract.ts + renderer/lib/types.ts (CareerloomBridge).

const MAX_IDS = 200
const MAX_GUIDELINE = 4000

const read = (file: string) => { try { return fs.readFileSync(file, 'utf8') } catch { return '' } }
const mtime = (file: string) => { try { return fs.statSync(file).mtimeMs } catch { return null } }

/** Temp file + rename so a crash mid-write never truncates the user's file. */
function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

const portalsFile = () => path.join(dataRoot(), 'portals.yml')
const customFile = () => path.join(dataRoot(), 'modes', '_custom.md')
const sources = (): Source[] => readAllSources(portalsFile())

export function listJobs(): JobListing[] {
  const root = dataRoot()
  const srcs = sources()
  const webIndex = readBoardIndex()
  const hidden = readHiddenJobs()
  // Job boards (aggregators) name many companies: attribute by the scan's provider column instead.
  const boardByAts = new Map(srcs.filter(s => s.list === 'job_boards' && s.provider).reverse().map(s => [`${s.provider}-api`, s.id]))
  return deriveJobs({
    scan: parseScanHistory(read(path.join(root, 'data', 'scan-history.tsv'))),
    pipeline: readPipeline(root),
    tracker: readTracker(root),
    reports: listReports(root),
    sources: srcs,
    cvMtime: mtime(path.join(root, 'cv.md')),
    reportMtime: rel => mtime(path.join(root, rel)),
  // Web-board postings carry many companies — file them under the board that found them.
  }).filter(j => !hidden.has(j.id))
    .map(j => (j.portalId ? j : { ...j, portalId: portalIdForUrl(webIndex, j.url, srcs) ?? boardByAts.get(j.ats ?? '') ?? null }))
}

const listPortals = (): Portal[] => {
  seedOnce()
  const srcs = sources()
  const health = latestHealth(read(path.join(dataRoot(), 'data', 'portal-health.tsv')))
  return derivePortals(srcs, listJobs(), readGuidelines(read(customFile()))).map((p, i) => {
    const s = srcs[i]!
    const h = health.get(s.name)
    return {
      ...p, fetch: s.fetch ?? null, kind: s.fetch ? 'web' as const : s.list === 'job_boards' ? 'board' as const : 'company' as const,
      health: h?.status ?? null, checkedAt: h?.at ?? null,
    }
  })
}

function ids(v: unknown, name: string): string[] {
  if (!Array.isArray(v) || v.length > MAX_IDS || !v.every(x => typeof x === 'string' && x.length <= 2048)) {
    throw new Error(`${name} must be an array of at most ${MAX_IDS} strings`)
  }
  return v as string[]
}

function portalById(id: unknown): Source {
  const found = sources().find(s => s.id === str(id, 'id'))
  if (!found) throw new Error('That portal is no longer in portals.yml — refresh and try again')
  return found
}

async function agentEnv(): Promise<NodeJS.ProcessEnv> {
  return (await firecrawlReady()) ? { FIRECRAWL_URL: readRegistry().firecrawl.url } : {}
}

/** Jobs with an evaluate run still going — a second Evaluate click must not start a duplicate worker. */
export const evaluatingJobIds = (all: Iterable<{ mode: string; status: string; jobId?: string | null }>): Set<string> =>
  new Set([...all].filter(r => r.mode === 'evaluate' && r.status === 'running' && r.jobId).map(r => r.jobId as string))

export const jobsHandlers: Record<string, Handler> = {
  listJobs,
  listPortals,
  /** Empty ids = every enabled portal; otherwise scan.mjs against a temp portals.yml holding just those. */
  scanPortals: async (raw: unknown) => {
    if ([...runs.values()].some(r => r.mode === 'scan' && r.status === 'running')) throw new Error('A scan is already running — wait for it to finish or cancel it in Runs')
    const picked = new Set(ids(raw, 'ids'))
    const cwd = careerOpsRoot()
    const all = sources()
    const selected = all.filter(s => picked.has(s.id))
    if (picked.size && !selected.length) throw new Error('None of those portals are in portals.yml — refresh and try again')
    // Web boards run their own Firecrawl task; scan.mjs skips them ("no provider matched") anyway.
    // Browser boards only run when picked by hand — never in "Scan all".
    const web = (picked.size ? selected : all.filter(s => s.enabled !== false && s.fetch !== 'browser')).filter(isWebBoard)
    const chosen = selected.filter(s => !isWebBoard(s))
    if (picked.size && !chosen.length) return scanWebBoards(web)
    if (web.length) await scanWebBoards(web).catch(err => console.error('web board scan not started:', err))
    let tmpDir: string | null = null
    const env: NodeJS.ProcessEnv = {}
    if (chosen.length) {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'careerloom-scan-'))
      env.CAREER_OPS_PORTALS = path.join(tmpDir, 'portals.yml')
      fs.writeFileSync(env.CAREER_OPS_PORTALS, subsetScanYaml(read(portalsFile()), chosen))
    }
    // Packaged app without a system node: Electron's own binary runs as Node (same fallback as runScript).
    const spec = resolveBin('node')
      ? spawnSpec('node', ['scan.mjs'], env)
      : { bin: process.execPath, args: ['scan.mjs'], env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' } }
    const label = chosen.length ? `Scan ${chosen.length === 1 ? chosen[0]!.name : `${chosen.length} portals`}` : 'Scan all portals'
    return summary(launch(
      { runner: 'script', mode: 'scan', label, input: chosen.map(s => s.name).join(', ') || null },
      [{ spec, cwd }],
      { onExit: () => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }) } },
    ))
  },
  /** Evaluate exactly the selected jobs (career-ops' headless batch worker, one run each).
   *  Already-evaluated jobs are skipped unless `force` (re-evaluate after a résumé change). */
  evaluateJobs: async (raw: unknown, force: unknown) => {
    const wanted = new Set(ids(raw, 'ids'))
    if (!wanted.size) throw new Error('Select at least one job to evaluate')
    const busy = evaluatingJobIds(runs.values())
    const jobs = listJobs().filter(j => wanted.has(j.id) && !busy.has(j.id) && /^https?:\/\//i.test(j.url) && (force === true || j.reportNum === null))
    if (!jobs.length) throw new Error('Those jobs are already evaluated or being evaluated — use Re-evaluate to run them again')
    return evaluateSelected(jobs, await agentEnv())
  },
  /** Unevaluated jobs per portal id — the delete dialog offers to hide them. */
  countUnevaluated: (raw: unknown) => {
    const jobs = listJobs()
    return Object.fromEntries(ids(raw, 'ids').map(id => [id, unevaluatedOf(jobs, id).length]))
  },
  deletePortals: (raw: unknown, hideUnevaluated: unknown) => {
    const picked = new Set(ids(raw, 'ids'))
    const chosen = sources().filter(s => picked.has(s.id))
    if (!chosen.length) throw new Error('Those portals are no longer in portals.yml — refresh and try again')
    const jobs = hideUnevaluated === true ? listJobs() : []
    return deletePortals(chosen, chosen.flatMap(s => unevaluatedOf(jobs, s.id)))
  },
  addDefaultPortals: () => seedDefaultPortals(),
  switchToStarterPack: () => {
    const jobs = listJobs()
    return switchToStarterPack(removed => removed.flatMap(s => unevaluatedOf(jobs, s.id)))
  },
  getPortal: (id: unknown) => getPortalDetail(id),
  updatePortal: (id: unknown, patch: unknown) => updatePortal(id, patch),
  setPortalsEnabled: (raw: unknown, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be true or false')
    return setPortalsEnabled(ids(raw, 'ids'), enabled)
  },
  /** Boards → Scans: scan-runs.tsv merged with Careerloom's scan runs, newest first. */
  listScans: () => {
    const live = [...runs.values()].map(summary)
    const liveIds = new Set(live.map(r => r.id))
    const history = [...readRunHistory().filter(r => !liveIds.has(r.id)), ...live]
    return mergeScanHistory(parseScanRuns(read(path.join(dataRoot(), 'data', 'scan-runs.tsv'))), history).slice(0, 200)
  },
  setPortalGuideline: (id: unknown, text: unknown) => {
    const portal = portalById(id)
    const body = str(text, 'text')
    if (body.length > MAX_GUIDELINE) throw new Error(`Keep guidelines under ${MAX_GUIDELINE} characters`)
    const file = customFile()
    // First write: start from career-ops' template so its house-rule scaffolding stays.
    const base = fs.existsSync(file) ? read(file) : read(path.join(careerOpsRoot(), 'modes', '_custom.template.md'))
    writeAtomic(file, upsertGuideline(base, portal.name, body))
    return listPortals().find(p => p.id === portal.id)!
  },
  improvePortalGuideline: (id: unknown, draft: unknown) => {
    const portal = portalById(id)
    const text = str(draft, 'draft').trim()
    if (!text) throw new Error('Write a draft guideline first')
    if (text.length > MAX_GUIDELINE) throw new Error(`Keep guidelines under ${MAX_GUIDELINE} characters`)
    const name = sanitizeName(portal.name)
    const prompt = `/career-ops Rewrite the user's draft below into a precise, concise instruction set for scanning and evaluating ${name} jobs. `
      + 'Ground it in career-ops modes/scripts (scan, pipeline, evaluate, _shared.md scoring) and any installed skills that fit; keep it procedural — no new factual claims about the candidate. '
      + `Write the result into modes/_custom.md under "### ${name}" inside the "## Portal guidelines (managed by Careerloom)" section `
      + '(create the section at the end if missing; replace only that subsection; preserve everything else in the file). Reply with the final text.\n\n'
      + `User draft:\n"""\n${text}\n"""`
    return startAgentPrompt(`Improve guideline: ${name}`, 'guideline', prompt, name)
  },
}
