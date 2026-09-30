// Adapter for the two WP1-owned components (OverlayPreview, PrivacyModeNotice). Until WP1 merges, these are plain stand-ins
// with the same props; at integration the lead replaces this file's bodies with re-exports of the WP1 files. TODO-legal: notice copy.
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CopilotConfig } from '@/lib/types'

/** Bump with the notice copy (WP1 owns the real constant in privacy-mode.ts). */
export const NOTICE_VERSION = 'privacy-mode-2026-10-01.draft1'

export function PrivacyModeNotice({ open, onCancel, onAccept }: { open: boolean; onCancel: () => void; onAccept: () => void }): ReactNode {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Before you turn on Privacy mode</DialogTitle>
          <DialogDescription>TODO-legal: draft wording, not final.</DialogDescription>
        </DialogHeader>
        <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-sm text-foreground">
          <li>Some interviewers and employers do not allow AI assistance. Check their rules first.</li>
          <li>Hiding the overlay from screen sharing is unreliable on macOS 15 and later, and does nothing against cameras, proctoring tools or people watching your screen.</li>
          <li>You still confirm each live session, and the menu bar icon still shows when audio is being captured.</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onAccept}>I understand, turn it on</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function OverlayPreview({ config }: { config: CopilotConfig['overlay'] }): ReactNode {
  return (
    <div role="img" aria-label="Overlay preview" className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground" style={{ opacity: config.opacity, fontSize: config.fontPx }}>
      Overlay preview (WP1 component replaces this)
    </div>
  )
}
