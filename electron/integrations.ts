import path from 'node:path'

import { careerOpsRoot, dataRoot, launch, runScript, str, summary, type Handler, type RunSummary } from './context'
import { spawnSpec } from './runner'
import {
  disablePlugin, enablePlugin, getPluginDetail, installPlugin, listPlugins, removePlugin, setPluginConfig,
} from './integrations/plugins'
import {
  firecrawlDetail, firecrawlPull, firecrawlStart, firecrawlStop, setFirecrawlConfig,
} from './integrations/firecrawl'
import { previewSkillInstall, installSkill, listSkills, getSkillDetail, removeSkill, repairCareerOps, updateSkill, updateCareerOps, setSkillEnabled } from './integrations/skills'
import { parseGithubUrl } from './integrations/github'
import { addWebBoard, previewWebBoard } from './integrations/web-board'
import { boardDomain } from './integrations/browser-fetch'
import { acknowledge, browserLoginDetail, isAcknowledged, setBrowserLoginConfig, testBrowserLogin, warmPlaywrightMcp } from './integrations/browser-login'
import {
  addTrackedCompany, parseJobBoardUrl, readTrackedCompanies, removeTrackedCompany, setTrackedCompanyEnabled, withSourceIds, type Source,
} from './integrations/sources'
import type { Integration, IntegrationAction, IntegrationDetail, InstallPreview } from './contract'

// Integrations: skills, job sources, services (Firecrawl), career-ops plugins.
// Contract: renderer/lib/types.ts (CareerloomBridge › Integrations). Owned by the Integrations builder.

function portalsPath(): string {
  return path.join(dataRoot(), 'portals.yml')
}

function sources(): Source[] {
  try { return withSourceIds(readTrackedCompanies(portalsPath())) } catch { return [] }
}

function sourceToIntegration(c: Source): Integration {
  const enabled = c.enabled !== false
  const location = c.careers_url ?? c.api ?? null
  return {
    id: c.id, kind: 'source', name: c.name, summary: location ?? '(no URL)',
    status: enabled ? 'ready' : 'off', statusText: enabled ? 'Tracked' : 'Disabled',
    installedBy: 'user', source: location, actions: enabled ? ['disable', 'remove'] : ['enable', 'remove'],
  }
}

async function listAll(): Promise<Integration[]> {
  const firecrawlRow: Integration = await firecrawlDetail().then(({ checks: _c, config: _cf, logTail: _l, path: _p, ...row }) => row)
  const { checks: _c, config: _cf, logTail: _l, path: _p, ...browserRow } = browserLoginDetail()
  return [...listSkills(), ...sources().map(sourceToIntegration), firecrawlRow, browserRow, ...listPlugins()]
}

async function getDetail(id: string): Promise<IntegrationDetail> {
  if (id.startsWith('skill:')) return getSkillDetail(id)
  if (id.startsWith('plugin:')) return getPluginDetail(id)
  if (id === 'service:firecrawl') return firecrawlDetail()
  if (id === 'service:browser') return browserLoginDetail()
  if (id.startsWith('source:')) {
    const found = sources().find(c => c.id === id)
    if (!found) throw new Error(`Unknown job source "${id}"`)
    const row = sourceToIntegration(found)
    const urlOk = (() => { try { return Boolean(found.careers_url && new URL(found.careers_url)) } catch { return false } })()
    return { ...row, checks: [{ label: 'Careers URL parses', ok: urlOk, optional: !found.careers_url }], config: [], logTail: [], path: null }
  }
  throw new Error(`Unknown integration "${id}"`)
}

const DISCOVER_VENDORS = 'gh,ashby,lever,workable,smartrecruiters,recruitee,bamboohr,breezy,pinpoint,rippling,join'
// discover-ats.mjs's own arg parser has no `--` "end of flags" marker — a
// positional company name that happens to equal one of its known flags
// (`--write`, `--self-test`, …) is read as that flag, not as a name. Since we
// can't stop it at the flag boundary, we refuse anything that could be
// mistaken for one before it ever reaches the child process.
export const COMPANY_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .&'’-]{0,79}$/u

