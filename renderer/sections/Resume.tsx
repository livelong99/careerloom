import { useState } from 'react'

import { EmptyNote } from '../components/EmptyState'
import { act } from '../components/resume/actions'
import { DocumentStage } from '../components/resume/DocumentStage'
import { Inspector } from '../components/resume/Inspector'
import { SourceRail } from '../components/resume/SourceRail'
import { SectionSkeleton } from '../components/Skeleton'
import { Button } from '../components/ui/button'
import { useRuns } from '../hooks/useRuns'
import { usePolled } from '../hooks/usePolled'
import { careerloom } from '../lib/ipc'

const base = (file: string) => file.split('/').pop() ?? file

/** Resume workspace: sources and agent work on the left, the résumé itself centre stage, details on the right. */
export function Resume() {
  const { generation, adopt } = useRuns()
  const overview = usePolled(() => careerloom.resumeOverview(), [generation], { intervalMs: null })
  const cv = usePolled(() => careerloom.readCv(), [generation], { intervalMs: null })
  const profile = usePolled(() => careerloom.readProfile(), [generation], { intervalMs: null })
  const research = usePolled(() => careerloom.readResearch(), [generation], { intervalMs: null })
  const [adding, setAdding] = useState(false)

  const refresh = () => { overview.refresh(); cv.refresh(); profile.refresh(); research.refresh() }
  const extract = (file: string) => act(async () => { adopt(await careerloom.extractResume(file)); refresh() }, 'The agent is extracting your résumé')
  const addAndExtract = () => act(async () => {
    setAdding(true)
    try {
      const src = await careerloom.importResume()
      if (src) { refresh(); await extract(base(src.file)) }
    } finally { setAdding(false) }
  })

  if (overview.error) return <EmptyNote>{overview.error.message.split('\n')[0]}</EmptyNote>
  if (!overview.data) return <SectionSkeleton label="Loading your résumé" />
  const data = overview.data
  const doc = cv.data
  const latest = data.sources.filter(s => /^documents\/cv\/[^/]+$/.test(s.file)).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const reExtractFile = profile.data?.extractedFrom ? base(profile.data.extractedFrom) : latest ? base(latest.file) : null
  const stamp = `${doc?.updatedAt ?? 0}:${profile.data?.extractedAt ?? 0}:${generation}`

  return (
    <div className="workspace grid items-start gap-6 min-[1100px]:grid-cols-[240px_minmax(0,1fr)_340px]">
      <SourceRail
        sources={data.sources}
        profile={profile.data}
        research={research.data}
        hasCv={!!doc}
        onChanged={refresh}
        onExtract={file => void extract(file)}
      />
      <div className="order-first min-w-0 min-[1100px]:order-none">
      {doc ? (
        <DocumentStage templates={data.templates} active={data.activeTemplate ?? 'standard'} stamp={stamp} onChanged={refresh} />
      ) : (
        <div role="region" aria-label="Get started" className="flex flex-col items-center justify-center gap-3 rounded-xl bg-muted/40 px-6 py-24 text-center">
          <h2 className="m-0 text-lg font-semibold text-foreground">Start with the résumé you already have</h2>
          <p className="m-0 max-w-md text-sm text-muted-foreground">
            Add a PDF, Word, RTF, Markdown or text file. The agent reads it and fills in your résumé, profile and links, then you can pick a template and download a PDF.
          </p>
          <Button variant="primary" disabled={adding} onClick={() => void addAndExtract()}>{adding ? 'Starting…' : 'Add résumé and extract'}</Button>
        </div>
      )}
      </div>
      <Inspector
        ats={data.lastAts}
        cv={doc}
        profile={profile.data}
        research={research.data}
        onChanged={refresh}
        onReExtract={reExtractFile ? () => void extract(reExtractFile) : null}
      />
    </div>
  )
}
