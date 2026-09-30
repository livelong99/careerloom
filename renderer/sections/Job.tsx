import { useEffect, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { EmptyNote } from '../components/EmptyState'
import { TabSkeleton } from '../components/job/bits'
import { DocumentsTab } from '../components/job/DocumentsTab'
import { JobHeader } from '../components/job/JobHeader'
import { MatchTab } from '../components/job/MatchTab'
import { OverviewTab } from '../components/job/OverviewTab'
import { PostingTab } from '../components/job/PostingTab'
import { ReportTab } from '../components/job/ReportTab'
import { SkillUpTab } from '../components/job/SkillUpTab'
import { useJob } from '../components/job/useJob'
import { useJobAts } from '../components/job/useJobAts'
import { SectionSkeleton } from '../components/Skeleton'
import { navigate } from '../lib/nav'

const TABS = [['overview', 'Overview'], ['job', 'Job'], ['match', 'Match'], ['skillup', 'Skill-up'], ['documents', 'Documents'], ['report', 'Report']] as const

/** One job as a page: header + six tabs. Replaces the old side drawer. */
export function Job({ id }: { id: string }) {
  const { job, view, jobs, prescreen } = useJob(id)
  const ats = useJobAts(id)
  const [tab, setTab] = useState('overview')
  useEffect(() => setTab('overview'), [id])

  if (jobs.error && !job) return <EmptyNote>{jobs.error.message}</EmptyNote>
  if (!job) return jobs.data ? <EmptyNote>This job is no longer in your list.</EmptyNote> : <SectionSkeleton label="Loading job" rows={5} />
  const v = view.data

  return (
    <div className="workspace workspace-fill gap-4">
      <JobHeader job={job} view={v} onBack={() => navigate('jobs')} onChanged={jobs.refresh} onScreened={() => { prescreen.refresh(); jobs.refresh() }} />
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-3">
        <TabsList aria-label="Job pages" className="h-9 w-fit">
          {TABS.map(([t, label]) => <TabsTrigger key={t} value={t}>{label}</TabsTrigger>)}
        </TabsList>
        <ScrollArea className="min-h-0 min-w-0 flex-1 rounded-xl border border-border">
          {!v
            ? (view.error ? <div className="p-4"><EmptyNote>{view.error.message}</EmptyNote></div> : <TabSkeleton />)
            : <>
              <TabsContent value="overview"><OverviewTab job={job} view={v} goTab={setTab} /></TabsContent>
              <TabsContent value="job"><PostingTab view={v} pending={v.pending} /></TabsContent>
              <TabsContent value="match"><MatchTab view={v} ats={ats} /></TabsContent>
              <TabsContent value="skillup"><SkillUpTab ats={ats} /></TabsContent>
              <TabsContent value="documents"><DocumentsTab jobId={id} view={v} /></TabsContent>
              <TabsContent value="report"><ReportTab view={v} /></TabsContent>
            </>}
        </ScrollArea>
      </Tabs>
    </div>
  )
}
