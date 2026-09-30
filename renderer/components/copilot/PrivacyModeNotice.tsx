import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { PRIVACY_NOTICE_VERSION } from '../../../electron/copilot/privacy-mode'
import { Icon } from '../icons'

type Props = { open: boolean; onAccept: (noticeVersion: string) => void; onCancel: () => void }

const FACTS = [
  { icon: 'triangle-alert', tone: 'warn', body: <><b>Some interviewers and employers don't allow AI assistance.</b> Using Careerloom where it is banned may break their rules, whatever the overlay looks like.</> },
  { icon: 'info', tone: '', body: <><b>Hiding from screen sharing is unreliable on macOS 15 and later.</b> The system can ignore it. It also does nothing against cameras, proctoring software or someone watching your screen.</> },
  { icon: 'shield', tone: '', body: <>You still confirm consent before every live session, and the menu bar icon always shows when audio is being captured.</> },
] as const

/** One-time notice before Privacy mode can be switched on. The shown version is what main checks (privacy-mode.ts). */
export function PrivacyModeNotice({ open, onAccept, onCancel }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={next => { if (!next) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Before you turn on Privacy mode</AlertDialogTitle>
          <AlertDialogDescription>These options make the overlay less visible on your own screen. Read this once.</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="grid gap-2 p-0 m-0 list-none" aria-label="What Privacy mode does and does not do">
          {FACTS.map(f => (
            <li key={f.icon} className={`flex gap-3 rounded-lg border px-3 py-2.5 text-[13px] leading-snug ${f.tone === 'warn' ? 'border-[var(--warn)]' : 'border-[var(--line)]'}`}>
              <Icon name={f.icon} className={`mt-0.5 size-4 shrink-0 ${f.tone === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--mut)]'}`} />
              <span>{f.body}</span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onAccept(PRIVACY_NOTICE_VERSION)}>I understand, turn on</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
