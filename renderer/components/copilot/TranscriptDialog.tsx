import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { SessionDetail } from '@/lib/types'

/** Focusable reader view of the session (the overlay itself cannot take focus). */
export function TranscriptDialog({ session, open, onOpenChange }: { session: SessionDetail | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const removed = session !== null && session.transcript.length === 0 && session.questions > 0
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Transcript</DialogTitle><DialogDescription>{session ? `${session.jobTitle} · ${session.company}` : ''}</DialogDescription></DialogHeader>
        {removed ? <p className="m-0 text-sm text-muted-foreground">The transcript text was removed by your retention setting. Scores and notes are kept.</p>
          : <ol aria-label="Transcript" className="m-0 flex max-h-96 list-none flex-col gap-2 overflow-auto p-0 text-sm">
            {session?.transcript.map(l => (
              <li key={l.id} className="flex gap-2"><b className={l.speaker === 'interviewer' ? 'w-24 shrink-0 text-info' : 'w-24 shrink-0 text-brand-text'}>{l.speaker === 'interviewer' ? 'Interviewer' : 'You'}</b><span>{l.text}</span></li>
            ))}
          </ol>}
      </DialogContent>
    </Dialog>
  )
}
