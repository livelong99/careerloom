import { useEffect, useRef, useState } from 'react'
import loomi from '../assets/loomi.svg'

import { SetupStep } from '../components/bootstrap/SetupStep'
import { AgentStep } from '../components/onboarding/AgentStep'
import { ResumeStep } from '../components/onboarding/ResumeStep'
import { WorkspaceStep } from '../components/onboarding/WorkspaceStep'
import { Footer, PRIMARY, StepHeader } from '../components/onboarding/parts'
import { usePolled } from '../hooks/usePolled'
import { careerloom } from '../lib/ipc'
import type { Settings } from '../lib/types'

const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'tools', label: 'Install' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'agent', label: 'Agent' },
  { id: 'resume', label: 'Résumé' },
] as const
type StepId = typeof STEPS[number]['id']
const KEY = 'careerloom.onboarding' // current step while onboarding is unfinished
const WORKSPACE = STEPS.findIndex(s => s.id === 'workspace')

function savedStep(): StepId | null {
  try {
    const v = globalThis.localStorage?.getItem(KEY)
    return STEPS.some(s => s.id === v) ? (v as StepId) : null
  } catch { return null }
}
function save(step: StepId | null): void {
  try { if (step) globalThis.localStorage?.setItem(KEY, step); else globalThis.localStorage?.removeItem(KEY) } catch { /* storage can be unavailable */ }
}

/** Show onboarding until a folder is set and the flow was finished (existing users skip it). */
export function needsOnboarding(settings: Settings): boolean {
  return settings.rootCheck?.ok !== true || savedStep() !== null
}

/** Resume where the user left off, but never past the workspace step without a folder. */
function initialStep(rootOk: boolean): StepId {
  const saved = savedStep() ?? 'welcome'
  return !rootOk && STEPS.findIndex(s => s.id === saved) > WORKSPACE ? 'workspace' : saved
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const settings = usePolled(() => careerloom.getSettings(), [], { intervalMs: null })
  useEffect(() => careerloom.onSettings(settings.refresh), [settings.refresh])
  const s = settings.data
  const [step, setStep] = useState<StepId | null>(null)
  const current = step ?? (s ? initialStep(s.rootCheck?.ok === true) : null)
  const index = STEPS.findIndex(x => x.id === current)
  const body = useRef<HTMLDivElement>(null)
  const moved = useRef(false)

  useEffect(() => { if (current) save(current) }, [current])
  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (moved.current) body.current?.querySelector<HTMLElement>('[data-step-title]')?.focus()
  }, [current])

  const go = (id: StepId) => { moved.current = true; setStep(id) }
  const next = () => go(STEPS[index + 1]!.id)
  const finish = () => { save(null); onDone() }

  return (
    <div className="workspace flex justify-center overflow-y-auto">
      <div className="flex w-full max-w-[640px] flex-col gap-6 py-8">
        <span className="flex items-center gap-3">
          <img src={loomi} alt="" width={40} height={40} />
          <b className="brand-text text-2xl">Career<span className="loom">loom</span></b>
        </span>
        <nav aria-label="Setup steps">
          <ol className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[length:var(--fs-meta)]">
            {STEPS.map((x, i) => (
              <li key={x.id} aria-current={i === index ? 'step' : undefined} className={i === index ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                {i < index
                  ? <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-inherit underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" onClick={() => go(x.id)}>{i + 1}. {x.label}</button>
                  : <span>{i + 1}. {x.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
        <div ref={body} className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
          {!s || !current ? <p className="m-0 text-muted-foreground">Loading…</p>
            : current === 'welcome' ? (
              <>
                <StepHeader title="Welcome to Careerloom" lead="Careerloom finds and evaluates jobs for you and tailors your résumé to each one, using an AI agent that runs on your computer. Careerloom installs everything it needs by itself first." />
                <Footer><button type="button" className={PRIMARY} onClick={next}>Get started</button></Footer>
              </>
            )
              : current === 'tools' ? <SetupStep onNext={next} />
                : current === 'workspace' ? <WorkspaceStep settings={s} onChanged={settings.refresh} onNext={next} />
                  : current === 'agent' ? <AgentStep settings={s} onChanged={settings.refresh} onNext={next} />
                    : <ResumeStep onDone={finish} />}
        </div>
      </div>
    </div>
  )
}
