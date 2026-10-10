import { useState } from 'react'

import { t } from '../i18n'
import { useUpdateStatus } from '../hooks/useUpdateStatus'
import { goToSettings } from '../lib/nav'

const DISMISS_KEY = 'careerloom.updateDismissed'

function readDismissed(): string | null {
  try { return globalThis.localStorage?.getItem(DISMISS_KEY) ?? null } catch { return null }
}

/**
 * Subtle, dismissible "update available" nudge, in the budget-banner visual
 * language. Dismiss persists per release tag (careerloom.updateDismissed), so the
 * same version never nags twice but the next release shows fresh. "Update now" opens
 * Settings › Updates, where the install happens after an explicit click.
 */
export function UpdateBanner() {
  const status = useUpdateStatus()
  const [dismissedTag, setDismissedTag] = useState<string | null>(readDismissed)

  if (!status || !status.updateAvailable || !status.tag) return null
  if (dismissedTag === status.tag) return null

  const tag = status.tag
  const dismiss = () => {
    try { globalThis.localStorage?.setItem(DISMISS_KEY, tag) } catch { /* storage can be unavailable */ }
    setDismissedTag(tag)
  }

  return (
    <div role="status" className="update-banner">
      <span>
        {t('shell.update.available', { version: status.latestVersion ?? '' })}{' '}
        <button type="button" className="set-text-button" onClick={() => goToSettings('updates')}>{t('shell.action.updateNow')}</button>
      </span>
      <button type="button" className="set-text-button" onClick={dismiss}>{t('shell.action.dismiss')}</button>
    </div>
  )
}
