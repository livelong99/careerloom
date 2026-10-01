import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { broadcast, dataRoot, Handler, readSettings, startAgentPrompt, str, userFile } from '../context'
import type { AtsAnalyzeInput, AtsAnswer } from '../contract'
import { readCv, readProfile, writeCv } from '../resume-agent'
import { renderTemplatePdf } from '../resume-pdf'
import { mergeProfileJson, rebuildProfile } from '../resume-profile'
import { readProfileYaml } from '../resume'
import { answerAnalysis, startAnalysis, type Deps } from './analyze'
import { applyFinding, dismissFinding, history, previewFinding, undoApply } from './applyFlow'
import { netFetcher } from './courses'
import { localSimCall } from './embed'
import { extractPdfPages } from './pdfText'
import { resolveJd } from '../job-view/handlers'
import { jobStoreDir, openStore } from './store'

const PROFILE_JSON = join('data', 'careerloom-profile.json')

/** Everything the lifecycle needs from the app, wired to the real thing. */
/** `jobId` = that job's own analysis (its own store folder, so the résumé-level report is untouched). */
function deps(jobId?: string): Deps {
  return {
    store: openStore(jobId ? jobStoreDir(userFile('ats'), jobId) : userFile('ats')),
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
      startAgentPrompt('ATS analysis', 'ats', prompt, null, { ...(jobId ? { jobId } : {}), resume: o.resume, textOnly: true, neutral: true, onExit: r => o.onExit({ status: r.status, log: r.log, sessionId: r.sessionId ?? null }) })
    },
    get sim() { return localSimCall() },
    fetcher: netFetcher,
    emit: e => broadcast('careerloom:atsEvents', e),
    rebuildProfile(md) {
      const p = rebuildProfile(md, readProfile())
      if (!p) return false
      const file = join(dataRoot(), PROFILE_JSON)
      mkdirSync(join(file, '..'), { recursive: true })
      let raw: unknown = null
      try { raw = JSON.parse(readFileSync(file, 'utf8')) } catch { /* no profile JSON yet */ }
      if (existsSync(file)) copyFileSync(file, `${file}.bak`)
      writeFileSync(file, JSON.stringify(mergeProfileJson(raw, p), null, 2))
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
  atsAnalyze: async input => {
    const o = (input ?? {}) as Record<string, unknown>
    const clean: AtsAnalyzeInput = { jd: typeof o.jd === 'string' ? o.jd.slice(0, 40_000) : undefined, jobId: typeof o.jobId === 'string' ? o.jobId : undefined, templateId: typeof o.templateId === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(o.templateId) ? o.templateId : undefined }
    // A job analysis resolves its own posting (report archive, else fetched once) when none is pasted.
    if (clean.jobId && !clean.jd) {
      clean.jd = ((await resolveJd(clean.jobId)) ?? '').slice(0, 40_000)
      if (!clean.jd) throw new Error('Could not get the posting text for this job. Open it in your browser, or evaluate the job first')
    }
    return startAnalysis(deps(clean.jobId), clean)
  },
  atsGet: jobId => deps(typeof jobId === 'string' ? jobId : undefined).store.current()?.report ?? null,
  atsAnswer: (runId, answers, jobId) => answerAnalysis(deps(typeof jobId === 'string' ? jobId : undefined), str(runId, 'run id'), answersOf(answers)),
  atsPreviewApply: (findingId, answers) => previewFinding(deps(), str(findingId, 'finding id'), answersOf(answers)),
  atsApply: (findingId, answers) => applyFinding(deps(), str(findingId, 'finding id'), answersOf(answers)),
  atsUndo: undoId => undoApply(deps(), str(undoId, 'undo id')),
  atsDismiss: findingId => dismissFinding(deps(), str(findingId, 'finding id')),
  atsHistory: () => history(deps()),
}
