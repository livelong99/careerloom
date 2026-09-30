// Default (Electron + career-ops) bindings for createCopilot's slots: the real overlay host (WP1), engine/context/detector (WP2)
// and session controller + local STT (WP3). Everything is built lazily on first use, so importing this never touches Electron.
import fs from 'node:fs'

import { BrowserWindow, shell, systemPreferences } from 'electron'

import { broadcast, readApiKey, userFile } from '../context'
import { readCv } from '../resume-agent'
import { jobContext } from '../job-view/handlers'
import { ensureMic } from './audio-perms'
import { readCopilotConfig } from './config'
import { createContextBuilder, defaultContextDeps, type GroundingContext } from './context'
import { createCostMeter } from './cost'
import { createDetector } from './detector'
import { e2eHooks } from './e2e-hooks'
import { createAnswerEngine, createLlmClassifier, defaultModelFor, type AnswerEngine } from './engine'
import type { CopilotDeps, createCopilot } from './handlers'
import { createLiveWiring } from './live-wiring'
import { listLiveModels, liveProvider, testLiveModel } from './live'
import { parseAudioMsg } from './audio-in'
import { getOverlayHost } from './overlay-runtime'
import { createScoreCall } from './privacy-calls'
import { PRIVACY_NOTICE_VERSION } from './privacy-mode'
import { collectText } from './providers/openrouter'
import { createSessionController } from './session'
import { createFakeAdapter, parseFixture } from './stt/fake'
import { createSttAdapter, listSttModels } from './stt/engines'
import { installStt } from './stt/install'
import { DEFAULT_MOONSHINE_MODEL, findSttRuntime } from './stt/runtime'
import type { SessionController } from './session'
import type { AudioChunkMsg } from './types'

type CopilotInstance = ReturnType<typeof createCopilot>
const PANE: Record<'microphone' | 'system-audio' | 'screen', string> = { microphone: 'Privacy_Microphone', 'system-audio': 'Privacy_AudioCapture', screen: 'Privacy_ScreenCapture' }
const SESSION_CEILING_USD = 1 // plan §10: stops answering with a visible message instead of silently degrading

const lazy = <T>(make: () => T): (() => T) => { let v: { value: T } | null = null; return () => (v ??= { value: make() }).value }

let audioSink: ((m: AudioChunkMsg) => void) | null = null
/** `careerloom:copilotAudio` handler body: validated chunks reach the running session, everything else is dropped. */
export function copilotAudioIn(raw: unknown): void {
  const m = parseAudioMsg(raw)
  if (m) audioSink?.(m)
}

export function buildDefaults(getInstance: () => CopilotInstance): CopilotDeps {
  const e2e = lazy(e2eHooks)
  const provider = lazy(liveProvider)
  const context = lazy(() => createContextBuilder(defaultContextDeps()))
  const fastModel = (): string => readCopilotConfig().engine.models.fast ?? defaultModelFor('fast')

  let jobId = ''
  let grounding: Promise<GroundingContext> | null = null
  let engine: AnswerEngine | null = null
  let nextId = ''
  let starting = false

  // One engine per session (fresh cost meter, so the ceiling is per session); the wiring holds this proxy.
  const engineProxy: AnswerEngine = {
    answer: req => { if (!engine) throw new Error('No session is running'); return engine.answer(req) },
    cancelAll: () => engine?.cancelAll(),
  }

  const live = lazy(() => {
    const host = getOverlayHost()
    const detector = createDetector({ classify: text => createLlmClassifier(provider(), fastModel())(text) })
    const wiring = createLiveWiring({
      host, recorder: getInstance().recorder, feed: (l, eot) => getInstance().feed(l, eot), engine: engineProxy, detector,
      config: readCopilotConfig, onStopped: () => { if (!starting && getInstance().recorder.active()) void getInstance().stop('user') },
    })
    const ctl: SessionController & { audio(m: AudioChunkMsg): void; retry(): Promise<void> } = createSessionController({
      createAdapter: () => {
        const hooks = e2e()
        return hooks ? createFakeAdapter(parseFixture(fs.readFileSync(hooks.sttFixture, 'utf8'))) : createSttAdapter(readCopilotConfig().stt)
      },
      stt: () => readCopilotConfig().stt, emit: wiring.emit, endOfTurn: wiring.endOfTurn, newId: () => nextId,
    })
    wiring.bindSession(ctl)
    audioSink = m => ctl.audio(m)
    return { host, wiring, ctl }
  })

  const sttReady = (): boolean => {
    if (e2e()) return true
    const stt = readCopilotConfig().stt
    return findSttRuntime(stt.engine)?.models.includes(stt.model ?? DEFAULT_MOONSHINE_MODEL) ?? false
  }

  return {
    dir: () => userFile('copilot'),
    job: id => {
      try { const c = jobContext(id); return { id, title: c.job.title, company: c.job.company, report: c.report, posting: c.posting } } catch { return null }
    },
    cv: () => readCv()?.markdown ?? '',
    permission: kind => { try { return systemPreferences.getMediaAccessStatus(kind) } catch { return 'unknown' } },
    hasKey: () => e2e() !== null || readApiKey() !== null,
    sttInstalled: sttReady,
    // Same provider, redaction and local-only rule as live answers: the transcript never goes to an agent CLI.
    call: createScoreCall({ provider, config: readCopilotConfig, model: fastModel }),
    openSettings: pane => { void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${PANE[pane]}`); return true },

    session: {
      async start(req, sessionId) {
        if (!e2e() && (await ensureMic(systemPreferences)) !== 'granted') throw new Error('Microphone access is off: allow Careerloom in System Settings → Privacy & Security → Microphone')
        const { ctl } = live()
        starting = true
        try {
          jobId = req.jobId; grounding = null; nextId = sessionId
          engine = createAnswerEngine({ provider: provider(), config: readCopilotConfig, grounding: () => (grounding ??= context().build(jobId)), cost: createCostMeter(), ceilingUsd: SESSION_CEILING_USD })
          await ctl.start(req)
        } finally { starting = false }
      },
      stop: reason => live().host.stop(reason),
    },
    retry: () => live().ctl.retry(),
    openDebrief: sessionId => {
      const main = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && !w.webContents.getURL().includes('overlay.html'))
      if (main) { if (main.isMinimized()) main.restore(); main.show(); main.focus() }
      broadcast('careerloom:copilotOpenDebrief', { sessionId })
    },
    answer: (kind, questionId) => { void live().wiring.answer(kind, questionId) },
    context: { preview: id => context().preview(id) },
    complete: async (system, user) => (await collectText(provider(), { system, messages: [{ role: 'user', content: user }], model: fastModel(), maxTokens: 120, signal: AbortSignal.timeout(8000) })).text,

    overlay: cmd => getOverlayHost().overlayCommand(cmd),
    ackNotice: version => getOverlayHost().ackPrivacyNotice(version),
    checkHotkey: accel => getOverlayHost().checkHotkey(accel),
    currentNotice: PRIVACY_NOTICE_VERSION,

    sttModels: () => listSttModels(readCopilotConfig().stt),
    benchmark: () => { throw new Error(sttReady() ? 'The benchmark needs recorded speech fixtures, which this build does not include yet' : 'Install the speech model first, then run the benchmark') },
    installStt: async model => ({ runId: (await installStt(model)).id }),
    listLlmModels: () => listLiveModels(),
    testLlmModel: id => testLiveModel(id),
  }
}
