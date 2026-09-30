// The job and interview type chosen on Setup, shared by Setup, Practice, the header actions and the consent gate.
import { useSyncExternalStore } from 'react'

import type { InterviewType } from '@/lib/types'

const KEY = 'careerloom.copilot.selection'
export type Selection = { jobId: string | null; interviewType: InterviewType }
const TYPES: readonly InterviewType[] = ['recruiter', 'behavioural', 'technical', 'system-design', 'mixed']

function load(): Selection {
  try {
    const o = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as Partial<Selection>
    return { jobId: typeof o.jobId === 'string' ? o.jobId : null, interviewType: TYPES.includes(o.interviewType as InterviewType) ? (o.interviewType as InterviewType) : 'behavioural' }
  } catch { return { jobId: null, interviewType: 'behavioural' } }
}

let current: Selection = load()
const listeners = new Set<() => void>()

export function setSelection(patch: Partial<Selection>): void {
  current = { ...current, ...patch }
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(current)) } catch { /* storage can be unavailable */ }
  listeners.forEach(l => l())
}
export const getSelection = (): Selection => current
export const useSelection = (): Selection => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, getSelection)

export const GOTO_EVENT = 'careerloom:copilot-goto'
/** Switch the Copilot workspace to another page (links such as "Fix system audio" or "View sessions"). */
export const gotoPage = (id: string): void => { window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: id })) }

// Which practice questions are ticked, plus your own (session-only, not persisted): shared by the Practice page and the header's Start practice.
export type PracticePick = { ids: string[] | null; custom: string[] }
let pick: PracticePick = { ids: null, custom: [] }
const pickListeners = new Set<() => void>()
export const getPracticePick = (): PracticePick => pick
export function setPracticePick(next: PracticePick): void { pick = next; pickListeners.forEach(l => l()) }
export const usePracticePick = (): PracticePick => useSyncExternalStore(cb => { pickListeners.add(cb); return () => { pickListeners.delete(cb) } }, getPracticePick)
