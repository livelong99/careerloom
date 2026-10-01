// Small shared pieces for every Settings page: save state, readiness badge, test result, danger zone.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { showToast } from '../../lib/toast'
import type { KeyTest } from '../../lib/types'
import { Icon } from '../icons'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'unsaved' | 'error'

/** Drives a group's SaveState chip: `run(fn)` shows Saving…, then Saved (fades after 2 s) or Error. */
export function useSaveState() {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current)
    setStatus('saving')
    try {
      await fn()
      setStatus('saved')
      timer.current = setTimeout(() => setStatus('idle'), 2000)
      return true
    } catch {
      setStatus('error')
      return false
    }
  }, [])
  return { status, run, setStatus }
}

export function SaveState({ status, onRetry }: { status: SaveStatus; onRetry?: () => void }) {
  if (status === 'idle') return null
  if (status === 'error') {
    return (
      <span role="status" className="status-line" style={{ color: 'var(--bad)' }}>
        <Icon name="triangle-alert" />Error{onRetry && <> — <button type="button" className="underline underline-offset-2" onClick={onRetry}>retry</button></>}
      </span>
    )
  }
  const label = { saving: 'Saving…', saved: 'Saved', unsaved: 'Unsaved' }[status]
  return (
    <span role="status" className={cn('status-line', status === 'saved' ? 'ok' : 'muted')}>
      {status === 'saved' && <Icon name="circle-check" />}{label}
    </span>
  )
}

export type ReadyState = 'ready' | 'needs-setup' | 'error' | 'off' | 'checking'
const READINESS: Record<ReadyState, { text: string; color: string; icon: 'circle-check' | 'triangle-alert' | 'circle' | 'refresh-cw' }> = {
  ready: { text: 'Ready', color: 'var(--ok)', icon: 'circle-check' },
  'needs-setup': { text: 'Needs setup', color: 'var(--warn)', icon: 'triangle-alert' },
  error: { text: 'Error', color: 'var(--bad)', icon: 'triangle-alert' },
  off: { text: 'Off', color: 'var(--mut)', icon: 'circle' },
  checking: { text: 'Checking…', color: 'var(--mut)', icon: 'refresh-cw' },
}

/** Status as text + icon (never colour alone); shared by runners, integrations and local models. */
export function ReadinessBadge({ state, label }: { state: ReadyState; label?: string }) {
  const s = READINESS[state]
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium" style={{ color: s.color, borderColor: `color-mix(in srgb, ${s.color} 40%, transparent)`, background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>
      <Icon name={s.icon} className="size-3" />{label ?? s.text}
    </span>
  )
}

const ago = (at: number, now = Date.now()): string => {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86_400)} d ago`
}

/** Result line of a connection test: spinner while running, else `ok · 412 ms · tested 2 min ago` or the reason. */
export function TestResult({ result, running }: { result: KeyTest | null; running?: boolean }) {
  if (running) return <span role="status" className="status-line muted"><Icon name="refresh-cw" />Testing…</span>
  if (!result) return null
  return (
    <span role="status" className={cn('status-line', result.ok ? 'ok' : undefined)} style={result.ok ? undefined : { color: 'var(--bad)' }}>
      <Icon name={result.ok ? 'circle-check' : 'triangle-alert'} />
      {result.ok ? 'ok' : result.detail || 'failed'}{result.latencyMs != null && <> · {result.latencyMs} ms</>} · tested {ago(result.at)}
    </span>
  )
}

/** Collapsed-by-default bordered group for destructive actions; pair each action with <ConfirmDialog>. */
export function DangerZone({ children, title = 'Danger zone', focus }: { children: ReactNode; title?: string; focus?: string }) {
  return (
    <Collapsible asChild>
      <section data-setting-id={focus} aria-label={title} className="rounded-xl border p-4" style={{ borderColor: 'color-mix(in srgb, var(--bad) 45%, transparent)' }}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left text-sm font-semibold" style={{ color: 'var(--bad)' }}>
          {title}<Icon name="chevron-down" />
        </CollapsibleTrigger>
        <CollapsibleContent forceMount className="mt-3 data-[state=closed]:hidden">{children}</CollapsibleContent>
      </section>
    </Collapsible>
  )
}

/** Names the consequence before a destructive action; `typeWord` makes the user type it to enable the button. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, typeWord, onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  typeWord?: string
  onConfirm: () => void | Promise<void>
}) {
  const [typed, setTyped] = useState('')
  useEffect(() => { if (!open) setTyped('') }, [open])
  const blocked = typeWord !== undefined && typed !== typeWord
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {typeWord !== undefined && <Input aria-label={`Type ${typeWord} to confirm`} placeholder={`Type ${typeWord} to confirm`} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={blocked} onClick={() => { void onConfirm() }}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Apply a setting now and offer a 5 s Undo that re-applies the previous value through the same setter. */
export function applyWithUndo<T>(message: string, prev: T, next: T, set: (value: T) => unknown): void {
  void Promise.resolve(set(next)).then(
    () => showToast(message, 'ok', 5000, { label: 'Undo', onClick: () => { void set(prev) } }),
    err => showToast(err instanceof Error ? err.message : String(err), 'error', 6000),
  )
}
