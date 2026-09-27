import { useState } from 'react'

import { asOfLabel } from '../../lib/format'
import type { AtsResult, CvDocument, ExtractedProfile, ProfileResearch } from '../../lib/types'
import { Icon } from '../icons'
import { Markdown } from '../Markdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { EditTab } from './EditTab'
import { InsightsTab } from './InsightsTab'

function ResearchTab({ research }: { research: ProfileResearch | null }) {
  const sources = research?.sources ?? []
  const firecrawlOff = sources.some(x => /Firecrawl is not running/.test(x.error ?? ''))
  return (
    <div className="flex flex-col gap-4 text-sm">
      {research?.summary ? (
        <>
          <p className="m-0 text-xs text-muted-foreground">Written by the agent {asOfLabel(research.updatedAt)}</p>
          <div className="text-sm"><Markdown source={research.summary} /></div>
        </>
      ) : (
        <p className="m-0 text-muted-foreground">No research yet. Choose Run research in the left column: the agent reads your public profiles and lists proof points your résumé is missing.</p>
      )}
      {firecrawlOff && <p className="m-0 rounded-md border border-border p-2 text-xs text-muted-foreground">Firecrawl wasn't running, so the agent fetched pages itself. Start Firecrawl in Integrations for better results.</p>}
      {sources.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="m-0 text-[13px] font-semibold text-foreground">Sources</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {sources.map(x => (
              <li key={x.url} className="flex gap-2">
                <Icon name={x.ok ? 'circle-check' : 'triangle-alert'} className={`mt-0.5 size-3.5 shrink-0 ${x.ok ? 'text-success' : 'text-warning'}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-foreground" title={x.url}>{x.url}</span>
                  <span className="block text-xs text-muted-foreground">{x.ok ? 'Fetched' : x.error ?? 'Not fetched'}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function Inspector({ ats, cv, profile, research, onChanged, onReExtract }: {
  ats: AtsResult | null
  cv: CvDocument | null
  profile: ExtractedProfile | null
  research: ProfileResearch | null
  onChanged: () => void
  onReExtract: (() => void) | null
}) {
  const [dirty, setDirty] = useState(false)
  return (
    <aside aria-label="Résumé details" className="min-w-0 rounded-xl border border-border bg-card p-4">
      <Tabs defaultValue="insights">
        <TabsList className="w-full">
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="edit">Edit{dirty ? ' (unsaved)' : ''}</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
        </TabsList>
        <TabsContent value="insights" className="pt-3"><InsightsTab ats={ats} hasCv={!!cv} onScored={onChanged} /></TabsContent>
        <TabsContent value="edit" className="pt-3"><EditTab cv={cv} profile={profile} onSaved={onChanged} onReExtract={onReExtract} onDirty={setDirty} /></TabsContent>
        <TabsContent value="research" className="pt-3"><ResearchTab research={research} /></TabsContent>
      </Tabs>
    </aside>
  )
}
