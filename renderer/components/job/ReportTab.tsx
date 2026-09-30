import { ChevronDown } from 'lucide-react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import type { JobView, ReportBlock, ReportSection } from '../../lib/types'
import { EmptyNote } from '../EmptyState'
import { Markdown } from '../Markdown'

function Blocks({ blocks }: { blocks: ReportBlock[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => b.kind === 'md'
        ? <Markdown key={i} source={b.text} />
        : b.kind === 'heading'
          ? <h4 key={i} className="m-0 mt-2 text-sm font-semibold">{b.text}</h4>
          : (
            <div key={i} className="overflow-x-auto rounded-md border border-border">
              <Table className="tbl">
                <TableHeader><TableRow>{b.headers.map((h, j) => <TableHead key={j}>{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{b.rows.map((row, r) => <TableRow key={r}>{b.headers.map((_, c) => <TableCell key={c} className="whitespace-normal align-top">{row[c] ?? ''}</TableCell>)}</TableRow>)}</TableBody>
              </Table>
            </div>
          ))}
    </div>
  )
}

// Interview prep and posting legitimacy are long and secondary: start collapsed.
const collapsed = (s: ReportSection) => s.kind === 'interview' || s.kind === 'legitimacy' || s.kind === 'risk'

export function ReportTab({ view }: { view: JobView }) {
  const r = view.report
  if (!r || !r.sections.length) return <div className="p-4"><EmptyNote>No evaluation report yet. Evaluate this job to read the full write-up here.</EmptyNote></div>
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Report contents" className="lg:sticky lg:top-0 lg:self-start">
        <p className="m-0 mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Contents</p>
        <ul className="m-0 list-none space-y-1 p-0 text-sm">
          {r.sections.map(s => (
            <li key={s.id}><a href={`#rep-${s.id}`} className="text-muted-foreground hover:text-foreground" onClick={e => { e.preventDefault(); document.getElementById(`rep-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{s.title}</a></li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-3">
        {r.sections.map(s => (
          <Collapsible key={s.id} id={`rep-${s.id}`} defaultOpen={!collapsed(s)} className="rounded-lg border border-border">
            <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left text-sm font-semibold"><span>{s.title}</span><ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" /></CollapsibleTrigger>
            <CollapsibleContent className="border-t border-border p-4"><Blocks blocks={s.blocks} /></CollapsibleContent>
          </Collapsible>
        ))}
        {view.rawReport && (
          <Collapsible>
            <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />View source markdown</CollapsibleTrigger>
            <CollapsibleContent><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs">{view.rawReport}</pre></CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  )
}
