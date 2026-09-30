import { EditTab } from '@/components/resume/EditTab'

import { Page } from './PageStub'
import type { ResumeCtx } from './ctx'

// M4 replaces this with the resizable section list | editor | live preview.
export function ContentPage({ ctx }: { ctx: ResumeCtx }) {
  return (
    <Page title="Content" blurb="Edit your résumé text section by section.">
      <EditTab cv={ctx.cv} profile={ctx.profile} onSaved={ctx.refresh} onReExtract={null} onDirty={() => undefined} />
    </Page>
  )
}
