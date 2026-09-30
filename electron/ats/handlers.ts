import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { broadcast, dataRoot, Handler, readSettings, startAgentPrompt, str, userFile } from '../context'
import type { AtsAnalyzeInput, AtsAnswer } from '../contract'
import { readCv, readProfile, writeCv } from '../resume-agent'
import { renderTemplatePdf } from '../resume-pdf'
import { rebuildProfile } from '../resume-profile'
import { readProfileYaml } from '../resume'
import { answerAnalysis, startAnalysis, type Deps } from './analyze'
import { applyFinding, dismissFinding, previewFinding, undoApply } from './applyFlow'
import { netFetcher } from './courses'
import { localSimCall } from './embed'
import { extractPdfPages } from './pdfText'
import { openStore } from './store'

const PROFILE_JSON = join('data', 'careerloom-profile.json')
const ID = /^[0-9a-f-]{36}$/
const fileFor = (id: string) => { if (!ID.test(id)) throw new Error('Invalid analysis id'); return join(dataRoot(), 'data', `careerloom-ats-${id}.json`) }

/** Everything the lifecycle needs from the app, wired to the real thing. */
function deps(): Deps {
  return {
    store: openStore(userFile('ats')),
    now: Date.now,
    newId: randomUUID,
    readCv: () => readCv()?.markdown ?? null,
    writeCv: md => void writeCv(md),
    async render(templateId) {
      const pdf = await renderTemplatePdf(templateId)
      const html = userFile(join('cv-pdf-cache', `${templateId}.html`))
      return { pdf, html: existsSync(html) ? readFileSync(html, 'utf8') : null }
    },
    pages: extractPdfPages,
    runner: () => readSettings().runner,
    startAgent(prompt, o) {
      startAgentPrompt('ATS analysis', 'ats', prompt, null, { resume: o.resume, onExit: r => o.onExit({ status: r.status, log: r.log, sessionId: r.sessionId ?? null }) })
    },
    agentFile: {
      path: fileFor,
      read: id => { try { return readFileSync(fileFor(id), 'utf8') } catch { return null } },
      remove: id => rmSync(fileFor(id), { force: true }),
    },
    get sim() { return localSimCall() },
    fetcher: netFetcher,
    emit: e => broadcast('careerloom:atsEvents', e),
    rebuildProfile(md) {
      const p = rebuildProfile(md, readProfile())
      if (!p) return false
      const file = join(dataRoot(), PROFILE_JSON)
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, JSON.stringify(p, null, 2))
      return true
    },
    defaultTemplate: () => readProfileYaml(dataRoot()).template ?? 'standard',
  }
}

const answersOf = (v: unknown): AtsAnswer[] => (Array.isArray(v) ? v.flatMap((x): AtsAnswer[] => {
  const o = (x ?? {}) as Record<string, unknown>
  return typeof o.id === 'string' && (typeof o.value === 'string' || typeof o.value === 'number') ? [{ id: o.id, value: o.value }] : []
}) : [])

export const atsHandlers: Record<string, Handler> = {
  atsAnalyze: input => {
    const o = (input ?? {}) as Record<string, unknown>
    const clean: AtsAnalyzeInput = { jd: typeof o.jd === 'string' ? o.jd.slice(0, 40_000) : undefined, jobId: typeof o.jobId === 'string' ? o.jobId : undefined, templateId: typeof o.templateId === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(o.templateId) ? o.templateId : undefined }
    return startAnalysis(deps(), clean)
  },
  atsGet: () => deps().store.current()?.report ?? null,
  atsAnswer: (runId, answers) => answerAnalysis(deps(), str(runId, 'run id'), answersOf(answers)),
  atsPreviewApply: (findingId, answers) => previewFinding(deps(), str(findingId, 'finding id'), answersOf(answers)),
  atsApply: (findingId, answers) => applyFinding(deps(), str(findingId, 'finding id'), answersOf(answers)),
  atsUndo: undoId => undoApply(deps(), str(undoId, 'undo id')),
  atsDismiss: findingId => dismissFinding(deps(), str(findingId, 'finding id')),
}
