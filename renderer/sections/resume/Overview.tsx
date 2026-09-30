import { useState } from 'react'

import { act } from '@/components/resume/actions'
import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'

import { Page, Soon } from './PageStub'
import type { ResumeCtx } from './ctx'

const base = (file: string) => file.split('/').pop() ?? file

export function OverviewPage({ ctx }: { ctx: ResumeCtx }) {
  const [adding, setAdding] = useState(false)
  const { overview, cv, refresh, adopt } = ctx
  const extract = (file: string) => act(async () => { adopt(await careerloom.extractResume(file)); refresh() }, 'The agent is extracting your résumé')
  const addAndExtract = () => act(async () => {
    setAdding(true)
    try {
      const src = await careerloom.importResume()
      if (src) { refresh(); await extract(base(src.file)) }
    } finally { setAdding(false) }
  })
  return (
    <Page title="Overview" blurb="Where your résumé stands and what to do next.">
      {cv ? <Soon>Scores, top findings and recent changes land here.</Soon> : (
        <div role="region" aria-label="Get started" className="flex flex-col items-start gap-3 rounded-xl bg-muted/40 p-6">
          <h3 className="m-0 text-base font-semibold text-foreground">Start with the résumé you already have</h3>
          <p className="m-0 max-w-md text-sm text-muted-foreground">Add a PDF, Word, RTF, Markdown or text file. The agent reads it and fills in your résumé and profile.</p>
          <Button variant="primary" disabled={adding || !overview} onClick={() => void addAndExtract()}>{adding ? 'Starting…' : 'Add résumé and extract'}</Button>
        </div>
      )}
    </Page>
  )
}
