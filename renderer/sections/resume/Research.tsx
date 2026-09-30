import { useState } from 'react'

import { act } from '@/components/resume/actions'
import { Icon } from '@/components/icons'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { careerloom } from '@/lib/ipc'
import { asOfLabel } from '@/lib/format'

import { Page } from './PageStub'
import type { ResumeCtx } from './ctx'

export function ResearchPage({ ctx }: { ctx: ResumeCtx }) {
  const [busy, setBusy] = useState(false)
  const r = ctx.research
  const sources = r?.sources ?? []
  const firecrawlOff = sources.some(x => /Firecrawl is not running/.test(x.error ?? ''))
  const run = () => act(async () => {
    setBusy(true)
    try { ctx.adopt(await careerloom.researchProfile()); ctx.refresh() } finally { setBusy(false) }
  }, 'Research started')

  return (
    <Page title="Research" blurb="Proof points from your public profiles that your résumé could use.">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={r?.summary ? 'outline' : 'primary'} className={r?.summary ? 'border-border' : undefined} disabled={busy || !ctx.profile} onClick={() => void run()}>{busy ? 'Starting…' : r?.summary ? 'Run research again' : 'Run research'}</Button>
        {!ctx.profile && <span className="text-xs text-muted-foreground">Extract your résumé first: research starts from its links.</span>}
        {r?.summary && <span className="text-xs text-muted-foreground">Written by the agent {asOfLabel(r.updatedAt)}</span>}
      </div>
      {r?.summary ? <Markdown source={r.summary} /> : (
        <Empty className="border border-border"><EmptyHeader><EmptyTitle>No research yet</EmptyTitle><EmptyDescription>The agent reads your public profiles and lists proof points your résumé is missing.</EmptyDescription></EmptyHeader></Empty>
      )}
      {firecrawlOff && <p className="m-0 rounded-md border border-border p-2 text-xs text-muted-foreground">Firecrawl was not running, so the agent fetched pages itself. Start Firecrawl in Integrations for better results.</p>}
      {sources.length > 0 && (
        <section aria-label="Sources" className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="m-0 text-[13px] font-semibold text-foreground">Sources</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {sources.map(x => (
              <li key={x.url} className="flex gap-2">
                <Icon name={x.ok ? 'circle-check' : 'triangle-alert'} className={`mt-0.5 size-3.5 shrink-0 ${x.ok ? 'text-success' : 'text-warning'}`} aria-hidden="true" />
                <span className="min-w-0"><span className="block truncate text-sm text-foreground" title={x.url}>{x.url}</span><span className="block text-xs text-muted-foreground">{x.ok ? 'Fetched' : x.error ?? 'Not fetched'}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  )
}
