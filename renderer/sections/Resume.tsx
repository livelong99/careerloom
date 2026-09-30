import { useState } from 'react'

import { EmptyNote } from '../components/EmptyState'
import { SectionSkeleton } from '../components/Skeleton'
import { Badge } from '../components/ui/badge'
import { ScrollArea } from '../components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { useRuns } from '../hooks/useRuns'
import { usePolled } from '../hooks/usePolled'
import { asOfLabel } from '../lib/format'
import { careerloom } from '../lib/ipc'
import { AtsPage } from './resume/Ats'
import { ContentPage } from './resume/Content'
import type { ResumeCtx } from './resume/ctx'
import { OverviewPage } from './resume/Overview'
import { ResearchPage } from './resume/Research'
import { SkillUpPage } from './resume/SkillUp'
import { TemplatesPage } from './resume/Templates'

const PAGES = [
  ['overview', 'Overview'],
  ['content', 'Content'],
  ['templates', 'Templates'],
  ['ats', 'ATS analysis'],
  ['skillup', 'Skill-up'],
  ['research', 'Research'],
] as const
type PageId = (typeof PAGES)[number][0]

const chip = (label: string, score: number | undefined) => (
  <Badge variant="neutral" title={score === undefined ? 'Run an ATS analysis to see this' : undefined}>{label} {score ?? '—'}</Badge>
)

/** Resume workspace: persistent header, side navigation, one full-width page at a time. */
export function Resume() {
  const { generation, adopt } = useRuns()
  const overview = usePolled(() => careerloom.resumeOverview(), [generation], { intervalMs: null })
  const cv = usePolled(() => careerloom.readCv(), [generation], { intervalMs: null })
  const profile = usePolled(() => careerloom.readProfile(), [generation], { intervalMs: null })
  const research = usePolled(() => careerloom.readResearch(), [generation], { intervalMs: null })
  const report = usePolled(() => careerloom.atsGet(), [generation], { intervalMs: null })
  const [page, setPage] = useState<PageId>('overview')

  if (overview.error) return <EmptyNote>{overview.error.message.split('\n')[0]}</EmptyNote>
  if (!overview.data) return <SectionSkeleton label="Loading your résumé" />

  const ctx: ResumeCtx = {
    overview: overview.data,
    cv: cv.data,
    profile: profile.data,
    research: research.data,
    report: report.data,
    refresh: () => { overview.refresh(); cv.refresh(); profile.refresh(); research.refresh(); report.refresh() },
    adopt,
  }
  const template = overview.data.templates.find(t => t.name === overview.data?.activeTemplate)?.displayName ?? 'Standard'
  const r = report.data

  return (
    <div className="workspace workspace-fill gap-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="m-0 truncate text-base font-semibold text-foreground">{profile.data?.name || 'Your résumé'}</h1>
          <p className="m-0 text-xs text-muted-foreground">Template {template} · {r ? `analysed ${asOfLabel(r.createdAt)}` : 'not analysed yet'}</p>
        </div>
        <div className="ml-auto flex gap-2">
          {chip('Parse health', r?.parse.score)}
          {chip('Job match', r?.match?.score)}
        </div>
      </header>
      <Tabs orientation="vertical" value={page} onValueChange={v => setPage(v as PageId)} className="min-h-0 flex-1 flex-row gap-4">
        <TabsList aria-label="Résumé pages" className="h-fit w-44 shrink-0 flex-col items-stretch gap-1 bg-transparent p-0">
          {PAGES.map(([id, label]) => <TabsTrigger key={id} value={id} className="h-8 flex-none justify-start data-[state=active]:bg-muted">{label}</TabsTrigger>)}
        </TabsList>
        <ScrollArea className="min-h-0 min-w-0 flex-1 rounded-xl border border-border">
          <TabsContent value="overview"><OverviewPage ctx={ctx} /></TabsContent>
          <TabsContent value="content"><ContentPage ctx={ctx} /></TabsContent>
          <TabsContent value="templates"><TemplatesPage ctx={ctx} /></TabsContent>
          <TabsContent value="ats"><AtsPage /></TabsContent>
          <TabsContent value="skillup"><SkillUpPage /></TabsContent>
          <TabsContent value="research"><ResearchPage ctx={ctx} /></TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
