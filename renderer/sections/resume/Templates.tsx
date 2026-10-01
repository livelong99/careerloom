import { DocumentStage } from '@/components/resume/DocumentStage'

import { Page, Soon } from './PageStub'
import type { ResumeCtx } from './ctx'

export function TemplatesPage({ ctx }: { ctx: ResumeCtx }) {
  const { overview, cv, profile, refresh } = ctx
  if (!cv) return <Page title="Templates" blurb="Pick how your résumé looks."><Soon>Add a résumé first, then choose a template here.</Soon></Page>
  const stamp = `${cv.updatedAt}:${profile?.extractedAt ?? 0}`
  return (
    <Page title="Templates" blurb="Pick how your résumé looks, then download the PDF.">
      <DocumentStage templates={overview.templates} active={overview.activeTemplate ?? 'standard'} stamp={stamp} onChanged={refresh} />
    </Page>
  )
}
