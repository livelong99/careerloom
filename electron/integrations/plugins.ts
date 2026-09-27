// career-ops plugins: bundled (plugins/), user-installed (plugins.local/), and
// the community registry (plugins-registry/*.json, not yet installed).
// Mutations reuse career-ops' own plugins.mjs CLI (launch/runScript) rather than
// re-implementing its clone/lock/consent logic here.
import fs from 'node:fs'
import path from 'node:path'
import { isMap, parseDocument, YAMLMap } from 'yaml'

import { careerOpsRoot, launch, summary, type RunSummary } from '../context'
import { spawnSpec } from '../runner'
import { readEnvPresence, upsertEnv } from './env'
import type { ConfigField, Integration, IntegrationDetail } from '../contract'

type Manifest = { id: string; name: string; version?: string; description: string; hooks: string[]; requiredEnv: string[] }
type RegistryEntry = Manifest & { repo: string; sha: string }
type PluginsConfig = { plugins?: Record<string, { enabled?: boolean }> }

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T } catch { return null }
}

function manifestsIn(dir: string): Manifest[] {
  let names: string[] = []
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('_')).map(e => e.name) } catch { return [] }
  return names.map(name => readJson<Manifest>(path.join(dir, name, 'manifest.json'))).filter((m): m is Manifest => m !== null)
}

function registryEntries(root: string): RegistryEntry[] {
  const dir = path.join(root, 'plugins-registry')
  let files: string[] = []
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')) } catch { return [] }
  return files.map(f => readJson<RegistryEntry>(path.join(dir, f))).filter((e): e is RegistryEntry => e !== null)
}

function readPluginsConfig(root: string): PluginsConfig {
  try { return (parseDocument(fs.readFileSync(path.join(root, 'config', 'plugins.yml'), 'utf8')).toJS() ?? {}) as PluginsConfig } catch { return {} }
}

function envPath(root: string): string {
  return path.join(root, '.env')
}

function toIntegration(m: Manifest, opts: { installedBy: 'app' | 'user'; enabled: boolean | undefined; removable: boolean; root: string }): Integration {
  const missing = m.requiredEnv.filter(k => !readEnvPresence(envPath(opts.root), [k])[k])
  const enabled = opts.enabled === true
  const status = !enabled ? 'off' : missing.length > 0 ? 'needs_setup' : 'ready'
  const statusText = !enabled ? 'Disabled' : missing.length > 0 ? `Missing keys: ${missing.join(', ')}` : 'Enabled'
  const actions: Integration['actions'] = enabled
    ? [...(opts.removable ? ['remove' as const] : []), 'disable', 'check']
    : [...(opts.removable ? ['remove' as const] : []), 'enable', 'check']
  return {
    id: `plugin:${m.id}`, kind: 'plugin', name: m.name, summary: m.description,
    status, statusText, installedBy: opts.installedBy, source: null, actions,
  }
}

function findManifest(root: string, id: string): { manifest: Manifest; removable: boolean } | null {
  const bundled = manifestsIn(path.join(root, 'plugins')).find(m => m.id === id)
  if (bundled) return { manifest: bundled, removable: false }
  const local = manifestsIn(path.join(root, 'plugins.local')).find(m => m.id === id)
  if (local) return { manifest: local, removable: true }
  return null
}

export function listPlugins(): Integration[] {
  let root: string
  try { root = careerOpsRoot() } catch { return [] }
  const cfg = readPluginsConfig(root)
  const bundled = manifestsIn(path.join(root, 'plugins'))
  const local = manifestsIn(path.join(root, 'plugins.local'))
  const installedIds = new Set([...bundled, ...local].map(m => m.id))
  const bundledRows = bundled.map(m => toIntegration(m, { installedBy: 'app', enabled: cfg.plugins?.[m.id]?.enabled, removable: false, root }))
  const localRows = local.map(m => toIntegration(m, { installedBy: 'user', enabled: cfg.plugins?.[m.id]?.enabled, removable: true, root }))
  const available = registryEntries(root).filter(e => !installedIds.has(e.id)).map((e): Integration => ({
    id: `plugin:${e.id}`, kind: 'plugin', name: e.name, summary: e.description,
    status: 'not_installed', statusText: 'Available', installedBy: 'user', source: e.repo, actions: ['install'],
  }))
  return [...bundledRows, ...localRows, ...available]
}

