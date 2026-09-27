import { normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'

/** Run a bridge call, toasting success/failure — same pattern as Settings.tsx. */
export async function act(fn: () => Promise<unknown>, ok?: string): Promise<void> {
  try {
    await fn()
    if (ok) showToast(ok)
  } catch (err) {
    showToast(normalizeCliError(err).message, 'error', 6000)
  }
}
