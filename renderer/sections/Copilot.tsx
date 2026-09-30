import { useState } from 'react'

import { EmptyNote } from '../components/EmptyState'
import { ScrollArea } from '../components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { isMacPlatform } from '../lib/platform'
import { AppearancePage } from './copilot/Appearance'
import { AudioPage } from './copilot/Audio'
import { CoachingPage } from './copilot/Coaching'
import { EnginePage } from './copilot/Engine'
import { HotkeysPage } from './copilot/Hotkeys'
import { PracticePage } from './copilot/Practice'
import { PrivacyPage } from './copilot/Privacy'
import { SessionsPage } from './copilot/Sessions'
import { SetupPage } from './copilot/Setup'
import { TranscriptionPage } from './copilot/Transcription'

const PAGES = [
  ['setup', 'Setup', SetupPage],
  ['practice', 'Practice', PracticePage],
  ['audio', 'Audio', AudioPage],
  ['transcription', 'Transcription', TranscriptionPage],
  ['engine', 'Answer engine', EnginePage],
  ['coaching', 'Coaching', CoachingPage],
  ['appearance', 'Appearance', AppearancePage],
  ['hotkeys', 'Hotkeys', HotkeysPage],
  ['privacy', 'Privacy', PrivacyPage],
  ['sessions', 'Sessions', SessionsPage],
] as const
type PageId = (typeof PAGES)[number][0]

/** Interview Copilot config workspace: side navigation, one full-width page at a time (same shell as Resume). */
export function Copilot() {
  const [page, setPage] = useState<PageId>('setup')
  if (!isMacPlatform()) return <EmptyNote>Interview Copilot is available on macOS only for now.</EmptyNote>
  return (
    <div className="workspace workspace-fill gap-4">
      <header className="min-w-0">
        <h1 className="m-0 truncate text-base font-semibold text-foreground">Interview Copilot</h1>
        <p className="m-0 text-xs text-muted-foreground">Practice with your own job and résumé, or get live help in a real interview.</p>
      </header>
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