export function getPluginDetail(id: string): IntegrationDetail {
  const pluginId = id.replace(/^plugin:/, '')
  const root = careerOpsRoot()
  const found = findManifest(root, pluginId)
  if (!found) {
    const reg = registryEntries(root).find(e => e.id === pluginId)
    if (!reg) throw new Error(`Unknown plugin "${id}"`)
    return {
      id, kind: 'plugin', name: reg.name, summary: reg.description, status: 'not_installed', statusText: 'Not installed',
      installedBy: 'user', source: reg.repo, actions: ['install'], checks: [], config: [], logTail: [], path: null,
    }
  }
  const cfg = readPluginsConfig(root)
  const row = toIntegration(found.manifest, { installedBy: found.removable ? 'user' : 'app', enabled: cfg.plugins?.[pluginId]?.enabled, removable: found.removable, root })
  const presence = readEnvPresence(envPath(root), found.manifest.requiredEnv)
  const config: ConfigField[] = found.manifest.requiredEnv.map(key => ({
    key, label: key, type: 'secret', value: presence[key] ? 'set' : null, help: 'Stored in career-ops’ .env',
  }))
  return {
    ...row,
    checks: found.manifest.requiredEnv.map(key => ({ label: key, ok: presence[key] })),
    config, logTail: [], path: path.join(root, found.removable ? 'plugins.local' : 'plugins', pluginId),
  }
}

export function installPlugin(id: string): RunSummary {
  const pluginId = id.replace(/^plugin:/, '')
  const root = careerOpsRoot()
  const run = launch(
    { runner: 'script', mode: 'plugin-install', label: `Add plugin: ${pluginId}`, input: pluginId },
    [{ spec: spawnSpec('node', ['plugins.mjs', 'add', pluginId, '--confirm']), cwd: root }],
  )
  return summary(run)
}

export function removePlugin(id: string): RunSummary {
  const pluginId = id.replace(/^plugin:/, '')
  const root = careerOpsRoot()
  const found = findManifest(root, pluginId)
  if (found && !found.removable) throw new Error(`"${pluginId}" ships with career-ops and can’t be removed — disable it instead`)
  const run = launch(
    { runner: 'script', mode: 'plugin-remove', label: `Remove plugin: ${pluginId}`, input: pluginId },
    [{ spec: spawnSpec('node', ['plugins.mjs', 'remove', pluginId]), cwd: root }],
  )
  return summary(run)
}

export function enablePlugin(id: string): RunSummary {
  const pluginId = id.replace(/^plugin:/, '')
  const root = careerOpsRoot()
  const run = launch(
    { runner: 'script', mode: 'plugin-enable', label: `Enable plugin: ${pluginId}`, input: pluginId },
    [{ spec: spawnSpec('node', ['plugins.mjs', 'enable', pluginId, '--confirm']), cwd: root }],
  )
  return summary(run)
}

/** No CLI command flips a plugin off without removing it, so this edits
 *  config/plugins.yml directly — the same merge-only write plugins.mjs itself
 *  does, refusing rather than clobbering a file that fails to parse. */
export function disablePlugin(id: string): void {
  const pluginId = id.replace(/^plugin:/, '')
  const root = careerOpsRoot()
  const file = path.join(root, 'config', 'plugins.yml')
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'plugins: {}\n'
  const doc = parseDocument(raw)
  if (doc.errors.length) throw new Error(`config/plugins.yml is not valid YAML — refusing to overwrite it: ${doc.errors[0].message}`)
  if (!isMap(doc.get('plugins', true))) doc.set('plugins', {})
  const plugins = doc.get('plugins', true) as YAMLMap
  if (plugins.has(pluginId)) plugins.setIn([pluginId, 'enabled'], false)
  else plugins.set(pluginId, { enabled: false })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, String(doc))
}

export function setPluginConfig(id: string, patch: Record<string, string | boolean | null>): void {
  const pluginId = id.replace(/^plugin:/, '')
  const root = careerOpsRoot()
  const found = findManifest(root, pluginId)
  if (!found) throw new Error(`Unknown plugin "${id}"`)
  for (const key of found.manifest.requiredEnv) {
    if (!(key in patch)) continue
    const value = patch[key]
    upsertEnv(envPath(root), key, typeof value === 'string' && value ? value : null)
  }
}
