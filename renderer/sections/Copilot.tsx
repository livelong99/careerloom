import { useEffect, useState } from 'react'

import { useCopilotConfig } from '../components/copilot/api'
import { ConfigStrip } from '../components/copilot/ConfigStrip'
import { CopilotActions } from '../components/copilot/CopilotActions'
import { GOTO_EVENT, takePendingPage } from '../components/copilot/selection'

import { EmptyNote } from '../components/EmptyState'
import { ScrollArea } from '../components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { copilotSupportedHere } from '../lib/platform'
import { AppearancePage } from './copilot/Appearance'
import { AudioPage } from './copilot/Audio'
import { CoachingPage } from './copilot/Coaching'
import { HotkeysPage } from './copilot/Hotkeys'
import { PracticePage } from './copilot/Practice'
import { SessionsPage } from './copilot/Sessions'
import { SetupPage } from './copilot/Setup'

const PAGES = [
  ['setup', 'Setup', SetupPage],
  ['practice', 'Practice', PracticePage],
  ['audio', 'Audio', AudioPage],
  ['coaching', 'Coaching', CoachingPage],
  ['appearance', 'Appearance', AppearancePage],
  ['hotkeys', 'Hotkeys', HotkeysPage],
  ['sessions', 'Sessions', SessionsPage],
] as const
type PageId = (typeof PAGES)[number][0]

/** Interview Copilot config workspace: side navigation, one full-width page at a time (same shell as Resume). */
export function Copilot() {
  const { config } = useCopilotConfig()
  const [page, setPage] = useState<PageId>(() => { const p = takePendingPage(); return PAGES.some(([id]) => id === p) ? (p as PageId) : 'setup' })
  useEffect(() => {
    const go = (e: Event): void => { const id = (e as CustomEvent<string>).detail; takePendingPage(); if (PAGES.some(([p]) => p === id)) setPage(id as PageId) }
    window.addEventListener(GOTO_EVENT, go)
    return () => window.removeEventListener(GOTO_EVENT, go)
  }, [])
  if (!copilotSupportedHere()) return <EmptyNote>Interview Copilot is available on macOS and Windows only.</EmptyNote>
  return (
    <div className="workspace workspace-fill gap-4">
      <header className="flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 truncate text-base font-semibold text-foreground">Interview Copilot</h1>
          <p className="m-0 text-xs text-muted-foreground">Practice with your own job and résumé, or get live help in a real interview.</p>
        </div>
        <CopilotActions />
      </header>
      {config && <ConfigStrip config={config} />}
      <Tabs orientation="vertical" value={page} onValueChange={v => setPage(v as PageId)} className="min-h-0 flex-1 flex-row gap-4">
        <TabsList aria-label="Copilot pages" className="h-fit w-44 shrink-0 flex-col items-stretch gap-1 bg-transparent p-0">
          {PAGES.map(([id, label]) => <TabsTrigger key={id} value={id} className="h-8 flex-none justify-start data-[state=active]:bg-muted">{label}</TabsTrigger>)}
        </TabsList>
        <ScrollArea key={page} className="min-h-0 min-w-0 flex-1 rounded-xl border border-border">
          {PAGES.map(([id, , Body]) => <TabsContent key={id} value={id}><Body /></TabsContent>)}
        </ScrollArea>
      </Tabs>
    </div>
  )
}
