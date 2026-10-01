import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { CommandPalette } from './components/CommandPalette'
import { ErrorBoundary } from './components/ErrorBoundary'
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
import { Monitoring } from './sections/Monitoring'
import { Copilot } from './sections/Copilot'
import { Resume } from './sections/Resume'
import { Runs } from './sections/Runs'
import { Overview } from './sections/Overview'
import { Boards } from './sections/Boards'
import { Job } from './sections/Job'
import { Jobs } from './sections/Jobs'
import { useDebriefLink } from './lib/copilotDebrief'
import { openApplication } from './lib/jobNav'
import { Onboarding, needsOnboarding } from './sections/Onboarding'
import { Settings } from './sections/Settings'
import { AppPrefsProvider } from './components/settings/AppPrefsProvider'
import { useAttention } from './components/settings/attention'
import { isPageId, type PageId } from './components/settings/pages'
import { PAGE_KEY } from './components/settings/SettingsShell'
import { applyTheme, readTheme } from './lib/theme'
import type { Application } from './lib/types'

export const TITLES: Record<Section, string> = { overview: 'Overview', jobs: 'Jobs', boards: 'Boards', resume: 'Resume', agent: 'Agent', monitoring: 'Monitoring', runs: 'Runs', settings: 'Settings', job: 'Jobs', copilot: 'Copilot' }
const KEYS: Record<string, Section> = { '1': 'overview', '2': 'jobs', '3': 'boards', '4': 'resume', '5': 'agent', '6': 'monitoring', '7': 'runs', '8': 'copilot', ',': 'settings' }
const SECTION_KEY = 'careerloom.section'

/** Copilot exists on macOS only; everything else is always there. */
const sectionAvailable = (id: string): boolean => Object.hasOwn(TITLES, id) && (id !== 'copilot' || isMacPlatform())

function initialSection(): Section {
  try {
    const v = globalThis.localStorage?.getItem(SECTION_KEY)
    // The Integrations screen moved into Settings: send old saved sessions to its page.
    if (v === 'integrations') { globalThis.localStorage?.setItem(PAGE_KEY, 'integrations'); return 'settings' }
    return v && v !== 'job' && sectionAvailable(v) ? (v as Section) : 'overview'
  } catch { return 'overview' }
}

export function App() {
  return <AppPrefsProvider><AppBody /></AppPrefsProvider>
}

function AppBody() {
  const runs = useRunsState()
  useDebriefLink()
  const [section, setSection] = useState<Section>(initialSection)
  const [jobFocus, setJobFocus] = useState<string | null>(null)
  const [runsFocus, setRunsFocus] = useState<string | null>(null)
  const clearRunsFocus = useCallback(() => setRunsFocus(null), [])
  const [boardFocus, setBoardFocus] = useState<string | null>(null)
  const [settingsTarget, setSettingsTarget] = useState<{ page?: PageId; focus?: string; nonce: number }>({ nonce: 0 })
  useEffect(() => {
    // Screens without an onNavigate prop jump via `careerloom:navigate` (detail = Section id, or {section, id} to deep-link).
    const navigate = (e: Event) => {
      const d = (e as CustomEvent<unknown>).detail
      const raw = typeof d === 'string' ? d : (d as { section?: unknown } | null)?.section
      const detail = typeof d === 'object' && d ? (d as { id?: unknown; page?: unknown; focus?: unknown }) : {}
      // 'integrations' is a retired screen: it lives at Settings > Integrations now.
      const target = raw === 'integrations' ? 'settings' : raw
      const page = raw === 'integrations' ? 'integrations' : detail.page
      if (typeof target !== 'string' || !sectionAvailable(target)) return
      setSection(target as Section)
      const id = detail.id
      if (target === 'settings') setSettingsTarget(prev => ({ page: isPageId(page) ? page : undefined, focus: typeof detail.focus === 'string' ? detail.focus : undefined, nonce: prev.nonce + 1 }))
      if (target === 'boards') setBoardFocus(typeof id === 'string' ? id : null)
      if (target === 'runs') setRunsFocus(typeof id === 'string' ? id : null)
      if (target === 'job') setJobFocus(typeof id === 'string' ? id : null)
    }
    window.addEventListener('careerloom:navigate', navigate)
    return () => {
      window.removeEventListener('careerloom:navigate', navigate)
    }
  }, [])
  const settings = usePolled(() => careerloom.getSettings(), [runs.generation], { intervalMs: null })
  const ready = settings.data?.rootCheck?.ok === true
  const attention = useAttention(settings.data)

  useEffect(() => { applyTheme(readTheme()) }, [])
  useEffect(() => careerloom.onSettings(settings.refresh), [settings.refresh])
  // Folder validated: say when Careerloom switched to a CLI that can actually run, or none can.
  useEffect(() => careerloom.onReadiness(({ readiness, switchedTo }) => {
    const label = readiness.clis.find(c => c.id === switchedTo)?.label
    if (label) showToast(`Switched to ${label} — your previous runner isn't ready (see Settings)`, 'ok', 6000)
    else if (!readiness.clis.some(c => c.ready)) showToast('No agent CLI is ready for this folder — open Settings to fix it', 'error', 8000)
  }), [])
  useEffect(() => {
    try { globalThis.localStorage?.setItem(SECTION_KEY, section === 'job' ? 'jobs' : section) } catch { /* storage can be unavailable */ }
  }, [section])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModifierChord(event)) return
      const target = KEYS[event.key]
      if (target && sectionAvailable(target)) { event.preventDefault(); setSection(target) }
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
  else if (shown === 'settings') body = <Settings settings={settings.data} onChanged={settings.refresh} target={settingsTarget} />
  else if (shown === 'overview') body = <Overview onNavigate={setSection} />
  else if (shown === 'jobs' || (shown === 'job' && !jobFocus)) body = <Jobs />
  else if (shown === 'job') body = <Job id={jobFocus!} />
  else if (shown === 'boards') body = <Boards focusId={boardFocus} onFocusHandled={() => setBoardFocus(null)} />
  else if (shown === 'resume') body = <Resume />
  else if (shown === 'runs') body = <Runs focusId={runsFocus} onFocusHandled={clearRunsFocus} />
  else if (shown === 'monitoring') body = <Monitoring onNavigate={setSection} />
  else if (shown === 'copilot') body = <Copilot />
  else body = <Agent />

  const running = runs.runs.filter(r => r.status === 'running').length
  const isMac = isMacPlatform()
  return (
    <RunsContext.Provider value={runs}>
      <Window>
        {/* Setup is one focused flow: no navigation to screens that can't work yet. */}
        {!onboarding && <Sidebar active={shown === 'job' ? 'jobs' : shown} onNavigate={setSection} attention={Object.keys(attention).length > 0} />}
        <ToastHost />
        <div className="ct" aria-busy={running > 0}>
          <div className={running > 0 ? 'switch-line on' : 'switch-line'} aria-hidden="true" />
          <div className="bar">
            <h1 className="t">{onboarding ? 'Get started' : TITLES[shown]}</h1>
            {settings.data?.rootCheck?.ok && <span className="scope">{settings.data.rootCheck.root}</span>}
            <div className="sp" />
            {!onboarding && <>
            <button type="button" className="btnp" onClick={() => setSection('runs')}>{running > 0 ? `${running} running…` : 'Runs'}</button>
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
          {ready && !onboarding && <CommandPalette onNavigate={setSection} onOpenApplication={openApplication} />}
        </div>
      </Window>
    </RunsContext.Provider>
  )
}