export function assertCompanyName(name: string): void {
  if (!COMPANY_NAME_RE.test(name)) throw new Error(`Not a valid company name: ${name.slice(0, 80)}`)
}

async function discoverCompany(name: string): Promise<{ plan: string; warnings: string[]; refusal: string | null }> {
  assertCompanyName(name)
  const { code, stdout, stderr } = await runScript(['discover-ats.mjs', name, '--vendors', DISCOVER_VENDORS], { timeoutMs: 25_000 })
  if (code !== 0) return { plan: '', warnings: [], refusal: stderr.trim() || 'discover-ats failed' }
  let out: { resolved?: Array<{ name: string; vendor?: string }>; unresolved?: Array<{ name: string; reason?: string }>; pendingEntries?: string; metadata?: { warnings?: string[] } }
  try { out = JSON.parse(stdout) } catch { return { plan: '', warnings: [], refusal: 'Could not read discover-ats output' } }
  const resolved = out.resolved ?? []
  if (resolved.length === 0) {
    const reason = out.unresolved?.[0]?.reason ?? 'No matching ATS board found'
    return { plan: '', warnings: [], refusal: reason }
  }
  const plan = `Add ${resolved.map(r => `${r.name} (${r.vendor ?? 'unknown'})`).join(', ')} to portals.yml`
  return { plan, warnings: out.metadata?.warnings ?? [], refusal: null }
}

