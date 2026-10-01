import { ChevronDown } from 'lucide-react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import type { JobView } from '../../lib/types'
import { EmptyNote } from '../EmptyState'
import { Block, Bullets, Chips, Facts, ModelFooter } from './bits'

const salaryText = (s: NonNullable<JobView['posting']>['salary']) => {
  if (!s) return null
  const range = s.min !== null && s.max !== null ? `${s.min.toLocaleString()} – ${s.max.toLocaleString()}${s.currency ? ` ${s.currency}` : ''}${s.period ? ` / ${s.period}` : ''}` : null
  return range ?? s.text
}

/** The posting as fields, never as a wall of scraped text; the source sits behind a disclosure. */
export function PostingTab({ view, pending }: { view: JobView; pending: boolean }) {
  const p = view.posting
  if (!p) return <div className="p-4"><EmptyNote>{pending ? 'Fetching and tidying the posting…' : 'The posting could not be fetched. Open it in your browser, or evaluate the job to archive it here.'}</EmptyNote></div>
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      {pending && <p className="m-0 text-xs text-muted-foreground lg:col-span-2" role="status">Filling in the remaining fields…</p>}
      {p.summary && (
        <Block title="The role" className="lg:col-span-2">
          <p className="m-0 text-sm">{p.summary}</p>
          {p.fullDescription && p.fullDescription !== p.summary && (
            <Collapsible>
              <CollapsibleTrigger className="group mt-2 flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />Full description</CollapsibleTrigger>
              <CollapsibleContent><p className="m-0 mt-2 text-sm text-muted-foreground">{p.fullDescription}</p></CollapsibleContent>
            </Collapsible>
          )}
        </Block>
      )}
      <Block title="At a glance"><Facts rows={[['Location', p.location], ['Work mode', p.workMode], ['Type', p.employmentType], ['Level', p.seniority], ['Pay', salaryText(p.salary)], ['Apply by', p.deadline]]} /></Block>
      <Block title="Tech stack">{p.techStack.length ? <Chips items={p.techStack} variant="brand" /> : <p className="m-0 text-sm text-muted-foreground">Not stated.</p>}</Block>
      {p.skills.length > 0 && <Block title="Skills & themes" className="lg:col-span-2"><Chips items={p.skills} /></Block>}
      <Block title="What you will do"><Bullets items={p.responsibilities} /></Block>
      <Block title="Required"><Bullets items={p.requirements.required} /></Block>
      <Block title="Nice to have"><Bullets items={p.requirements.preferred} /></Block>
      <Block title="Benefits"><Bullets items={p.benefits} /></Block>
      {p.aboutCompany && <Block title={`About ${p.company ?? 'the company'}`} className="lg:col-span-2"><p className="m-0 text-sm">{p.aboutCompany}</p></Block>}
      <div className="space-y-2 lg:col-span-2">
        <ModelFooter meta={view.meta} />
        {view.rawJd && (
          <Collapsible>
            <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />View source text</CollapsibleTrigger>
            <CollapsibleContent><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs">{view.rawJd}</pre></CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  )
}
