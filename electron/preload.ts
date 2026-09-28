import { contextBridge, ipcRenderer } from 'electron'

// `import type` is erased at build, so this shares main.ts's declaration
// without pulling its runtime into the sandboxed preload.
import type { Envelope } from './main'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(`careerloom:${channel}`, ...args)) as Envelope<T>
  if (res.ok) return res.value
  // Reject with a plain object so `kind` survives the world boundary.
  return Promise.reject(res.error)
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T) => cb(payload)
  ipcRenderer.on(`careerloom:${channel}`, listener)
  return () => { ipcRenderer.removeListener(`careerloom:${channel}`, listener) }
}

// Shape matches CareerloomBridge (renderer/lib/types.ts), where it is typed.
const bridge = {
  getSettings: () => invoke('getSettings'),
  setRoot: (root: string) => invoke('setRoot', root),
  setRunner: (runner: string) => invoke('setRunner', runner),
  setApiKey: (key: string | null, provider?: 'openrouter' | 'opencode') => invoke('setApiKey', key, provider),
  setModel: (runner: string, model: string | null) => invoke('setModel', runner, model),
  listModels: (runner: string) => invoke('listModels', runner),
  chooseDirectory: () => invoke('chooseDirectory'),
  runnerStatus: () => invoke('runnerStatus'),
  modes: () => invoke('modes'),
  profileStatus: () => invoke('profileStatus'),
  getTracker: () => invoke('getTracker'),
  getPipeline: () => invoke('getPipeline'),
  listReports: () => invoke('listReports'),
  readReport: (rel: string) => invoke('readReport', rel),
  listRuns: () => invoke('listRuns'),
  getRunLog: (id: string) => invoke('getRunLog', id),
  startRun: (req: { mode: string; input?: string }) => invoke('startRun', req),
  evaluateJob: (input: string) => invoke('evaluateJob', input),
  cancelRun: (id: string) => invoke('cancelRun', id),
  setupCareerOps: (parent: string) => invoke('setupCareerOps', parent),
  prerequisites: () => invoke('prerequisites'),
  installCareerOpsDefault: () => invoke('installCareerOpsDefault'),
  onRun: (cb: (event: unknown) => void) => subscribe('run', cb),
  onSettings: (cb: () => void) => subscribe('settings', cb),
  getReadiness: (force?: boolean) => invoke('getReadiness', force),
  onReadiness: (cb: (event: unknown) => void) => subscribe('readiness', cb),
  // Resume
  resumeOverview: () => invoke('resumeOverview'),
  importResume: () => invoke('importResume'),
  parseResume: () => invoke('parseResume'),
  scoreAts: (opts?: { keywords?: string; role?: string }) => invoke('scoreAts', opts),
  rankAgainstJob: (job: string) => invoke('rankAgainstJob', job),
  setTemplate: (name: string) => invoke('setTemplate', name),
  importTemplate: () => invoke('importTemplate'),
  createTemplate: (description: string) => invoke('createTemplate', description),
  previewTemplate: (name: string) => invoke('previewTemplate', name),
  exportResume: (format: string) => invoke('exportResume', format),
  revealExport: (file: string) => invoke('revealExport', file),
  readCv: () => invoke('readCv'),
  writeCv: (markdown: string) => invoke('writeCv', markdown),
  extractResume: (file: string) => invoke('extractResume', file),
  readProfile: () => invoke('readProfile'),
  researchProfile: () => invoke('researchProfile'),
  readResearch: () => invoke('readResearch'),
  renderTemplatePdf: (name: string) => invoke('renderTemplatePdf', name),
  savePdf: (name: string) => invoke('savePdf', name),
  // Jobs
  listJobs: () => invoke('listJobs'),
  listPortals: () => invoke('listPortals'),
  scanPortals: (ids: string[]) => invoke('scanPortals', ids),
  countUnevaluated: (ids: string[]) => invoke('countUnevaluated', ids),
  deletePortals: (ids: string[], hideUnevaluated: boolean) => invoke('deletePortals', ids, hideUnevaluated),
  addDefaultPortals: () => invoke('addDefaultPortals'),
  getPortal: (id: string) => invoke('getPortal', id),
  updatePortal: (id: string, patch: Record<string, unknown>) => invoke('updatePortal', id, patch),
  setPortalsEnabled: (ids: string[], enabled: boolean) => invoke('setPortalsEnabled', ids, enabled),
  listScans: () => invoke('listScans'),
  checkBoardUrl: (url: string) => invoke('checkBoardUrl', url),
  browserLoginStatus: () => invoke('browserLoginStatus'),
  prescreenStatus: () => invoke('prescreenStatus'),
  prescreenJobs: (ids?: string[]) => invoke('prescreenJobs', ids),
  readPrescreen: () => invoke('readPrescreen'),
  savePrescreenPolicy: (policy: unknown) => invoke('savePrescreenPolicy', policy),
  prescreenFeedback: (id: string, relevant: boolean | null) => invoke('prescreenFeedback', id, relevant),
  retrainPrescreen: () => invoke('retrainPrescreen'),
  localModelStatus: () => invoke('localModelStatus'),
  installLocalModel: () => invoke('installLocalModel'),
  evaluateJobs: (ids: string[], force?: boolean) => invoke('evaluateJobs', ids, force),
  setPortalGuideline: (id: string, text: string) => invoke('setPortalGuideline', id, text),
  improvePortalGuideline: (id: string, draft: string) => invoke('improvePortalGuideline', id, draft),
  // Agent chat
  listThreads: () => invoke('listThreads'),
  getThread: (id: string) => invoke('getThread', id),
  sendMessage: (threadId: string | null, text: string) => invoke('sendMessage', threadId, text),
  deleteThread: (id: string) => invoke('deleteThread', id),
  continueRun: (runId: string) => invoke('continueRun', runId),
  // Monitoring
  getMetrics: (range?: { from: string; to: string } | null) => invoke('getMetrics', range),
  // Integrations
  listIntegrations: () => invoke('listIntegrations'),
  getIntegration: (id: string) => invoke('getIntegration', id),
  previewInstall: (url: string) => invoke('previewInstall', url),
  installIntegration: (url: string) => invoke('installIntegration', url),
  integrationAction: (id: string, action: string) => invoke('integrationAction', id, action),
  setIntegrationConfig: (id: string, patch: Record<string, unknown>) => invoke('setIntegrationConfig', id, patch),
  previewWebBoard: (urls: string[]) => invoke('previewWebBoard', urls),
  addWebBoard: (name: string, urls: string[], instructions: string, fetch?: 'firecrawl' | 'browser') => invoke('addWebBoard', name, urls, instructions, fetch),
  browserConsentNeeded: (ids: string[]) => invoke('browserConsentNeeded', ids),
  acknowledgeBrowser: (domains: string[]) => invoke('acknowledgeBrowser', domains),
  // Pipeline
  setStatus: (nums: number[], status: string) => invoke('setStatus', nums, status),
  getUpdateStatus: () => invoke('getUpdateStatus'),
  onUpdateStatus: (cb: (status: unknown) => void) => subscribe('update', cb),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  platform: process.platform,
  arch: process.arch,
}

contextBridge.exposeInMainWorld('careerloom', bridge)