async function previewInstall(rawUrl: string): Promise<InstallPreview> {
  const url = str(rawUrl, 'url').trim()
  if (!url) return { kind: 'source', name: url, plan: '', warnings: [], refusal: 'Paste a job board URL, a company name, or a GitHub skill URL' }
  if (parseGithubUrl(url)) return previewSkillInstall(url)
  const board = parseJobBoardUrl(url)
  if (board) {
    try {
      const dup = sources().some(c => c.careers_url === board.careersUrl)
      return { kind: 'source', name: board.slug, plan: `Track ${board.slug} on ${board.provider} — added to portals.yml`, warnings: [], refusal: dup ? 'Already tracked' : null }
    } catch (err) {
      return { kind: 'source', name: board.slug, plan: '', warnings: [], refusal: err instanceof Error ? err.message : String(err) }
    }
  }
  if (/^https?:\/\//i.test(url)) return { kind: 'source', name: url, plan: '', warnings: [], refusal: 'Not a supported job board (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, BambooHR, Breezy, Pinpoint, Rippling, Join) or a github.com URL — add any other board from Jobs → Portals → Add' }
  try {
    careerOpsRoot()
    const { plan, warnings, refusal } = await discoverCompany(url)
    return { kind: 'source', name: url, plan, warnings, refusal }
  } catch (err) {
    return { kind: 'source', name: url, plan: '', warnings: [], refusal: err instanceof Error ? err.message : String(err) }
  }
}

async function installIntegration(rawUrl: string): Promise<RunSummary> {
  const url = str(rawUrl, 'url').trim()
  if (parseGithubUrl(url)) return installSkill(url)
  const board = parseJobBoardUrl(url)
  if (board) {
    if (sources().some(c => c.careers_url === board.careersUrl)) throw new Error('Already tracked')
    addTrackedCompany(portalsPath(), { name: board.slug, careers_url: board.careersUrl, provider: board.provider, enabled: true })
    // Synthetic Run so the caller's `adopt(run)` + toast flow works uniformly.
    const now = Date.now()
    return { id: `source-${now}`, runner: 'setup', mode: 'source-install', label: `Track ${board.slug}`, input: url, startedAt: now, endedAt: now, status: 'done', usage: null }
  }
  if (/^https?:\/\//i.test(url)) throw new Error('Not a supported job board or a github.com URL')
  assertCompanyName(url)
  const root = careerOpsRoot()
  const run = launch(
    { runner: 'script', mode: 'source-install', label: `Add company: ${url}`, input: url },
    [{ spec: spawnSpec('node', ['discover-ats.mjs', url, '--vendors', DISCOVER_VENDORS, '--write']), cwd: root }],
  )
  return summary(run)
}

async function integrationAction(rawId: string, rawAction: string): Promise<IntegrationDetail | RunSummary | null> {
  const id = str(rawId, 'id')
  const action = rawAction as IntegrationAction
  if (id.startsWith('skill:')) {
    if (action === 'update') return id === 'skill:career-ops' ? updateCareerOps() : updateSkill(id)
    if (action === 'install' && id === 'skill:career-ops') return repairCareerOps()
    if (action === 'remove') { removeSkill(id); return null }
    if (action === 'enable' || action === 'disable') { setSkillEnabled(id, action === 'enable'); return getSkillDetail(id) }
    return getSkillDetail(id) // 'check'
  }
  if (id.startsWith('source:')) {
    if (action === 'remove') { removeTrackedCompany(portalsPath(), id); return null }
    if (action === 'enable' || action === 'disable') { setTrackedCompanyEnabled(portalsPath(), id, action === 'enable'); return getDetail(id) }
    return getDetail(id) // 'check'
  }
  if (id === 'service:firecrawl') {
    if (action === 'install') return firecrawlPull()
    if (action === 'start') return firecrawlStart()
    if (action === 'stop') return firecrawlStop()
    return firecrawlDetail() // 'check'
  }
  if (id === 'service:browser') return action === 'install' ? warmPlaywrightMcp() : testBrowserLogin()
  if (id.startsWith('plugin:')) {
    if (action === 'install') return installPlugin(id)
    if (action === 'remove') return removePlugin(id)
    if (action === 'enable') return enablePlugin(id)
    if (action === 'disable') { disablePlugin(id); return getPluginDetail(id) }
    return getPluginDetail(id) // 'check'
  }
  throw new Error(`Unknown integration "${id}"`)
}

function setIntegrationConfig(rawId: string, patch: unknown): IntegrationDetail | Promise<IntegrationDetail> {
  const id = str(rawId, 'id')
  const p = (patch ?? {}) as Record<string, string | boolean | null>
  if (id === 'service:firecrawl') { setFirecrawlConfig(p); return firecrawlDetail() }
  if (id === 'service:browser') { setBrowserLoginConfig(p); return browserLoginDetail() }
  if (id.startsWith('plugin:')) { setPluginConfig(id, p); return getPluginDetail(id) }
  throw new Error(`"${id}" has no configuration`)
}

export const integrationsHandlers: Record<string, Handler> = {
  listIntegrations: () => listAll(),
  getIntegration: (id: unknown) => getDetail(str(id, 'id')),
  previewInstall: (url: unknown) => previewInstall(str(url, 'url')),
  installIntegration: (url: unknown) => installIntegration(str(url, 'url')),
  integrationAction: (id: unknown, action: unknown) => integrationAction(str(id, 'id'), str(action, 'action')),
  setIntegrationConfig: (id: unknown, patch: unknown) => setIntegrationConfig(str(id, 'id'), patch),
  previewWebBoard: (urls: unknown) => previewWebBoard(urls),
  addWebBoard: (name: unknown, urls: unknown, instructions: unknown, fetch: unknown) => addWebBoard(name, urls, instructions, fetch ?? 'firecrawl'),
  /** Domains of the picked browser boards the user hasn't acknowledged the terms warning for yet. */
  browserConsentNeeded: (ids: unknown) => {
    const picked = new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [])
    return [...new Set(sources().filter(s => picked.has(s.id) && s.fetch === 'browser').map(boardDomain))].filter(d => !isAcknowledged(d))
  },
  acknowledgeBrowser: (domains: unknown) => { acknowledge(Array.isArray(domains) ? domains.filter((x): x is string => typeof x === 'string').slice(0, 20) : []); return true },
}
