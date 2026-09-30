import { Button } from '@/components/ui/button'
import type { PermStatus } from '@/lib/types'
import { Note } from './Group'
import { Chip } from './hwControls'

const STATUS: Record<PermStatus, { text: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  granted: { text: 'Allowed', tone: 'ok' }, denied: { text: 'Blocked', tone: 'bad' }, 'not-determined': { text: 'Not asked yet', tone: 'warn' },
  restricted: { text: 'Restricted', tone: 'bad' }, unknown: { text: 'Unknown', tone: 'neutral' },
}
export const PermissionChip = ({ status }: { status: PermStatus }) => <Chip tone={STATUS[status].tone}>{STATUS[status].text}</Chip>

const STEPS = {
  microphone: ['Open System Settings → Privacy & Security → Microphone.', 'Turn on Careerloom, then quit and reopen it.', 'Come back and press Test. You should see the bars move when you speak.'],
  'system-audio': ['Open System Settings → Privacy & Security → System Audio Recording.', 'Turn on Careerloom, then quit and reopen it.', 'Come back and press Test. You should see the bars move while a video plays.'],
} as const

/** Shown while a permission is missing: what happened, three steps, and a button to the right settings pane. */
export function PermissionFix({ kind, onOpen, onTest, testing }: { kind: keyof typeof STEPS; onOpen: () => void; onTest?: () => void; testing?: boolean }) {
  const name = kind === 'microphone' ? 'the microphone' : 'system audio'
  return (
    <div className="flex flex-col gap-3">
      <Note tone="warn">Careerloom can&apos;t hear {name} yet. macOS stays silent instead of showing an error until you allow it.</Note>
      <ol className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-foreground">
        {STEPS[kind].map((s, i) => (
          <li key={s} className="flex items-center gap-2"><span aria-hidden className="grid size-5 place-items-center rounded-full bg-muted text-xs text-muted-foreground">{i + 1}</span>{s}</li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button onClick={onOpen}>Open System Settings</Button>
        {onTest && <Button variant="outline" disabled={testing} onClick={onTest}>Test for 3 seconds</Button>}
      </div>
    </div>
  )
}
