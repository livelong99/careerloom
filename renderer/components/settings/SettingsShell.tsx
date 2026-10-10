import { useEffect, useRef, useState, type ComponentType } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isPageId, PAGE_GROUPS, PAGES, type PageId, type PageProps } from './pages'
import { SettingsSearch } from './SettingsSearch'
import { useFocusPulse } from './useFocusPulse'
import { AdvancedPage } from './pages/Advanced'
import { AgentPage } from './pages/Agent'
import { CopilotPage } from './pages/Copilot'
import { DataPage } from './pages/Data'
import { GeneralPage } from './pages/General'
import { IntegrationsPage } from './pages/Integrations'
import { InterviewPrepPage } from './pages/InterviewPrep'
import { JobsPage } from './pages/Jobs'
import { KeysPage } from './pages/Keys'
import { LocalModelsPage } from './pages/LocalModels'
import { MonitoringPage } from './pages/Monitoring'
import { ResumePage } from './pages/Resume'
import { RunnersPage } from './pages/Runners'
import { SkillsPage } from './pages/Skills'

const BODIES: Record<PageId, ComponentType<PageProps>> = {
  general: GeneralPage, runners: RunnersPage, keys: KeysPage, 'local-models': LocalModelsPage, skills: SkillsPage, integrations: IntegrationsPage,
  jobs: JobsPage, resume: ResumePage, agent: AgentPage, copilot: CopilotPage, 'interview-prep': InterviewPrepPage, monitoring: MonitoringPage, data: DataPage, advanced: AdvancedPage,
}

export const PAGE_KEY = 'careerloom.settingsPage'
export type SettingsTarget = { page?: PageId; focus?: string; nonce: number }

const readPage = (): PageId => {
  try { const v = globalThis.localStorage?.getItem(PAGE_KEY); return isPageId(v) ? v : 'general' } catch { return 'general' }
}

/** Side-nav (5 groups, attention dots) + search + the active page. Deep links arrive as `target`. */
export function SettingsShell({ settings, onChanged, target, attention = {} }: { settings: PageProps['settings']; onChanged: () => void; target?: SettingsTarget; attention?: Partial<Record<PageId, string>> }) {
  const [page, setPage] = useState<PageId>(() => target?.page ?? readPage())
  const [focus, setFocus] = useState<{ id: string | null; nonce: number }>({ id: target?.focus ?? null, nonce: target?.nonce ?? 0 })
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => { try { globalThis.localStorage?.setItem(PAGE_KEY, page) } catch { /* storage can be unavailable */ } }, [page])
  useEffect(() => {
    if (!target || target.nonce === 0) return
    if (target.page) setPage(target.page)
    setFocus({ id: target.focus ?? null, nonce: target.nonce })
  }, [target?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps
  useFocusPulse(body, focus.id, focus.nonce, [page])

  const go = (p: PageId, f?: string) => { setPage(p); setFocus(prev => ({ id: f ?? null, nonce: prev.nonce + 1 })) }
  const current = PAGES.find(p => p.id === page)!

  return (
    <div className="workspace workspace-fill gap-4">
      <Tabs orientation="vertical" value={page} onValueChange={v => go(v as PageId)} className="min-h-0 flex-1 flex-row gap-4">
        <div className="flex w-44 shrink-0 flex-col gap-3 lg:w-52">
          <SettingsSearch onPick={go} />
          <ScrollArea className="min-h-0 flex-1">
            <TabsList aria-label="Settings pages" className="h-fit w-full flex-col items-stretch gap-0.5 bg-transparent p-0">
              {PAGE_GROUPS.map(g => (
                <div key={g.label} role="presentation" className="flex flex-col gap-0.5 pb-3">
                  <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</div>
                  {g.pages.map(p => (
                    <TabsTrigger key={p.id} value={p.id} className="h-8 flex-none justify-between gap-2 data-[state=active]:bg-muted">
                      <span className="truncate">{p.label}</span>
                      {attention[p.id] && <span role="img" aria-label={`Needs attention: ${attention[p.id]}`} title={attention[p.id]} className="size-2 shrink-0 rounded-full" style={{ background: 'var(--warn)' }} />}
                    </TabsTrigger>
                  ))}
                </div>
              ))}
            </TabsList>
          </ScrollArea>
        </div>
        <ScrollArea className="min-h-0 min-w-0 flex-1 rounded-xl border border-border">
          {/* Only the active page is rendered: `flex` would override the hidden attribute of inactive panels. */}
          <TabsContent value={page} className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
            <div ref={body} className="flex flex-col gap-4">
              <header>
                <h2 className="m-0 text-lg font-semibold text-foreground">{current.label}</h2>
                <p className="m-0 mt-1 text-sm text-muted-foreground">{current.blurb}</p>
              </header>
              {(() => { const Body = BODIES[page]; return <Body settings={settings} onChanged={onChanged} /> })()}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
