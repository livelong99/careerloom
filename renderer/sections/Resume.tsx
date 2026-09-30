import { useCallback, useState } from 'react'

import { EmptyNote } from '../components/EmptyState'
import { SectionSkeleton } from '../components/Skeleton'
import { Badge } from '../components/ui/badge'
import { ScrollArea } from '../components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { useRuns } from '../hooks/useRuns'
import { usePolled } from '../hooks/usePolled'
import { when } from '../components/resume/format'
import { careerloom } from '../lib/ipc'
import { AtsPage } from './resume/Ats'
import { ContentPage } from './resume/Content'
import type { PageId, ResumeCtx } from './resume/ctx'
import { useAtsLive } from './resume/useAts'
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
const chip = (label: string, block: { score: number; low: number; high: number; confidence: string } | undefined, hint: string) => (
  <Badge variant="neutral" title={block ? `${hint}. Range ${block.low}–${block.high}, ${block.confidence} confidence` : 'Run an ATS analysis to see this'}>
    {label} {block ? block.score : '—'}{block && block.low !== block.high ? <span className="text-xs opacity-70">({block.low}–{block.high})</span> : null}
  </Badge>
)

/** Resume workspace: persistent header, side navigation, one full-width page at a time. */
export function Resume() {
  const { generation, adopt } = useRuns()
  const overview = usePolled(() => careerloom.resumeOverview(), [generation], { intervalMs: null })
  const cv = usePolled(() => careerloom.readCv(), [generation], { intervalMs: null })
  const profile = usePolled(() => careerloom.readProfile(), [generation], { intervalMs: null })
  const research = usePolled(() => careerloom.readResearch(), [generation], { intervalMs: null })
  const report = usePolled(() => careerloom.atsGet(), [generation], { intervalMs: null })
  const history = usePolled(() => careerloom.atsHistory(), [generation], { intervalMs: null })
  const [page, setPage] = useState<PageId>('overview')
  const { refresh: refreshOverview } = overview
  const settled = useCallback(() => { report.refresh(); history.refresh(); refreshOverview() }, [report.refresh, history.refresh, refreshOverview]) // eslint-disable-line react-hooks/exhaustive-deps
  const ats = useAtsLive(settled)

  if (overview.error) return <EmptyNote>{overview.error.message.split('\n')[0]}</EmptyNote>
  if (!overview.data) return <SectionSkeleton label="Loading your résumé" />

  const ctx: ResumeCtx = {
    overview: overview.data,
    cv: cv.data,
    profile: profile.data,
    research: research.data,
    report: report.data,
    history: history.data ?? [],
    live: ats.live,
    go: setPage,
    refresh: () => { overview.refresh(); cv.refresh(); profile.refresh(); research.refresh(); report.refresh(); history.refresh() },
    adopt,
    analyze: ats.analyze,
    answer: ats.answer,
  }
  const template = overview.data.templates.find(t => t.name === overview.data?.activeTemplate)?.displayName ?? 'Standard'
  const r = report.data

  return (
    <div className="workspace workspace-fill gap-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="m-0 truncate text-base font-semibold text-foreground">{profile.data?.name || 'Your résumé'}</h1>
          <p className="m-0 text-xs text-muted-foreground">Template {template} · {r ? `analysed ${when(r.createdAt)}` : 'not analysed yet'}</p>
        </div>
        <div className="ml-auto flex gap-2">
          {chip('Parse health', r?.parse, 'A parse-risk heuristic')}
          {chip('Job match', r?.match, 'Estimated from the job description')}
        </div>
      </header>
      <Tabs orientation="vertical" value={page} onValueChange={v => setPage(v as PageId)} className="min-h-0 flex-1 flex-row gap-4">
        <TabsList aria-label="Résumé pages" className="h-fit w-44 shrink-0 flex-col items-stretch gap-1 bg-transparent p-0">
          {PAGES.map(([id, label]) => <TabsTrigger key={id} value={id} className="h-8 flex-none justify-start data-[state=active]:bg-muted">{label}</TabsTrigger>)}
        </TabsList>
        <ScrollArea key={page} className="min-h-0 min-w-0 flex-1 rounded-xl border border-border">
          <TabsContent value="overview"><OverviewPage ctx={ctx} /></TabsContent>
          <TabsContent value="content"><ContentPage ctx={ctx} /></TabsContent>
          <TabsContent value="templates"><TemplatesPage ctx={ctx} /></TabsContent>
          <TabsContent value="ats"><AtsPage ctx={ctx} /></TabsContent>
          <TabsContent value="skillup"><SkillUpPage ctx={ctx} /></TabsContent>
          <TabsContent value="research"><ResearchPage ctx={ctx} /></TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
