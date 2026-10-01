import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

import type { KbSummary } from '../../../electron/kb/types'
import { ageDays, researchedLabel, usd } from './format'

type Tone = 'warn' | 'bad' | 'info'
const TONE: Record<Tone, string> = {
  warn: 'border-[color-mix(in_srgb,var(--thread)_45%,transparent)] bg-[color-mix(in_srgb,var(--thread)_10%,var(--card))]',
  bad: 'border-[color-mix(in_srgb,var(--bad)_45%,transparent)] bg-[color-mix(in_srgb,var(--bad)_9%,var(--card))]',
  info: 'border-border bg-card',
}
const link = 'cursor-pointer border-0 bg-transparent p-0 font-medium text-brand-text underline-offset-2 hover:underline'

function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`mb-2.5 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] ${TONE[tone]}`}>
      <AlertTriangle aria-hidden className={`mt-0.5 size-4 shrink-0 ${tone === 'bad' ? 'text-destructive' : 'text-[var(--thread-text)]'}`} />
      <div>{children}</div>
    </div>
  )
}

type Props = { summary: KbSummary; offline: boolean; onRefresh: () => void; onContinue: () => void }

/** The state banners above the bank (design §6): partial, offline / failed, stale or changed input. */
export function Banners({ summary, offline, onRefresh, onContinue }: Props) {
  const weak = summary.coverage.filter(c => c.have < c.need).map(c => c.name)
  const age = ageDays(summary.researchedAt)
  return (
    <>
      {summary.status === 'partial' && (
        <Notice tone="warn">
          <b>Partial results — the research stopped early.</b> Spent {usd(summary.costUsd)}; the bank is usable.{weak.length > 0 && <> {weak.slice(0, 3).join(', ')} {weak.length > 3 ? 'and others have' : weak.length > 1 ? 'have' : 'has'} fewer questions than needed.</>}{' '}
          <button type="button" className={link} onClick={onContinue}>Continue for up to $0.10 more</button>
        </Notice>
      )}
      {offline && <Notice tone="bad"><b>Can’t reach the web.</b> Showing the bank from {researchedLabel(summary.researchedAt)}. Refresh when you’re back online.</Notice>}
      {!offline && summary.status === 'failed' && (
        <Notice tone="bad"><b>The last research run failed.</b> Your earlier bank is still here. <button type="button" className={link} onClick={onRefresh}>Try again</button></Notice>
      )}
      {summary.inputChanged && <Notice tone="info"><b>The posting changed since this was researched.</b> <button type="button" className={link} onClick={onRefresh}>Refresh</button> to cover what’s new.</Notice>}
      {!summary.inputChanged && summary.status === 'stale' && (
        <Notice tone="info"><b>Researched {age} days ago.</b> <button type="button" className={link} onClick={onRefresh}>Refresh</button> to catch new questions.</Notice>
      )}
    </>
  )
}
