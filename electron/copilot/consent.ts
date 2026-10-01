// Pure (no electron import) so the renderer's consent gate and main's server-side check share one version constant.
import type { ConsentRecord, SourceId } from './types'

/** Bump when the consent copy changes: older records (and stale renderers) are then refused. TODO-legal: copy reviewed at gate G-D. */
export const CONSENT_TEXT_VERSION = '2026-10-01.draft2'
export const CONSENT_MAX_AGE_MS = 10 * 60_000
const SOURCES: readonly SourceId[] = ['mic', 'system']
const INDICATORS = ['chip', 'dot', 'off']
const SKEW_MS = 5_000

export type ConsentCheck = { ok: true } | { ok: false; reason: string }
const no = (reason: string): ConsentCheck => ({ ok: false, reason })

/** Server-side gate for `copilotStart(live)`: the renderer cannot skip or fake it. */
export function validateConsent(raw: unknown, now: number = Date.now()): ConsentCheck {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return no('Live sessions need your confirmation first')
  const c = raw as Partial<Record<keyof ConsentRecord, unknown>>
  if (c.aiAllowedConfirmed !== true || c.everyoneInformedConfirmed !== true) return no('Confirm both statements before starting a live session')
  if (c.textVersion !== CONSENT_TEXT_VERSION) return no('The consent text changed: review it and confirm again')
  if (typeof c.at !== 'number' || !Number.isFinite(c.at) || c.at > now + SKEW_MS || now - c.at > CONSENT_MAX_AGE_MS) return no('Your confirmation expired: confirm again')
  if (!Array.isArray(c.sources) || !c.sources.every(s => SOURCES.includes(s as SourceId)) || !c.sources.includes('mic')) return no('A live session needs the microphone')
  if (typeof c.indicator !== 'string' || !INDICATORS.includes(c.indicator)) return no('Unknown recording indicator')
  return { ok: true }
}
