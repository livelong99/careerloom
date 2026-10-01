// Media permissions (plan §9). Only the microphone has a queryable status; system-audio capture
// (macOS NSAudioCaptureUsageDescription) prompts on first use and exposes none, so it reports 'unknown'.
// Windows has no per-app screen/system-audio permission and no prompt API: the mic toggle lives in Settings.
import type { PermStatus } from './types'

export type MediaPerms = {
  getMediaAccessStatus(type: 'microphone' | 'screen'): string
  /** macOS only; Electron has no such call on Windows. */
  askForMediaAccess?(type: 'microphone'): Promise<boolean>
}

const STATUSES: readonly PermStatus[] = ['granted', 'denied', 'not-determined', 'restricted', 'unknown']
export const asPermStatus = (s: string): PermStatus => (STATUSES as readonly string[]).includes(s) ? s as PermStatus : 'unknown'

export const micStatus = (p: MediaPerms): PermStatus => asPermStatus(p.getMediaAccessStatus('microphone'))
export const screenStatus = (p: MediaPerms, platform: NodeJS.Platform = process.platform): PermStatus =>
  platform === 'win32' ? 'granted' : asPermStatus(p.getMediaAccessStatus('screen'))
export const systemAudioStatus = (): PermStatus => 'unknown'

/** Prompts only when undetermined; a denied mic can only be fixed in System Settings. */
export async function ensureMic(p: MediaPerms): Promise<PermStatus> {
  if (micStatus(p) === 'not-determined') await p.askForMediaAccess?.('microphone')
  return micStatus(p)
}

const PANES = {
  microphone: 'Privacy_Microphone',
  'system-audio': 'Privacy_AudioCapture', // ponytail: pane id for macOS 14.2+ to be confirmed on a real Mac (spike S1)
  screen: 'Privacy_ScreenCapture',
} as const
const WIN_PANES = { microphone: 'ms-settings:privacy-microphone', 'system-audio': 'ms-settings:sound', screen: 'ms-settings:privacy' } as const
export const settingsUrl = (pane: keyof typeof PANES, platform: NodeJS.Platform = process.platform) =>
  platform === 'win32' ? WIN_PANES[pane] : `x-apple.systempreferences:com.apple.preference.security?${PANES[pane]}`

/** Where a denied microphone is fixed, for error text. */
export const micSettingsPath = (platform: NodeJS.Platform = process.platform) =>
  platform === 'win32' ? 'Settings → Privacy & security → Microphone' : 'System Settings → Privacy & Security → Microphone'

const OWN_PAGE = /^(file:\/\/|http:\/\/(localhost|127\.0\.0\.1):\d+(\/|$))/

/** Allow only microphone (audio-only `media`) requests, and only from the app's own pages (file:// or the dev server, which listens on 127.0.0.1). */
export function isAllowedPermission(permission: string, requestingUrl: string, mediaTypes?: readonly string[]): boolean {
  return permission === 'media' && OWN_PAGE.test(requestingUrl) && !mediaTypes?.includes('video')
}
