import type { Handler } from './context'

// Pipeline actions: status changes via career-ops set-status.mjs.
// Contract: renderer/lib/types.ts (CareerloomBridge › Pipeline). Owned by the Pipeline builder.

// Kept in sync with renderer/lib/types.ts's CanonicalStatus union — a mismatch
// here would silently reject (or silently accept) a status the bridge type allows.
const CANONICAL_STATUSES = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Hired', 'Rejected', 'Discarded', 'SKIP'] as const
export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number]

export const MAX_NUMS = 200

export type SetStatusValidation =
  | { ok: true; nums: number[]; status: CanonicalStatus }
  | { ok: false; error: string }

/** Pure input validation, kept separate from the IPC handler (and from any
 *  electron import) so it's directly testable. */
export function validateSetStatusInput(nums: unknown, status: unknown): SetStatusValidation {
  if (!Array.isArray(nums) || nums.length === 0) return { ok: false, error: 'nums must be a non-empty array' }
  if (nums.length > MAX_NUMS) return { ok: false, error: `nums must have at most ${MAX_NUMS} entries` }
  if (!nums.every(n => typeof n === 'number' && Number.isInteger(n) && n > 0)) {
    return { ok: false, error: 'nums must be positive integers' }
  }
  if (typeof status !== 'string' || !(CANONICAL_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: `status must be one of ${CANONICAL_STATUSES.join(', ')}` }
  }
  return { ok: true, nums: nums as number[], status: status as CanonicalStatus }
}

/** Extract the `error` field set-status.mjs writes to stdout with --json on failure. */
function scriptError(stdout: string, fallback: string): string {
  try {
    const parsed = JSON.parse(stdout.trim()) as { error?: string }
    return parsed.error ?? fallback
  } catch {
    return fallback
  }
}

export const trackerHandlers: Record<string, Handler> = {
  setStatus: async (nums: unknown, status: unknown) => {
    const validated = validateSetStatusInput(nums, status)
    if (!validated.ok) throw new Error(validated.error)
    // Dynamic import: keeps electron out of this module's static graph, so
    // validateSetStatusInput stays testable without mocking 'electron'.
    const { runScript } = await import('./context.js')
    const updated: number[] = []
    const failed: Array<{ num: number; error: string }> = []
    // Sequential: set-status.mjs takes the tracker's exclusive lock, so
    // concurrent calls would only serialize behind it anyway (and risk racing
    // each other into the lock-timeout exit code).
    for (const num of validated.nums) {
      try {
        const result = await runScript(['set-status.mjs', '--row', String(num), validated.status, '--json'])
        if (result.code === 0) updated.push(num)
        else failed.push({ num, error: scriptError(result.stdout, result.stderr.trim() || `exit code ${result.code}`) })
      } catch (err) {
        failed.push({ num, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return { updated, failed }
  },
}
