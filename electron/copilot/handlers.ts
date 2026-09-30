import { str, type Handler } from '../context'
import { copilotSupported } from './capabilities'
import { readCopilotConfig, writeCopilotConfig } from './config'
import { listLiveModels, testLiveModel } from './live'
import type { CopilotApi, DeepPartial, CopilotConfig, NotImplemented } from './types'

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

/** WP0 stubs. WP1–4 replace entries here with real behaviour; names and shapes are the frozen contract. */
export const copilotHandlers: Record<string, Handler> = {
  ...Object.fromEntries(METHODS.map(m => [m, stub(m)])),
  copilotListLlmModels: guarded(() => listLiveModels()),
  copilotTestLlmModel: guarded((id: unknown) => testLiveModel(str(id, 'model id'))),
  copilotGetConfig: guarded(() => readCopilotConfig()),
  copilotSetConfig: guarded((patch: unknown) => {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw new Error('patch must be an object')
    return writeCopilotConfig(patch as DeepPartial<CopilotConfig>)
  }),
}
