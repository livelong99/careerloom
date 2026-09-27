import { dialog, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { parseDocument } from 'yaml'

import { broadcast, careerOpsRoot, dataRoot, Handler, inside, runs, runScript, startAgent, startAgentPrompt, str, summary, userFile, type RunRecord, type RunSummary } from './context'
import type { AtsResult, CvTemplate, ExportFormat, ResumeExport, ResumeOverview, ResumeSource } from './contract'
import { extractResume, readCv, readProfile, readResearch, researchProfile, writeCv } from './resume-agent'
import { renderTemplatePdf, savePdf } from './resume-pdf'
import { parseCvMarkdown } from './resume-profile'

export * from './resume-profile'

// Resume: cv.md + documents intake, ATS scoring, CV templates, exports.
// Contract: renderer/lib/types.ts (CareerloomBridge › Resume). Owned by the Resume builder.

// ————— Pure helpers (no fs/electron access — covered directly by resume.test.ts) —————

const DOC_FOLDERS = ['cv', 'linkedin', 'diplomas', 'references']
const EXPORT_EXT: Record<string, ExportFormat> = { '.pdf': 'pdf', '.html': 'html', '.tex': 'tex', '.docx': 'docx', '.md': 'md' }
export const REQUIRED_CV_PLACEHOLDERS = ['NAME', 'EXPERIENCE', 'EDUCATION']
export const BUILTIN_CV_TEMPLATES = new Set(['standard', 'compact', 'executive', 'jake', 'leadership', 'modern', 'zh-minimal', 'ats'])

/** kebab-case a user-supplied template name; throws on nothing usable. */
export function slugTemplateName(input: string): string {
  const slug = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (!slug) throw new Error('Template name must contain at least one letter or number')
  return slug
}

export function prettifyTemplateName(name: string): string {
  return name.split('-').filter(Boolean).map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ')
}

/** `{{PLACEHOLDER}}` tokens `required` but missing from `html`. */
export function missingPlaceholders(html: string, required: string[]): string[] {
  return required.filter(ph => !html.includes(`{{${ph}}}`))
}

/** Sets `cv.template` in a profile.yml document, preserving every other key and comment. */
export function setProfileTemplate(yamlText: string, name: string): string {
  const doc = parseDocument(yamlText)
  doc.setIn(['cv', 'template'], name)
  return String(doc)
}

/** Filesystem-safe basename for an imported document (keeps the extension). */
export function sanitizeDocName(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '') || 'document'
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ponytail: a minimal, deterministic HTML rendering of cv.md for ATS structural
// scoring only — not the real exported CV (that needs the tailoring agent step
// build-cv-html.mjs itself documents). Upgrade path: route scoreAts through an
// agent run that scores the actual templated export if that gap matters.
export function buildAtsCheckHtml(md: string, profile: { name?: string; email?: string; phone?: string }): string {
  const { sections } = parseCvMarkdown(md)
  const body = sections
    .map(s => `<div class="section"><div class="section-title">${esc(s.title)}</div><p>${esc(s.text).replace(/\n+/g, '<br>')}</p></div>`)
    .join('\n')
  const contact = [profile.email, profile.phone].filter(Boolean).join(' | ')
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(profile.name ?? 'CV')}</title></head>`
    + `<body><h1>${esc(profile.name ?? '')}</h1><p>${esc(contact)}</p>${body}</body></html>`
}

// ————— fs/electron-backed handlers —————

const DOC_EXTENSIONS = new Set(['pdf', 'md', 'txt', 'docx', 'rtf', 'tex'])

function listDocumentSources(root: string): ResumeSource[] {
  const docsDir = join(root, 'documents')
  const out: ResumeSource[] = []
  const scan = (dir: string, rel: string) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || name.toLowerCase() === 'readme.md') continue
      const kind = extname(name).slice(1).toLowerCase()
      if (!DOC_EXTENSIONS.has(kind)) continue
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isFile()) out.push({ file: join(rel, name), kind, size: st.size, updatedAt: st.mtimeMs })
    }
  }
  scan(docsDir, 'documents')
  for (const folder of DOC_FOLDERS) scan(join(docsDir, folder), join('documents', folder))
  return out
}

function listExports(root: string): ResumeExport[] {
  const dir = join(root, 'output')
  if (!existsSync(dir)) return []
  const out: ResumeExport[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const format = EXPORT_EXT[extname(name).toLowerCase()]
    const full = join(dir, name)
    if (!format || !statSync(full).isFile()) continue
    out.push({ file: join('output', name), format, updatedAt: statSync(full).mtimeMs })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

function readProfileYaml(root: string): { name?: string; email?: string; phone?: string; template: string | null } {
  const p = join(root, 'config', 'profile.yml')
  if (!existsSync(p)) return { template: null }
  try {
    const doc = parseDocument(readFileSync(p, 'utf8'))
    const pick = (k: string) => { const v = doc.getIn(['candidate', k]) ?? doc.get(k); return typeof v === 'string' ? v : undefined }
    const template = doc.getIn(['cv', 'template'])
    return { name: pick('full_name') ?? pick('name'), email: pick('email'), phone: pick('phone'), template: typeof template === 'string' && template.trim() ? template.trim() : null }
  } catch {
    return { template: null }
  }
}

async function listCvTemplates(): Promise<CvTemplate[]> {
  const res = await runScript(['cv-templates.mjs', 'list', 'cv', '--format=html'])
  if (res.code !== 0) throw new Error(res.stderr.trim() || 'Could not list CV templates')
  const items = JSON.parse(res.stdout) as Array<{ name: string; displayName: string }>
  return items.map(i => ({
    name: i.name,
    displayName: i.displayName,
    file: i.name === 'standard' ? 'templates/cv-template.html' : `templates/cv-template.${i.name}.html`,
    builtin: BUILTIN_CV_TEMPLATES.has(i.name),
  }))
}

function readCachedAts(): AtsResult | null {
  try { return JSON.parse(readFileSync(userFile('ats-last.json'), 'utf8')) as AtsResult } catch { return null }
}

/** A synthetic, already-finished Run for work done inline (no agent, no subprocess). */
function finishedRun(mode: string, label: string, input: string | null): RunSummary {
  const now = Date.now()
  const run: RunRecord = { id: randomUUID(), runner: 'script', mode, label, input, startedAt: now, endedAt: now, status: 'done', usage: null, log: '' }
  runs.set(run.id, run)
  broadcast('careerloom:run', { id: run.id, kind: 'exit', status: run.status })
  return summary(run)
}

function firstLine(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.split('\n')[0]?.trim() || 'Unknown error'
}

/** Run `fn`, logging and falling back to `fallback` on failure. resumeOverview
 *  degrades field-by-field (e.g. a career-ops checkout missing `npm install`
 *  breaks cv-templates.mjs) instead of one broken part blanking the whole screen. */
async function safely<T>(label: string, fallback: T, fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.error(`resumeOverview: ${label} failed:`, firstLine(err))
    return fallback
  }
}

async function resumeOverview(): Promise<ResumeOverview> {
  const root = dataRoot()
  const cv = await safely('reading cv.md', null as ResumeOverview['cv'], () => {
    const cvPath = join(root, 'cv.md')
    return existsSync(cvPath) ? { updatedAt: statSync(cvPath).mtimeMs, ...parseCvMarkdown(readFileSync(cvPath, 'utf8')) } : null
  })
  return {
    cv,
    sources: await safely('listing documents', [], () => listDocumentSources(root)),
    templates: await safely('listing templates', [], () => listCvTemplates()),
    activeTemplate: readProfileYaml(root).template,
    lastAts: readCachedAts(),
    exports: await safely('listing exports', [], () => listExports(root)),
  }
}

async function importResume(): Promise<ResumeSource | null> {
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Resume', extensions: ['pdf', 'docx', 'rtf', 'md', 'txt', 'tex'] }] })
  if (res.canceled || !res.filePaths[0]) return null
  const safeName = sanitizeDocName(basename(res.filePaths[0]))
  const destDir = join(dataRoot(), 'documents', 'cv')
  mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, safeName)
  copyFileSync(res.filePaths[0], dest)
  const st = statSync(dest)
  return { file: join('documents', 'cv', safeName), kind: extname(safeName).slice(1) || 'file', size: st.size, updatedAt: st.mtimeMs }
}

function parseResume(): RunSummary {
  return startAgent('intake')
}

async function scoreAts(opts?: unknown): Promise<AtsResult> {
  const { keywords, role } = (opts ?? {}) as { keywords?: string; role?: string }
  const root = dataRoot()
  const cvPath = join(root, 'cv.md')
  if (!existsSync(cvPath)) throw new Error('No cv.md yet — import and parse your resume first')
  const outDir = join(root, 'output')
  mkdirSync(outDir, { recursive: true })
  const tmp = join(outDir, '.ats-check.html')
  writeFileSync(tmp, buildAtsCheckHtml(readFileSync(cvPath, 'utf8'), readProfileYaml(root)))
  const args = ['verify-ats.mjs', tmp, '--json']
  if (keywords) args.push('--keywords', keywords)
  if (role) args.push('--role', role)
  const res = await runScript(args)
  rmSync(tmp, { force: true })
  if (!res.stdout.trim()) throw new Error(res.stderr.trim() || 'ATS check failed')
  const parsed = JSON.parse(res.stdout) as Omit<AtsResult, 'file' | 'checkedAt'>
  const result: AtsResult = { ...parsed, file: 'cv.md', checkedAt: Date.now() }
  writeFileSync(userFile('ats-last.json'), JSON.stringify(result))
  return result
}

function rankAgainstJob(jobUrlOrText: unknown): RunSummary {
  return startAgent('ats', str(jobUrlOrText, 'jobUrlOrText'))
}

async function setTemplate(name: unknown): Promise<boolean> {
  const slug = slugTemplateName(str(name, 'name'))
  const check = await runScript(['cv-templates.mjs', 'resolve', 'cv', slug, '--format=html'])
  if (check.code !== 0) throw new Error(check.stderr.trim() || `Template "${slug}" not found`)
  const p = join(dataRoot(), 'config', 'profile.yml')
  writeFileSync(p, setProfileTemplate(existsSync(p) ? readFileSync(p, 'utf8') : '', slug))
  return true
}

async function importTemplate(): Promise<CvTemplate | null> {
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'HTML template', extensions: ['html'] }] })
  if (res.canceled || !res.filePaths[0]) return null
  const html = readFileSync(res.filePaths[0], 'utf8')
  const missing = missingPlaceholders(html, REQUIRED_CV_PLACEHOLDERS)
  if (missing.length) throw new Error(`Template is missing required placeholders: ${missing.map(m => `{{${m}}}`).join(', ')}`)
  const slug = slugTemplateName(basename(res.filePaths[0], extname(res.filePaths[0])))
  if (BUILTIN_CV_TEMPLATES.has(slug)) throw new Error(`"${slug}" is a built-in template name — rename the file first`)
  const file = `templates/cv-template.${slug}.html`
  writeFileSync(join(careerOpsRoot(), file), html)
  return { name: slug, displayName: prettifyTemplateName(slug), file, builtin: false }
}

function createTemplate(description: unknown): RunSummary {
  const desc = str(description, 'description').trim()
  if (!desc) throw new Error('Describe the template you want')
  if (desc.length > 2000) throw new Error('Description is too long')
  const prompt = '/career-ops create a new CV HTML template file at templates/cv-template.<slug>.html, where '
    + '<slug> is a short kebab-case name you choose from the description below (not "standard" or any other '
    + 'existing template name). Keep the required {{NAME}}, {{EXPERIENCE}}, {{EDUCATION}} placeholders '
    + `cv-templates.mjs expects. Description: ${desc}`
  return startAgentPrompt('Create CV template', 'template', prompt)
}

async function previewTemplate(name: unknown): Promise<string> {
  const slug = slugTemplateName(str(name, 'name'))
  const res = await runScript(['cv-templates.mjs', 'resolve', 'cv', slug, '--format=html'])
  if (res.code !== 0) throw new Error(res.stderr.trim() || `Template "${slug}" not found`)
  return readFileSync(res.stdout.trim(), 'utf8')
}

const EXPORT_LABEL: Record<ExportFormat, string> = { pdf: 'PDF', html: 'HTML', tex: 'LaTeX', docx: 'DOCX', md: 'Markdown' }
const EXPORT_HOW: Record<Exclude<ExportFormat, 'md'>, string> = {
  pdf: 'build-cv-html.mjs then generate-pdf.mjs',
  html: 'build-cv-html.mjs',
  tex: 'build-cv-latex.mjs then generate-latex.mjs',
  docx: 'the docx plugin',
}

function exportResume(format: unknown): RunSummary {
  const fmt = str(format, 'format') as ExportFormat
  if (!(fmt in EXPORT_LABEL)) throw new Error(`Unknown export format: ${fmt}`)
  const root = dataRoot()
  const cvPath = join(root, 'cv.md')
  if (!existsSync(cvPath)) throw new Error('No cv.md yet — import and parse your resume first')
  const outDir = join(root, 'output')
  mkdirSync(outDir, { recursive: true })

  if (fmt === 'md') {
    copyFileSync(cvPath, join(outDir, 'cv.md'))
    return finishedRun('export', `Export CV (${EXPORT_LABEL.md})`, null)
  }
  if (fmt === 'docx' && !existsSync(join(careerOpsRoot(), 'plugins', 'docx'))) {
    throw new Error('DOCX export needs the docx plugin — install it from Integrations first.')
  }
  const prompt = `/career-ops export my cv to ${fmt} using ${EXPORT_HOW[fmt]} with the active template `
    + '(see cv-templates.mjs), writing the result under output/. Use only cv.md and config/profile.yml as source content.'
  return startAgentPrompt(`Export CV (${EXPORT_LABEL[fmt]})`, 'export', prompt)
}

function revealExport(file: unknown): boolean {
  shell.showItemInFolder(inside(join(dataRoot(), 'output'), str(file, 'file')))
  return true
}

export const resumeHandlers: Record<string, Handler> = {
  resumeOverview,
  importResume,
  parseResume,
  scoreAts,
  rankAgainstJob,
  setTemplate,
  importTemplate,
  createTemplate,
  previewTemplate,
  exportResume,
  revealExport,
  readCv,
  writeCv,
  extractResume,
  readProfile,
  researchProfile,
  readResearch,
  renderTemplatePdf,
  savePdf,
}
