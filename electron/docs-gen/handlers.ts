import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { dialog, shell } from 'electron'

import { jobStoreDir, openStore } from '../ats/store'
import { broadcast, dataRoot, Handler, readSettings, str, userFile } from '../context'
import { jobContext } from '../job-view/handlers'
import { runText } from '../job-view/agent'
import { currentProfile, readCv } from '../resume-agent'
import { readProfileYaml } from '../resume'
import { htmlToPdf, renderCvText } from '../resume-pdf'
import { jobDir, listFor, safeArtifactPath, saveArtifact, sha } from './artifacts'
import { coverHtml } from './coverHtml'
import { tailorResume, writeCover, type Usage } from './generate'
import { changesMarkdown } from './resumeEdits'
import type { Artifact, DocKind, DocsEvent, DocsOptions } from './types'

const busy = new Set<string>()
const emit = (e: DocsEvent) => broadcast('careerloom:docs', e)

/** Skills the job asks for that the résumé lacks: the per-job ATS gaps when that ran, else the keyword check. */
function missingSkills(jobId: string, keywords: Array<{ keyword: string; status: string }>): string[] {
  const ats = openStore(jobStoreDir(userFile('ats'), jobId)).current()?.report
  if (ats?.skillGaps.length) return ats.skillGaps.filter(g => g.bucket === 'gap').map(g => g.skill)
  return keywords.filter(k => k.status === 'missing').map(k => k.keyword)
}

function voiceSample(root: string, given: string | undefined): string | undefined {
  if (given?.trim()) return given.slice(0, 4000)
  for (const f of ['voice-dna.md', join('config', 'voice-dna.md')]) {
    try { const t = readFileSync(join(root, f), 'utf8'); if (t.trim().length > 80) return t.slice(0, 4000) } catch { /* next */ }
  }
  return undefined
}
const asOptions = (v: unknown): DocsOptions => {
  const o = (v ?? {}) as Record<string, unknown>
  return {
    tone: o.tone === 'concise' || o.tone === 'formal' ? o.tone : 'warm',
    length: o.length === 'short' ? 'short' : 'standard',
    humanize: o.humanize !== false,
    voiceSample: typeof o.voiceSample === 'string' ? o.voiceSample : undefined,
  }
}
const sum = (...u: Array<Usage | null>) => u.reduce((n, x) => n + (x?.tokens ?? 0), 0)

