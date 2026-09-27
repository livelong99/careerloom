import { useEffect, useState, type ReactNode } from 'react'

import { CommandPalette } from './components/CommandPalette'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ReportDrawer } from './components/ReportDrawer'
import { OPEN_RUNS_EVENT, RunsDrawer } from './components/RunsDrawer'
import { Hint } from './components/Hint'
import { Icon } from './components/icons'
import { Sidebar, type Section } from './components/Sidebar'
import { SectionSkeleton } from './components/Skeleton'
import { ToastHost } from './components/ToastHost'
import { UpdateBanner } from './components/UpdateBanner'
import { Window } from './components/Window'
import { usePolled } from './hooks/usePolled'
import { RunsContext, useRunsState } from './hooks/useRuns'
import { careerloom } from './lib/ipc'
import { showToast } from './lib/toast'
import { motionClass } from './lib/motion'
import { isMacPlatform, isModifierChord, shortcutLabel } from './lib/platform'
import { Agent } from './sections/Agent'
import { Integrations } from './sections/Integrations'
import { Monitoring } from './sections/Monitoring'
import { Resume } from './sections/Resume'
import { Overview } from './sections/Overview'
import { Jobs } from './sections/Jobs'
import { Onboarding, needsOnboarding } from './sections/Onboarding'
import { Settings } from './sections/Settings'
import { applyTheme, readTheme } from './lib/theme'
import type { Application } from './lib/types'

export const TITLES: Record<Section, string> = { overview: 'Overview', jobs: 'Jobs', resume: 'Resume', agent: 'Agent', monitoring: 'Monitoring', integrations: 'Integrations', settings: 'Settings' }
const KEYS: Record<string, Section> = { '1': 'overview', '2': 'jobs', '3': 'resume', '4': 'agent', '5': 'monitoring', '6': 'integrations', ',': 'settings' }
const SECTION_KEY = 'careerloom.section'

function initialSection(): Section {
  try {
    const v = globalThis.localStorage?.getItem(SECTION_KEY)
    return v && Object.hasOwn(TITLES, v) ? (v as Section) : 'overview'
  } catch { return 'overview' }
}

export function App() {
  const runs = useRunsState()
  const [section, setSection] = useState<Section>(initialSection)
  const [openApp, setOpenApp] = useState<Application | null>(null)
  const [runsOpen, setRunsOpen] = useState(false)
  useEffect(() => {
    const open = () => setRunsOpen(true)
    // Screens without an onNavigate prop jump via `careerloom:navigate` (detail = Section id).
    const navigate = (e: Event) => {
      const target = (e as CustomEvent<unknown>).detail
      if (typeof target === 'string' && Object.hasOwn(TITLES, target)) setSection(target as Section)
    }
    window.addEventListener(OPEN_RUNS_EVENT, open)
    window.addEventListener('careerloom:navigate', navigate)
    return () => {
      window.removeEventListener(OPEN_RUNS_EVENT, open)
      window.removeEventListener('careerloom:navigate', navigate)
    }
  }, [])
  const settings = usePolled(() => careerloom.getSettings(), [runs.generation], { intervalMs: null })
  const ready = settings.data?.rootCheck?.ok === true

  useEffect(() => { applyTheme(readTheme()) }, [])
  useEffect(() => careerloom.onSettings(settings.refresh), [settings.refresh])
  // Folder validated: say when Careerloom switched to a CLI that can actually run, or none can.
  useEffect(() => careerloom.onReadiness(({ readiness, switchedTo }) => {
    const label = readiness.clis.find(c => c.id === switchedTo)?.label
    if (label) showToast(`Switched to ${label} — your previous runner isn't ready (see Settings)`, 'ok', 6000)
    else if (!readiness.clis.some(c => c.ready)) showToast('No agent CLI is ready for this folder — open Settings to fix it', 'error', 8000)
  }), [])
  useEffect(() => {
    try { globalThis.localStorage?.setItem(SECTION_KEY, section) } catch { /* storage can be unavailable */ }
  }, [section])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModifierChord(event)) return
      const target = KEYS[event.key]
      if (target) { event.preventDefault(); setSection(target) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Until a valid career-ops folder is set, every section is Settings' setup pane.
  // First run (or a folder that went missing): the guided setup replaces every screen.
  const onboarding = settings.data != null && needsOnboarding(settings.data)
  const shown: Section = section
  let body: ReactNode
  if (!settings.data) body = <SectionSkeleton label="Loading" />
  else if (onboarding) body = <Onboarding onDone={settings.refresh} />
  else if (shown === 'settings') body = <Settings settings={settings.data} onChanged={settings.refresh} />
  else if (shown === 'overview') body = <Overview onNavigate={setSection} />
  else if (shown === 'jobs') body = <Jobs />
  else if (shown === 'resume') body = <Resume />
  else if (shown === 'monitoring') body = <Monitoring onNavigate={setSection} />
  else if (shown === 'integrations') body = <Integrations />
  else body = <Agent />

  const running = runs.runs.filter(r => r.status === 'running').length
  const isMac = isMacPlatform()
  return (
    <RunsContext.Provider value={runs}>
      <Window>
        {/* Setup is one focused flow: no navigation to screens that can't work yet. */}
        {!onboarding && <Sidebar active={shown} onNavigate={setSection} />}
        <ToastHost />
        <div className="ct" aria-busy={running > 0}>
          <div className={running > 0 ? 'switch-line on' : 'switch-line'} aria-hidden="true" />
          <div className="bar">
            <h1 className="t">{onboarding ? 'Get started' : TITLES[shown]}</h1>
            {settings.data?.rootCheck?.ok && <span className="scope">{settings.data.rootCheck.root}</span>}
            <div className="sp" />
            {!onboarding && <>
            <button type="button" className="btnp" onClick={() => setRunsOpen(true)}>{running > 0 ? `${running} running…` : 'Runs'}</button>
            <button type="button" className="btnp" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: isMac, ctrlKey: !isMac }))}>
              <Icon name="search" />Search <span className="hint-k">{shortcutLabel('K')}</span>
            </button>
            </>}
          </div>
          <UpdateBanner />
          <ErrorBoundary key={shown}>
            <div className={motionClass('body', 'section-fade')}>{body}</div>
          </ErrorBoundary>
          {!onboarding && <Hint items={[{ k: shortcutLabel('K'), label: 'Command palette' }, { k: shortcutLabel('1-6'), label: 'Navigate' }, { k: shortcutLabel(','), label: 'Settings' }]} />}
          {ready && !onboarding && <CommandPalette onNavigate={setSection} onOpenApplication={setOpenApp} />}
          {openApp && <ReportDrawer app={openApp} onClose={() => setOpenApp(null)} />}
          <RunsDrawer open={runsOpen} onOpenChange={setRunsOpen} />
        </div>
      </Window>
    </RunsContext.Provider>
  )
}
