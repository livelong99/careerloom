import { useState, type ReactNode } from 'react'

import { useRuns } from '../../hooks/useRuns'
import { asOfLabel } from '../../lib/format'
import { careerloom } from '../../lib/ipc'
import type { ExtractedProfile, ProfileResearch, ResumeSource, Run } from '../../lib/types'
import { Icon } from '../icons'
import { Button } from '../ui/button'
import { act } from './actions'

type Status = 'done' | 'running' | 'todo' | 'warn'
const DOT: Record<Status, string> = {
  done: 'bg-success border-success',
  running: 'bg-primary border-primary animate-pulse',
  todo: 'bg-background border-muted-foreground',
  warn: 'bg-warning border-warning',
}

/** One stage of the source → extraction → research flow, drawn on a shared vertical line. */
function Step({ title, status, children }: { title: string; status: Status; children: ReactNode }) {
  return (
    <div className="relative m-0 pb-6 pl-6 before:absolute before:top-0 before:bottom-0 before:left-[4.5px] before:w-px before:bg-border first:before:top-[10px] last:before:bottom-auto last:before:h-[10px]">
      <span aria-hidden="true" className={`absolute top-[5px] left-0 z-[1] size-[10px] rounded-full border-2 ${DOT[status]}`} />
      <h2 className="m-0 mb-2 text-[13px] leading-5 font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">{children}</div>
    </div>
  )
}

const cvFile = (s: ResumeSource) => /^documents\/cv\/[^/]+$/.test(s.file)
const fileName = (f: string) => f.split('/').pop() ?? f
const running = (runs: Run[], mode: string) => runs.find(r => r.mode === mode && r.status === 'running')

export function SourceRail({ sources, profile, research, hasCv, onChanged, onExtract }: {
  sources: ResumeSource[]
  profile: ExtractedProfile | null
  research: ProfileResearch | null
  hasCv: boolean
  onChanged: () => void
  onExtract: (file: string) => void
}) {
  const { runs, adopt, start } = useRuns()
  const [busy, setBusy] = useState<string | null>(null)
  const extracting = running(runs, 'intake')
  const researching = running(runs, 'research')
  const extractedFrom = profile?.extractedFrom ? fileName(profile.extractedFrom) : null
  const latest = [...sources].filter(cvFile).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const fetched = research?.sources ?? []
  const firecrawlOff = fetched.some(x => /Firecrawl is not running/.test(x.error ?? ''))

  const addFile = () => act(async () => { setBusy('add'); try { if (await careerloom.importResume()) onChanged() } finally { setBusy(null) } })
  const runResearch = () => act(async () => {
    setBusy('research')
    try { adopt(await careerloom.researchProfile()); onChanged() } finally { setBusy(null) }
  }, 'Research started')

  return (
    <aside aria-label="Résumé sources and agent work" className="m-0 flex flex-col self-start">
      <div>
      <Step title="Sources" status={sources.length ? 'done' : 'todo'}>
        {sources.length === 0 && <p className="m-0">Add the résumé you already have — PDF, Word, RTF, Markdown or text.</p>}
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {sources.map(s => (
            <li key={s.file} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
              <Icon name="folder" className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-foreground" title={s.file}>{fileName(s.file)}</span>
              {extractedFrom === fileName(s.file) && <Icon name="circle-check" className="size-3.5 text-success" aria-label="Extracted" />}
              {cvFile(s) && (
                <Button size="sm" variant="subtle" className="h-7 px-2 text-xs" disabled={!!extracting} onClick={() => onExtract(fileName(s.file))}>
                  Extract
                </Button>
              )}
            </li>
          ))}
        </ul>
        <Button size="sm" variant="outline" className="self-start border-border" disabled={busy === 'add'} onClick={() => void addFile()}>
          {busy === 'add' ? 'Adding…' : 'Add file'}
        </Button>
      </Step>

      <Step title="Extraction" status={extracting ? 'running' : profile ? 'done' : hasCv ? 'warn' : 'todo'}>
        {extracting ? (
          <p className="m-0 text-foreground">The agent is reading {extracting.input ? fileName(extracting.input) : 'your file'}…</p>
        ) : profile ? (
          <p className="m-0">Extracted from {extractedFrom ?? 'your résumé'}{profile.extractedAt ? `, ${asOfLabel(profile.extractedAt)}` : ''}.</p>
        ) : hasCv ? (
          <p className="m-0">cv.md exists but hasn't been extracted into a profile yet. Extract a source file to fill contact details and links.</p>
        ) : (
          <p className="m-0">Nothing extracted yet. Pick a source and choose Extract.</p>
        )}
        {latest && !extracting && (
          <Button size="sm" variant="primary" className="self-start" onClick={() => onExtract(fileName(latest.file))}>
            {profile ? 'Re-extract' : 'Extract with agent'}
          </Button>
        )}
      </Step>

      <Step title="Research" status={researching ? 'running' : research?.summary ? 'done' : fetched.some(x => !x.ok) ? 'warn' : 'todo'}>
        {researching ? (
          <p className="m-0 text-foreground">The agent is researching your public profiles…</p>
        ) : research?.summary ? (
          <p className="m-0">Summary written {asOfLabel(research.updatedAt)}. See the Research tab.</p>
        ) : (
          <p className="m-0">Looks up your LinkedIn, portfolio and project links to find proof points your résumé is missing.</p>
        )}
        {fetched.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {fetched.map(x => (
              <li key={x.url} className="flex items-center gap-2" title={x.error ?? x.url}>
                <Icon name={x.ok ? 'circle-check' : 'triangle-alert'} className={`size-3.5 shrink-0 ${x.ok ? 'text-success' : 'text-warning'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate" title={x.url}>{x.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                <span className="sr-only">{x.ok ? 'fetched' : `not fetched: ${x.error}`}</span>
              </li>
            ))}
          </ul>
        )}
        {firecrawlOff && <p className="m-0 text-xs">Start Firecrawl in Integrations for better results.</p>}
        <Button size="sm" variant="outline" className="self-start border-border" disabled={!hasCv || !!researching || busy === 'research'} onClick={() => void runResearch()}>
          {busy === 'research' ? 'Fetching links…' : research?.summary ? 'Run research again' : 'Run research'}
        </Button>
      </Step>
      </div>

      <div className="border-t border-border pt-4">
        <h2 className="m-0 mb-1 text-[13px] font-semibold text-foreground">Résumé skills</h2>
        <p className="m-0 mb-2 text-[13px] text-muted-foreground">Agent runs that read your résumé. Results appear in Runs.</p>
        <div className="-ml-2 flex flex-col items-start">
          <Button size="sm" variant="subtle" disabled={!hasCv} onClick={() => void start('interview')}>Build my profile</Button>
          <Button size="sm" variant="subtle" disabled={!hasCv} onClick={() => void start('upskill')}>Find skill gaps</Button>
          <Button size="sm" variant="subtle" disabled={!hasCv} onClick={() => void start('titles')}>Suggest adjacent titles</Button>
        </div>
      </div>
    </aside>
  )
}
