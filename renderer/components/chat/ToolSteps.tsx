import { useEffect, useRef, useState } from 'react'
import { Bot, Check, ChevronRight, Loader2, FilePenLine, FileText, Globe, ListChecks, Search, Terminal, Wrench } from 'lucide-react'

import type { ToolStep } from './transcript'

// Adapted from paperclip task-chat/tool-taxonomy: tool name → family → icon.
const FAMILIES = {
  read: { icon: FileText, re: /^(Read|NotebookRead|LS)$/ },
  edit: { icon: FilePenLine, re: /^(Write|Edit|MultiEdit|NotebookEdit)$/ },
  search: { icon: Search, re: /^(Grep|Glob|ToolSearch)$/ },
  shell: { icon: Terminal, re: /^(Bash|BashOutput|KillShell)$/ },
  web: { icon: Globe, re: /^(WebFetch|WebSearch)$|firecrawl|browser/i },
  agent: { icon: Bot, re: /^(Task|Agent)$/ },
  plan: { icon: ListChecks, re: /^(TodoWrite|ExitPlanMode)$/ },
}
type Family = keyof typeof FAMILIES | 'other'

export function toolFamily(name: string): Family {
  return (Object.keys(FAMILIES) as Array<keyof typeof FAMILIES>).find(f => FAMILIES[f].re.test(name)) ?? 'other'
}

/** "850 ms", "4.2 s", "1 m 5 s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60_000)} m ${Math.round((ms % 60_000) / 1000)} s`
}

/** When each step first appeared on screen, so a live run can show how long every finished step took. */
function useStepTimes(count: number, live: boolean): number[] {
  const times = useRef<number[]>([])
  if (live) while (times.current.length < count) times.current.push(Date.now())
  const [, tick] = useState(0)
  useEffect(() => { if (!live) tick(n => n + 1) }, [live])
  return times.current
}

/** One agent turn's tool calls as a collapsible timeline: icon per family, running/done status, and duration while live. */
export function ToolSteps({ steps, live }: { steps: ToolStep[]; live: boolean }) {
  const [open, setOpen] = useState(steps.length <= 3)
  const times = useStepTimes(steps.length, live)
  const shown = open ? steps : steps.slice(-1)
  const offset = steps.length - shown.length
  return (
    <div className="my-2 rounded-md border border-border/60 bg-secondary/50 px-2 py-1.5 text-xs">
      {steps.length > 1 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className="mb-1 flex cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronRight className={`size-3.5 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} aria-hidden />
          {open ? 'Hide' : 'Show'} {steps.length} steps
        </button>
      )}
      <ol aria-label="Tool steps" className="m-0 list-none space-y-0.5 p-0">
        {shown.map((step, j) => {
          const i = offset + j
          const family = toolFamily(step.name)
          const Icon = family === 'other' ? Wrench : FAMILIES[family].icon
          const running = live && i === steps.length - 1
          const took = !running && times[i] !== undefined && times[i + 1] !== undefined ? times[i + 1]! - times[i]! : null
          return (
            <li key={i} className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <Icon className={`size-3.5 shrink-0 ${running ? 'text-primary' : ''}`} aria-hidden />
              <span className="font-medium text-foreground">{step.name}</span>
              {step.hint && <span className="min-w-0 truncate font-mono" title={step.hint}>{step.hint}</span>}
              <span className="ml-auto flex shrink-0 items-center gap-1 pl-2 tabular-nums">
                {took !== null && <span>{formatDuration(took)}</span>}
                {running
                  ? <><Loader2 className="size-3.5 text-primary motion-safe:animate-spin" aria-hidden /><span className="sr-only">running</span></>
                  : <><Check className="size-3.5 text-success" aria-hidden /><span className="sr-only">done</span></>}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