async function generate(jobId: string, kind: DocKind, opts: DocsOptions): Promise<void> {
  const root = dataRoot()
  const cv = readCv()?.markdown
  if (!cv) throw new Error('No résumé yet: add one on the Resume page first')
  const { job, report, posting, keywords } = jobContext(jobId)
  const company = report?.company ?? job.company
  const role = report?.role ?? job.title
  const rel = jobDir(job)
  mkdirSync(join(root, rel), { recursive: true })
  const missing = missingSkills(jobId, keywords)
  const main = (label: string) => (p: string) => runText(p, { tier: 'main', label })
  const helper = (label: string) => (p: string) => runText(p, { tier: 'helper', label })
  const base = { id: sha(`${jobId}${kind}${Date.now()}`), jobId, kind, dir: rel, createdAt: Date.now(), inputHash: sha(JSON.stringify([cv, posting?.summary, opts])) }

  if (kind === 'resume') {
    emit({ jobId, kind, phase: 'draft', message: 'Asking the model for tailored edits' })
    const r = await tailorResume({ cv, posting, company, role, plan: report?.personalization ?? [], missing }, main('Tailor résumé'))
    const applied = r.changes.filter(c => c.status === 'applied').length
    if (!applied) throw new Error('None of the suggested edits passed the fact check, so nothing was changed. Try again, or run the job match first.')
    const md = join(rel, 'cv.md'), changes = join(rel, 'changes.md'), pdf = join(rel, 'cv.pdf')
    writeFileSync(join(root, md), r.cv)
    writeFileSync(join(root, changes), changesMarkdown(r.changes, `${company} — ${role}`))
    emit({ jobId, kind, phase: 'pdf', message: 'Laying out the PDF' })
    let pdfRel: string | null = pdf
    try { writeFileSync(join(root, pdf), await renderCvText(r.cv, readProfileYaml(root).template ?? 'standard')) } catch (e) { pdfRel = null; console.error('tailored résumé PDF failed:', e) }
    const rejected = r.changes.length - applied
    const a: Artifact = { ...base, files: { md, pdf: pdfRel, changes }, model: r.usage.model, tokens: r.usage.tokens, humanized: false, humanizeTokens: 0, gate: { ok: true, notes: pdfRel ? [] : ['The PDF could not be laid out; the tailored text is saved.'], applied, rejected } }
    saveArtifact(root, a)
    emit({ jobId, kind, phase: 'done', message: 'Tailored résumé ready', artifact: a })
    return
  }

  const profile = currentProfile()
  const candidate = profile?.name ?? ''
  emit({ jobId, kind, phase: 'draft', message: 'Drafting the letter' })
  const sample = voiceSample(root, opts.voiceSample)
  const r = await writeCover(
    { cv, posting, company, role, candidate, strengths: report?.topStrengths ?? [], missing, voiceSample: sample, tone: opts.tone ?? 'warm', length: opts.length ?? 'standard', allow: [company, role, job.location ?? '', candidate].filter(Boolean) },
    { humanize: opts.humanize !== false, voiceSample: sample },
    main('Write cover letter'), helper('Humanize cover letter'),
  )
  const text = r.paragraphs.join('\n\n')
  const md = join(rel, 'cover.md'), pdf = join(rel, 'cover.pdf')
  writeFileSync(join(root, md), `${text}\n`)
  emit({ jobId, kind, phase: 'pdf', message: 'Laying out the PDF' })
  let pdfRel: string | null = pdf
  try {
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    writeFileSync(join(root, pdf), await htmlToPdf(coverHtml({ name: candidate, contact: [profile?.email ?? '', profile?.phone ?? '', profile?.location ?? ''], date, company, role }, r.paragraphs)))
  } catch (e) { pdfRel = null; console.error('cover letter PDF failed:', e) }
  const a: Artifact = { ...base, files: { md, pdf: pdfRel }, model: r.usage.model, tokens: sum(r.usage), humanized: r.humanized, humanizeTokens: sum(r.humanizeUsage), gate: { ok: true, notes: r.notes, tells: r.tells } }
  saveArtifact(root, a)
  emit({ jobId, kind, phase: 'done', message: 'Cover letter ready', artifact: a })
}

export const docsHandlers: Record<string, Handler> = {
  docsList: jobId => listFor(dataRoot(), str(jobId, 'job id')),
  /** Starts in the background; progress and the result arrive as `docs` events. */
  docsGenerate: (jobId, kind, options) => {
    const id = str(jobId, 'job id')
    if (kind !== 'resume' && kind !== 'cover') throw new Error('Unknown document type')
    if (readSettings().runner === 'api') throw new Error('Documents need an agent runner: switch the runner in Settings')
    const key = `${id}:${kind}`
    if (busy.has(key)) throw new Error('That document is already being generated')
    busy.add(key)
    void generate(id, kind, asOptions(options))
      .catch(err => emit({ jobId: id, kind, phase: 'error', message: err instanceof Error ? err.message : String(err) }))
      .finally(() => busy.delete(key))
    return { started: true }
  },
  docsReadText: rel => readFileSync(safeArtifactPath(dataRoot(), rel), 'utf8'),
  docsReadPdf: rel => new Uint8Array(readFileSync(safeArtifactPath(dataRoot(), rel))),
  docsReveal: rel => { const p = safeArtifactPath(dataRoot(), rel); if (existsSync(p)) shell.showItemInFolder(p); return true },
  /** Save dialog → copies the generated file; resolves to the saved path or null when cancelled. */
  docsSave: async rel => {
    const src = safeArtifactPath(dataRoot(), rel)
    const res = await dialog.showSaveDialog({ defaultPath: basename(src) })
    if (res.canceled || !res.filePath) return null
    mkdirSync(dirname(res.filePath), { recursive: true })
    copyFileSync(src, res.filePath)
    return res.filePath
  },
}
