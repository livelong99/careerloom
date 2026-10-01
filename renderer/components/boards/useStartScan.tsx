import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useRuns } from '../../hooks/useRuns'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { goToIntegrations } from '../../lib/nav'
import { showToast } from '../../lib/toast'
import { ConsentDialog } from '../jobs/PortalDialogs'
import { openRuns } from '../../lib/nav'

/** Starting a scan from Boards: browser-board consent first, Firecrawl-down shown inline with a fix. */
export function useStartScan() {
  const { adopt } = useRuns()
  const [consent, setConsent] = useState<{ domains: string[]; ids: string[] } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const launch = async (ids: string[]) => {
    const run = await careerloom.scanPortals(ids)
    adopt(run)
    showToast(`Started: ${run.label}`)
    openRuns(run.id)
  }

  /** `ids` empty = every enabled board (browser boards excluded). */
  const start = async (ids: string[]): Promise<boolean> => {
    setBusy(true)
    setProblem(null)
    try {
      const domains = ids.length ? await careerloom.browserConsentNeeded(ids) : []
      if (domains.length) { setConsent({ domains, ids }); return false }
      await launch(ids)
      return true
    } catch (err) {
      const { message } = normalizeCliError(err)
      if (message.includes('Firecrawl')) setProblem(message)
      else showToast(message, 'error', 6000)
      return false
    } finally {
      setBusy(false)
    }
  }

  const ui = (
    <>
      {problem && (
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-destructive" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{problem}</span>
          <Button size="sm" variant="secondary" className="h-8" onClick={goToIntegrations}>Open Integrations → Firecrawl</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setProblem(null)} aria-label="Dismiss">Dismiss</Button>
        </div>
      )}
      {consent && (
        <ConsentDialog
          domains={consent.domains} onCancel={() => setConsent(null)}
          onAccept={async () => {
            await careerloom.acknowledgeBrowser(consent.domains)
            const ids = consent.ids
            setConsent(null)
            try { await launch(ids) } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
          }}
        />
      )}
    </>
  )
  return { start, busy, ui }
}
