import { str, type Handler } from '../context'
import { copilotSupported } from './capabilities'
import { readCopilotConfig, writeCopilotConfig } from './config'
import { listLiveModels, testLiveModel } from './live'
import { getOverlayHost } from './overlay-runtime'
import type { Anchor, CopilotApi, DeepPartial, CopilotConfig, NotImplemented, StopReason } from './types'

const METHODS = [
  'copilotReadiness', 'copilotContextPreview', 'copilotProbeAudio', 'copilotOpenSystemSettings', 'copilotStart', 'copilotStop',
  'copilotAnswer', 'copilotScreenshot', 'copilotOverlay', 'copilotAckPrivacyNotice', 'copilotListSessions', 'copilotSessionsForJob',
  'copilotGetSession', 'copilotDeleteSession', 'copilotExportConsents', 'copilotPracticeQuestions', 'copilotListSttModels',
  'copilotBenchmarkStt', 'copilotListLlmModels', 'copilotTestLlmModel', 'copilotCheckHotkey', 'copilotApplyDebrief',
] as const satisfies ReadonlyArray<Exclude<keyof CopilotApi, 'copilotGetConfig' | 'copilotSetConfig'>>

/** Every call is refused off macOS (plan §3.1): no half-working UI elsewhere. */
function guarded(fn: Handler): Handler {
  return (...args) => {
    if (!copilotSupported()) throw new Error('Interview Copilot is available on macOS only')
    return fn(...args)
  }
}

const stub = (method: string): Handler => guarded((): NotImplemented => ({ status: 'not-implemented', method }))

const ANCHORS: readonly Anchor[] = ['tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br']
const bool = (v: unknown, name: string): boolean | undefined => {
  if (v === undefined) return undefined
  if (typeof v !== 'boolean') throw new Error(`${name} must be a boolean`)
  return v
}
/** Overlay command from the renderer: known keys only, typed. `{}` is the overlay's heartbeat. */
function overlayCmd(raw: unknown): Parameters<CopilotApi['copilotOverlay']>[0] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('cmd must be an object')
  const c = raw as Record<string, unknown>
  if (c.moveTo !== undefined && !ANCHORS.includes(c.moveTo as Anchor)) throw new Error('moveTo must be an anchor')
  return { collapse: bool(c.collapse, 'collapse'), hide: bool(c.hide, 'hide'), quickHide: bool(c.quickHide, 'quickHide'), passive: bool(c.passive, 'passive'), moveTo: c.moveTo as Anchor | undefined }
}
const stopReason = (v: unknown): StopReason => {
  if (v !== 'user' && v !== 'panic' && v !== 'error') throw new Error('reason must be user, panic or error')
  return v
}
/** Only `copilotAckPrivacyNotice` may record that the Privacy mode notice was seen. */
function withoutNoticeAck(patch: DeepPartial<CopilotConfig>): DeepPartial<CopilotConfig> {
  const mode = patch.privacy?.mode
  if (!mode || !('noticeVersion' in mode)) return patch
  const { noticeVersion: _dropped, ...rest } = mode
  return { ...patch, privacy: { ...patch.privacy, mode: rest } }
}

/** WP0 stubs. WP1–4 replace entries here with real behaviour; names and shapes are the frozen contract. */
export const copilotHandlers: Record<string, Handler> = {
  ...Object.fromEntries(METHODS.map(m => [m, stub(m)])),
  copilotListLlmModels: guarded(() => listLiveModels()),
  copilotTestLlmModel: guarded((id: unknown) => testLiveModel(str(id, 'model id'))),
  copilotGetConfig: guarded(() => readCopilotConfig()),
  copilotSetConfig: guarded((patch: unknown) => {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw new Error('patch must be an object')
    return writeCopilotConfig(withoutNoticeAck(patch as DeepPartial<CopilotConfig>))
  }),
  // WP1: overlay window, kill switch, Privacy mode notice, hotkey check.
  copilotOverlay: guarded((cmd: unknown) => { getOverlayHost().overlayCommand(overlayCmd(cmd)) }),
  copilotStop: guarded((reason: unknown) => getOverlayHost().stop(stopReason(reason))),
  copilotAckPrivacyNotice: guarded((version: unknown) => getOverlayHost().ackPrivacyNotice(str(version, 'version'))),
  copilotCheckHotkey: guarded((accel: unknown) => getOverlayHost().checkHotkey(str(accel, 'accelerator'))),
}
