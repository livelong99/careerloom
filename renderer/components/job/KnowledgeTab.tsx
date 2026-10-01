import { Block } from './bits'

/** Stub until the KB UI package (WP3) lands: the researched question base for this job. */
export function KnowledgeTab({ jobId }: { jobId: string }) {
  return (
    <div className="flex flex-col gap-4 p-4" data-job-id={jobId}>
      <Block title="Knowledge base">
        <p className="m-0 text-sm text-muted-foreground">Researched interview questions, skills and sources for this job will appear here.</p>
      </Block>
    </div>
  )
}
