// IPC handlers for the Settings rebuild (registered in main.ts as `careerloom:<name>`).
import { app, shell } from 'electron'
import os from 'node:os'
import path from 'node:path'

import { checkRoot } from '../careerops'
import { broadcast, readApiKey, readOpencodeKey, readRunHistory, readSettings, runLog, userFile, writeSettings, type Handler } from '../context'
import { acknowledgeList, revokeAck } from '../integrations/browser-login'
import { findRuntime, modelDir } from '../prescreen-model'
import { resolveBin } from '../runner'
import { logTail } from '../scan-history'
import { clearDir, dirStats, pruneOlderThan } from './data'
import { isKeyId, keysList, setKey } from './keys'
import { testKey } from './keys-test'
import { applyPrefsPatch, defaultPrefs, KEY_IDS } from './prefs'
import type { DataLocation, DataStats, Diagnostics, DiagnosticRow, KeyInfo, KeyTest, Prefs, PruneResult } from './types'

const RUN_LOGS = () => userFile('run-logs')
const THREADS = () => userFile('threads')
const COPILOT_SESSIONS = () => userFile(path.join('copilot', 'sessions'))
const changed = () => broadcast('careerloom:settings', null)

/** What the renderer gets as "settings": the file's fields + key presence + folder check. Never a secret. */
export function publicSettings() {
  const s = readSettings()
  return { ...s, hasApiKey: readApiKey() !== null, hasOpencodeKey: readOpencodeKey() !== null, rootCheck: s.root ? checkRoot(s.root) : null }
}

/** Applies prefs.retention now: removes run logs older than the chosen number of days. */
export const pruneRunLogs = (): PruneResult => pruneOlderThan(RUN_LOGS(), '.log', readSettings().prefs.retention.runLogDays)

function diagnosticRows(): DiagnosticRow[] {
  const tool = (id: string, label: string, bin: string, hint: string): DiagnosticRow => {
    const value = resolveBin(bin)
    return { id, label, value, status: value ? 'ok' : 'missing', ...(value ? {} : { hint }) }
  }
  return [
    tool('node', 'Node', 'node', 'Install Node 18 or newer'),
    tool('git', 'git', 'git', 'Install git to let Careerloom set up career-ops'),
    tool('claude', 'Claude Code', 'claude', 'Optional — install to use the Claude Code runner'),
    tool('codex', 'Codex', 'codex', 'Optional — install to use the Codex runner'),
    tool('agy', 'Antigravity', 'agy', 'Optional — install to use the Antigravity runner'),
    tool('opencode', 'OpenCode', 'opencode', 'Optional — install to use the OpenCode runner'),
    tool('docker', 'Docker', 'docker', 'Optional — needed for self-hosted Firecrawl'),
    { id: 'local-model', label: 'Local model', value: findRuntime() ? 'Installed' : null, status: findRuntime() ? 'ok' : 'missing', ...(findRuntime() ? {} : { hint: 'Optional — install it in Local models' }) },
  ]
}

function dataLocations(): DataLocation[] {
  const { root } = readSettings()
  return [
    { id: 'appData', label: 'App data', path: app.getPath('userData') },
    { id: 'careerOps', label: 'career-ops folder', path: root },
    { id: 'models', label: 'Local models', path: path.dirname(modelDir()) },
    { id: 'copilot', label: 'Copilot sessions', path: userFile('copilot') },
  ]
}

export const settingsHandlers: Record<string, Handler> = {
  keysList: (): KeyInfo[] => keysList(),
  keysSet: (id: unknown, value: unknown): KeyInfo => {
    if (!isKeyId(id)) throw new Error('Unknown key')
    if (value !== null && typeof value !== 'string') throw new Error('value must be a string or null')
    const info = setKey(id, value)
    changed()
    return info
  },
  keysTest: async (id: unknown): Promise<KeyTest> => {
    if (!isKeyId(id)) throw new Error('Unknown key')
    const result = await testKey(id)
    changed()
    return result
  },
  prefsGet: (): Prefs => readSettings().prefs,
  prefsSet: (patch: unknown): Prefs => {
    const prefs = writeSettings({ prefs: applyPrefsPatch(readSettings().prefs, patch) }).prefs
    changed()
    return prefs
  },
  browserAcks: (): string[] => acknowledgeList(),
  browserRevoke: (domain: unknown): string[] => {
    if (typeof domain !== 'string' || !domain) throw new Error('domain must be a string')
    const left = revokeAck(domain)
    changed()
    return left
  },
  dataLocations,
  /** Opens a listed data folder in the OS file manager; any other path is refused. */
  revealPath: async (p: unknown): Promise<boolean> => {
    if (typeof p !== 'string' || !dataLocations().some(l => l.path === p)) throw new Error('Not a data location')
    const err = await shell.openPath(p)
    if (err) throw new Error(err)
    return true
  },
  /** Last `lines` (1–200) lines of one run's log, credential-like lines dropped (same filter as saved scan logs). */
  runLogTail: (id: unknown, lines: unknown): string => {
    if (typeof id !== 'string' || !id) throw new Error('id must be a string')
    const n = Math.min(200, Math.max(1, Number.isInteger(lines) ? (lines as number) : 50))
    return logTail(runLog(id)).split('\n').slice(-n).join('\n')
  },
  dataStats: (): DataStats => {
    const logs = dirStats(RUN_LOGS(), '.log')
    return { runs: readRunHistory().length, runLogFiles: logs.files, runLogBytes: logs.bytes, threads: dirStats(THREADS(), '.json').files, copilotSessions: dirStats(COPILOT_SESSIONS(), '.json').files }
  },
  dataClear: (scope: unknown): PruneResult => {
    if (scope === 'run-logs') return clearDir(RUN_LOGS(), '.log')
    if (scope === 'chats') return clearDir(THREADS(), '.json')
    throw new Error('Unknown data scope')
  },
  retentionPrune: (): PruneResult => pruneRunLogs(),
  /** `preferences`: prefs + test results. `everything`: also saved keys and model choices. The folder and runner are kept. */
  settingsReset: (scope: unknown) => {
    if (scope !== 'preferences' && scope !== 'everything') throw new Error('Unknown reset scope')
    if (scope === 'everything') for (const id of KEY_IDS) setKey(id, null)
    writeSettings({ prefs: defaultPrefs(), keyMeta: {}, ...(scope === 'everything' ? { models: {}, helperModels: {} } : {}) })
    changed()
    return publicSettings()
  },
  diagnostics: (): Diagnostics => ({ rows: diagnosticRows(), memory: { totalBytes: os.totalmem(), freeBytes: os.freemem() } }),
}
