import { useState } from 'react'

import { Icon } from '../components/icons'
import { cn } from '@/lib/utils'
import { GOALS, PIPELINE, topicById } from './topics'

/** The pipeline as a thread: every stop opens its topic. The one expressive element on the page. */
function PipelineMap({ read, onPick }: { read: Set<string>; onPick: (id: string) => void }) {
  return (
    <ol className="m-0 grid list-none grid-cols-2 gap-y-5 p-0 sm:grid-cols-3 lg:grid-cols-6" aria-label="The Careerloom pipeline">
      {PIPELINE.map((p, i) => {
        const t = topicById(p.id)!
        return (
          <li key={p.id} className={cn('relative flex flex-col items-center text-center', i < PIPELINE.length - 1 && "lg:after:absolute lg:after:top-[19px] lg:after:left-[calc(50%+22px)] lg:after:h-px lg:after:w-[calc(100%-44px)] lg:after:bg-[linear-gradient(90deg,var(--accent),var(--thread))] lg:after:content-['']")}>
            <button type="button" onClick={() => onPick(p.id)} className="group flex flex-col items-center gap-1.5 rounded-lg p-1.5 outline-offset-2">
              <span className={cn('grid size-10 place-items-center rounded-full border-2 border-[var(--accent)] bg-card text-[var(--accent-text)] transition-transform group-hover:scale-110 group-focus-visible:scale-110', read.has(p.id) && 'bg-[var(--accent)] text-[var(--primary-ink)]')}>
                <Icon name={t.icon} className="size-[18px]" aria-hidden />
              </span>
              <span className="text-[13px] font-medium">{p.label}</span>
              <span className="text-xs text-muted-foreground">{p.hint}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function Landing({ read, onPick }: { read: Set<string>; onPick: (id: string) => void }) {
  const [goalId, setGoalId] = useState(read.size ? 'find' : 'setup')
  const goal = GOALS.find(g => g.id === goalId)!
  return (
    <div className="flex flex-col gap-8">
      <header className="max-w-[62ch]">
        <h2 className="m-0 mb-2 text-2xl font-semibold tracking-tight">Find the one job, not the 5,000.</h2>
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">Careerloom collects listings, narrows them cheaply, evaluates the few that matter and helps you prepare. Follow the thread below, or tell us what you are trying to do.</p>
      </header>

      <section aria-label="Pipeline" className="rounded-xl border border-border bg-card px-4 py-5">
        <PipelineMap read={read} onPick={onPick} />
      </section>

      <section aria-labelledby="goal-h" className="flex flex-col gap-3">
        <h3 id="goal-h" className="m-0 text-sm font-semibold">I want to…</h3>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="goal-h">
          {GOALS.map(g => (
            <button key={g.id} type="button" aria-pressed={g.id === goalId} onClick={() => setGoalId(g.id)}
              className={cn('min-h-8 rounded-full border px-3 text-[13px] transition-colors hover:bg-muted', g.id === goalId ? 'border-[var(--accent)] bg-[var(--nav-on)] font-medium text-[var(--nav-ink)]' : 'border-border')}>
              {g.label}
            </button>
          ))}
        </div>
        <ol className="m-0 flex max-w-[70ch] list-none flex-col gap-2 p-0" aria-live="polite">
          {goal.path.map(id => {
            const t = topicById(id)!
            return (
              <li key={id}>
                <button type="button" onClick={() => onPick(id)} className="flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-[var(--accent)]">
                  <Icon name={t.icon} className="mt-0.5 size-4 shrink-0 text-[var(--accent-text)]" aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t.title}</span><span className="block text-[13px] text-muted-foreground">{t.summary}</span></span>
                  <Icon name="chevron-right" className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
