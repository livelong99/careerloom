import { EmptyNote } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { navigate } from '@/lib/nav'
import { isMacPlatform } from '@/lib/platform'
import { EnginePage } from '@/sections/copilot/Engine'
import { PrivacyPage } from '@/sections/copilot/Privacy'
import { TranscriptionPage } from '@/sections/copilot/Transcription'

/** Speech, answer engine and privacy: the editors that used to be Copilot workspace tabs, re-hosted unchanged. */
export function CopilotPage() {
  if (!isMacPlatform()) return <EmptyNote>Interview Copilot is available on macOS only for now.</EmptyNote>
  return (
    <div className="flex flex-col [&_section[aria-label]:not([data-setting-id])]:pt-0">
      <header className="flex items-center justify-between gap-4 px-6 pt-6">
        <p className="m-0 text-sm text-muted-foreground">Audio, coaching, overlay, hotkeys, practice and sessions are tuned against a live preview, so they stay in the Copilot workspace.</p>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate('copilot')}>Open Copilot</Button>
      </header>
      <div data-setting-id="copilot:stt"><TranscriptionPage /></div>
      <div data-setting-id="copilot:engine"><EnginePage /></div>
      <div data-setting-id="copilot:privacy"><PrivacyPage /></div>
    </div>
  )
}
