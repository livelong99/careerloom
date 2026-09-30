// macOS media permissions (plan §9). Only the microphone has a queryable status; system-audio capture
// (NSAudioCaptureUsageDescription) prompts on first use and exposes none, so it reports 'unknown'.
import type { PermStatus } from './types'

export type MediaPerms = {
  getMediaAccessStatus(type: 'microphone' | 'screen'): string
  askForMediaAccess(type: 'microphone'): Promise<boolean>
}

const STATUSES: readonly PermStatus[] = ['granted', 'denied', 'not-determined', 'restricted', 'unknown']
export const asPermStatus = (s: string): PermStatus => (STATUSES as readonly string[]).includes(s) ? s as PermStatus : 'unknown'

export const micStatus = (p: MediaPerms): PermStatus => asPermStatus(p.getMediaAccessStatus('microphone'))
export const screenStatus = (p: MediaPerms): PermStatus => asPermStatus(p.getMediaAccessStatus('screen'))
export const systemAudioStatus = (): PermStatus => 'unknown'

/** Prompts only when undetermined; a denied mic can only be fixed in System Settings. */
export async function ensureMic(p: MediaPerms): Promise<PermStatus> {
  if (micStatus(p) === 'not-determined') await p.askForMediaAccess('microphone')
  return micStatus(p)
}

const PANES = {
  microphone: 'Privacy_Microphone',
  'system-audio': 'Privacy_AudioCapture', // ponytail: pane id for macOS 14.2+ to be confirmed on a real Mac (spike S1)
  screen: 'Privacy_ScreenCapture',
} as const
export const settingsUrl = (pane: keyof typeof PANES) => `x-apple.systempreferences:com.apple.preference.security?${PANES[pane]}`

/** Allow only `media` requests, and only from the app's own pages (file:// or the dev server). */
export function isAllowedPermission(permission: string, requestingUrl: string): boolean {
  return permission === 'media' && /^(file:\/\/|http:\/\/localhost:\d+\/)/.test(requestingUrl)
}
