// Job knowledge base + interviewer IPC (plan §4). WP0 stubs: every call resolves `{ status: 'not-implemented' }`;
// WP1 (store/index), WP2 (research), WP4 (interviewer) and WP5 (voices) replace the bodies. Voice and interviewer calls are
// macOS-only (the Copilot is); the KB itself works everywhere (plan §13).
import { str, type Handler } from '../context'
import { copilotSupported } from '../copilot/capabilities'
import type { KbApi, KbNotImplemented, ResearchOptions } from './types'

const stub = (method: string): KbNotImplemented => ({ status: 'not-implemented', method })
const KB_METHODS = ['kbSummary', 'kbList', 'kbItem', 'kbItemUpdate', 'kbItemAdd', 'kbItemRemove', 'kbExport', 'kbImport', 'kbSearchKeyTest', 'kbOpenSource'] as const
const MAC_METHODS = ['interviewVoices', 'interviewPreviewVoice', 'interviewInstallVoice', 'interviewPlanPreview'] as const

// Research (WP2): loaded on first use so the main bundle does not pull the whole pipeline at startup.
const research = async () => (await import('./research/wiring.js')).researchService()

export const kbHandlers: Record<keyof KbApi, Handler> = {
  ...Object.fromEntries(KB_METHODS.map(m => [m, async () => stub(m)])),
  kbEstimate: async (jobId, opts) => { const id = str(jobId, 'job id'); return (await research()).estimate(id, opts as ResearchOptions) },
  kbResearchStart: async (jobId, opts) => { const id = str(jobId, 'job id'); return (await research()).start(id, opts as ResearchOptions) },
  kbResearchStop: async runId => { const id = str(runId, 'run id'); (await research()).stop(id) },
  ...Object.fromEntries(MAC_METHODS.map(m => [m, async () => {
    if (!copilotSupported()) throw new Error('The AI interviewer is available on macOS only')
    return stub(m)
  }])),
} as Record<keyof KbApi, Handler>
