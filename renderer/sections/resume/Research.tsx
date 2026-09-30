import { Markdown } from '@/components/Markdown'
import { asOfLabel } from '@/lib/format'

import { Page, Soon } from './PageStub'
import type { ResumeCtx } from './ctx'

// M4 brings the Run-research action and the sources list over from the old inspector.
export function ResearchPage({ ctx }: { ctx: ResumeCtx }) {
  const r = ctx.research
  return (
    <Page title="Research" blurb="Proof points from your public profiles that your résumé could use.">
      {r?.summary ? (
        <>
          <p className="m-0 text-xs text-muted-foreground">Written by the agent {asOfLabel(r.updatedAt)}</p>
          <Markdown source={r.summary} />
        </>
      ) : <Soon>No research yet.</Soon>}
    </Page>
  )
}
