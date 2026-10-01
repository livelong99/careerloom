// IPC handlers for the Settings rebuild (registered in main.ts as `careerloom:<name>`).
// Contract-first: `prefs*` are real; the rest are stubs filled in by the following commits.
import { readSettings, writeSettings, type Handler } from '../context'
import { applyPrefsPatch } from './prefs'
import type { ClearScope, DataLocation, DataStats, Diagnostics, KeyId, KeyInfo, KeyTest, Prefs, PruneResult, ResetScope } from './types'

const todo = (name: string) => (): never => { throw new Error(`${name} is not implemented yet`) }

export const settingsHandlers: Record<string, Handler> = {
  keysList: todo('keysList') as () => KeyInfo[],
  keysSet: todo('keysSet') as (id: unknown, value: unknown) => KeyInfo,
  keysTest: todo('keysTest') as (id: unknown) => Promise<KeyTest>,
  prefsGet: (): Prefs => readSettings().prefs,
  prefsSet: (patch: unknown): Prefs => writeSettings({ prefs: applyPrefsPatch(readSettings().prefs, patch) }).prefs,
  browserAcks: todo('browserAcks') as () => string[],
  browserRevoke: todo('browserRevoke') as (domain: unknown) => string[],
  dataLocations: todo('dataLocations') as () => DataLocation[],
  dataStats: todo('dataStats') as () => DataStats,
  dataClear: todo('dataClear') as (scope: unknown) => PruneResult,
  retentionPrune: todo('retentionPrune') as () => PruneResult,
  settingsReset: todo('settingsReset') as (scope: unknown) => unknown,
  diagnostics: todo('diagnostics') as () => Promise<Diagnostics>,
  checkForUpdates: todo('checkForUpdates'),
}
export type { ClearScope, KeyId, ResetScope }
