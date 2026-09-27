import type { CareerloomBridge, CliError } from './types'

// The preload script (electron/preload.ts) exposes `window.careerloom`.
declare global {
  interface Window {
    careerloom: CareerloomBridge
  }
}

/** The typed bridge. Import this instead of touching `window` directly. */
export const careerloom: CareerloomBridge = window.careerloom

/** Coerce anything thrown across the IPC boundary into a CliError shape. */
export function normalizeCliError(err: unknown): CliError {
  if (err && typeof err === 'object' && 'kind' in err && typeof (err as CliError).kind === 'string') {
    const e = err as CliError
    return { kind: e.kind, message: e.message ?? 'Careerloom error' }
  }
  return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
}
