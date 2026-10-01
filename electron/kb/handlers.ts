// Job knowledge base + interviewer IPC (plan §4). Store methods live in api.ts, research in research/, voices in tts/runtime.ts.
// Voice and interviewer calls are macOS-only (the Copilot is); the KB itself works everywhere (plan §13).
import { shell } from 'electron'

import { broadcast, str, userFile, type Handler } from '../context'
import { copilotSupported } from '../copilot/capabilities'
import type { DeepPartial } from '../copilot/types'
import { interviewPlanPreview } from '../interviewer/handlers'
import { setInterviewPool } from '../interviewer/pool'
import { testKey } from '../settings/keys-test'
import { createKbApi } from './api'
import { readInterviewConfig, writeInterviewConfig } from './config'
import { selectionPool } from './retrieve'
import { researchService } from './research/wiring'
import { getKbStore } from './runtime'
import type { InterviewConfig, KbApi, ResearchOptions } from './types'
import { KOKORO_DOWNLOAD_MB, findKokoro, installSupported, kokoroInstallRunning } from '../tts/install'
import { voiceHandlers } from './voice'

const api = createKbApi({
  store: getKbStore,
  research: researchService,
  refreshAfterDays: () => readInterviewConfig().research.refreshAfterDays,
  exportDir: () => userFile('exports'),
  changed: jobId => broadcast('careerloom:kbChanged', { jobId }),
})
// The interviewer draws its questions from the job's KB (hidden items never), and writes its stats back onto the items.
setInterviewPool(jobId => {
  const store = getKbStore() // binds retrieval to the store
  const items = selectionPool(jobId)
  return items.length ? { items, skills: store.read(jobId).skills } : null
})
const macOnly = <A extends unknown[], R>(f: (...a: A) => R) => async (...a: A): Promise<R> => {
  if (!copilotSupported()) throw new Error('The AI interviewer is available on macOS only')
  return f(...a)
}
const wrap = (f: (...a: never[]) => unknown): Handler => async (...a: unknown[]) => (f as (...x: unknown[]) => unknown)(...a)

export const kbHandlers: Record<keyof KbApi, Handler> = {
  // contract v1.1: interview.json (validated and clamped; holds no secrets)
  interviewConfig: async () => readInterviewConfig(),
  interviewSetConfig: async (patch: unknown) => writeInterviewConfig(patch as DeepPartial<InterviewConfig>),
  kbSummary: wrap(api.kbSummary), kbList: wrap(api.kbList), kbItem: wrap(api.kbItem),
  kbItemUpdate: wrap(api.kbItemUpdate), kbItemAdd: wrap(api.kbItemAdd), kbItemRemove: wrap(api.kbItemRemove),
  kbExport: wrap(api.kbExport), kbImport: wrap(api.kbImport),
  kbEstimate: async (jobId, opts) => researchService().estimate(str(jobId, 'job id'), opts as ResearchOptions),
  kbResearchStart: async (jobId, opts) => researchService().start(str(jobId, 'job id'), opts as ResearchOptions),
  kbResearchStop: async runId => { researchService().stop(str(runId, 'run id')) },
  kbSearchKeyTest: async () => {
    const backend = readInterviewConfig().research.search.backend
    if (backend === 'searxng') return { ok: readInterviewConfig().research.search.searxngUrl !== null, backend }
    try { const r = await testKey(backend); return { ok: r.ok, backend, message: r.detail } } catch (e) { return { ok: false, backend, message: e instanceof Error ? e.message : String(e) } }
  },
  kbOpenSource: async sourceId => {
    const url = getKbStore().findSource(str(sourceId, 'source id'))?.url
    if (!url || !/^https?:\/\//i.test(url)) return false
    await shell.openExternal(url)
    return true
  },
  interviewPlanPreview,
  interviewKokoroStatus: async () => ({ supported: installSupported(), installed: findKokoro() !== null, installing: kokoroInstallRunning(), downloadMb: KOKORO_DOWNLOAD_MB.packages + KOKORO_DOWNLOAD_MB.models }),
  interviewVoices: macOnly(() => voiceHandlers().interviewVoices()),
  interviewPreviewVoice: macOnly((...a: Parameters<KbApi['interviewPreviewVoice']>) => voiceHandlers().interviewPreviewVoice(...a)),
  interviewInstallVoice: macOnly((...a: Parameters<KbApi['interviewInstallVoice']>) => voiceHandlers().interviewInstallVoice(...a)),
} as Record<keyof KbApi, Handler>
