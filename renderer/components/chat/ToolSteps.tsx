import { useState } from 'react'
import { Bot, ChevronRight, FilePenLine, FileText, Globe, ListChecks, Search, Terminal, Wrench } from 'lucide-react'

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

/** One agent turn's tool calls, collapsed to "6 steps" once there are more than a couple. */
export function ToolSteps({ steps, live }: { steps: ToolStep[]; live: boolean }) {
  const [open, setOpen] = useState(steps.length <= 3)
  const shown = open ? steps : steps.slice(-1)
  return (
    <div className="my-2 rounded-md bg-secondary/50 px-2 py-1.5 text-xs">
      {steps.length > 3 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className="mb-1 flex cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
          {open ? 'Hide' : 'Show'} {steps.length} steps
        </button>
      )}
      <ul className="m-0 list-none space-y-0.5 p-0">
        {shown.map((step, i) => {
          const family = toolFamily(step.name)
          const Icon = family === 'other' ? Wrench : FAMILIES[family].icon
          const last = live && step === steps.at(-1)
          return (
            <li key={i} className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <Icon className={`size-3.5 shrink-0 ${last ? 'text-primary motion-safe:animate-pulse' : ''}`} aria-hidden />
              <span className="font-medium text-foreground">{step.name}</span>
              {step.hint && <span className="truncate font-mono" title={step.hint}>{step.hint}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
