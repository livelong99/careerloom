// Job knowledge base + interviewer IPC (plan §4). WP0 stubs: every call resolves `{ status: 'not-implemented' }`;
// WP1 (store/index), WP2 (research), WP4 (interviewer) and WP5 (voices) replace the bodies. Voice and interviewer calls are
// macOS-only (the Copilot is); the KB itself works everywhere (plan §13).
import type { Handler } from '../context'
import { copilotSupported } from '../copilot/capabilities'
import type { KbApi, KbNotImplemented } from './types'

const stub = (method: string): KbNotImplemented => ({ status: 'not-implemented', method })
const KB_METHODS = ['kbSummary', 'kbList', 'kbItem', 'kbEstimate', 'kbResearchStart', 'kbResearchStop', 'kbItemUpdate', 'kbItemAdd', 'kbItemRemove', 'kbExport', 'kbImport', 'kbSearchKeyTest', 'kbOpenSource'] as const
const MAC_METHODS = ['interviewVoices', 'interviewPreviewVoice', 'interviewInstallVoice', 'interviewPlanPreview'] as const

export const kbHandlers: Record<keyof KbApi, Handler> = {
  ...Object.fromEntries(KB_METHODS.map(m => [m, async () => stub(m)])),
  ...Object.fromEntries(MAC_METHODS.map(m => [m, async () => {
    if (!copilotSupported()) throw new Error('The AI interviewer is available on macOS only')
    return stub(m)
  }])),
} as Record<keyof KbApi, Handler>
