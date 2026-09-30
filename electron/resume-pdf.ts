import { BrowserWindow, dialog, session, type Session } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument } from 'yaml'

import { dataRoot, runScript, str, userFile } from './context'
import { currentProfile } from './resume-agent'
import { profileToPayload, rebuildProfile } from './resume-profile'

// Template → PDF: build-cv-html.mjs fills the template deterministically, a hidden
// sandboxed window prints it. PDFs are cached per (template, cv/profile/template mtimes).

const mtime = (p: string) => (existsSync(p) ? Math.floor(statSync(p).mtimeMs) : 0)
const slugOf = (v: unknown) => {
  const name = str(v, 'name').trim()
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error(`Unknown template "${name}"`)
  return name
}

function pageFormat(root: string): 'a4' | 'letter' {
  try {
    const v = parseDocument(readFileSync(join(root, 'config', 'profile.yml'), 'utf8')).get('page_format')
    return String(v).toLowerCase() === 'a4' ? 'a4' : 'letter'
  } catch { return 'letter' }
}

async function templatePath(slug: string): Promise<string> {
  const res = await runScript(['cv-templates.mjs', 'resolve', 'cv', slug, '--format=html'])
  if (res.code !== 0) throw new Error(res.stderr.trim().split('\n')[0] || `Template "${slug}" not found`)
  return res.stdout.trim()
}

// Templates can be user-imported or agent-written: no network, no navigation, no popups.
let pdfSession: Session | null = null
function offlineSession(): Session {
  if (pdfSession) return pdfSession
  pdfSession = session.fromPartition('careerloom-pdf')
  pdfSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(data|blob|file|about):/i.test(d.url) }))
  return pdfSession
}

export async function printHtml(htmlFile: string, format: 'a4' | 'letter'): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false, session: offlineSession() } })
  win.webContents.on('will-navigate', e => e.preventDefault())
  win.webContents.on('will-redirect', e => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  try {
    await win.loadFile(htmlFile)
    return await win.webContents.printToPDF({ pageSize: format === 'a4' ? 'A4' : 'Letter', printBackground: true })
  } finally {
    win.destroy()
  }
}

export async function renderTemplatePdf(name: unknown): Promise<Uint8Array> {
  const slug = slugOf(name)
  const root = dataRoot()
  const template = await templatePath(slug)
  const format = pageFormat(root)
  const key = [mtime(join(root, 'cv.md')), mtime(join(root, 'data', 'careerloom-profile.json')), mtime(template), format].join('-')
  const dir = userFile('cv-pdf-cache')
  const cached = join(dir, `${slug}--${key}.pdf`)
  if (existsSync(cached)) return new Uint8Array(readFileSync(cached))

  const profile = currentProfile()
  if (!profile) throw new Error('No résumé yet — add a file and extract it with the agent first')
  mkdirSync(dir, { recursive: true })
  const payloadFile = join(dir, `${slug}.payload.json`)
  const htmlFile = join(dir, `${slug}.html`)
  writeFileSync(payloadFile, JSON.stringify(profileToPayload(profile, format)))
  const res = await runScript(['build-cv-html.mjs', payloadFile, htmlFile, template])
  if (res.code !== 0) throw new Error(`Could not fill the ${slug} template: ${res.stderr.trim().split('\n').slice(0, 3).join(' ') || 'build-cv-html failed'}`)
  const pdf = await printHtml(htmlFile, format)
  for (const f of readdirSync(dir)) if (f.startsWith(`${slug}--`)) rmSync(join(dir, f), { force: true })
  writeFileSync(cached, pdf)
  return new Uint8Array(pdf)
}

/** A template filled from ANY résumé text (a tailored copy), not the master cv.md. Nothing is cached or written to the master files. */
export async function renderCvText(cvMarkdown: string, templateName: string): Promise<Uint8Array> {
  const slug = slugOf(templateName)
  const root = dataRoot()
  const format = pageFormat(root)
  const profile = rebuildProfile(cvMarkdown, currentProfile())
  if (!profile) throw new Error('That résumé text has no name or sections to build a PDF from')
  const template = await templatePath(slug)
  const dir = userFile('cv-pdf-cache')
  mkdirSync(dir, { recursive: true })
  const stem = join(dir, `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  try {
    writeFileSync(`${stem}.payload.json`, JSON.stringify(profileToPayload(profile, format)))
    const res = await runScript(['build-cv-html.mjs', `${stem}.payload.json`, `${stem}.html`, template])
    if (res.code !== 0) throw new Error(`Could not fill the ${slug} template: ${res.stderr.trim().split('\n').slice(0, 3).join(' ') || 'build-cv-html failed'}`)
    return new Uint8Array(await printHtml(`${stem}.html`, format))
  } finally {
    for (const ext of ['payload.json', 'html']) rmSync(`${stem}.${ext}`, { force: true })
  }
}

/** Any self-contained HTML page (the cover letter) to PDF, in the same offline print window. */
export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const dir = userFile('cv-pdf-cache')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`)
  try {
    writeFileSync(file, html)
    return new Uint8Array(await printHtml(file, pageFormat(dataRoot())))
  } finally { rmSync(file, { force: true }) }
}

export async function savePdf(name: unknown): Promise<string | null> {
  const slug = slugOf(name)
  const bytes = await renderTemplatePdf(slug)
  const person = (currentProfile()?.name ?? 'Resume').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Resume'
  const res = await dialog.showSaveDialog({ defaultPath: `${person}-${slug}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (res.canceled || !res.filePath) return null
  writeFileSync(res.filePath, bytes)
  return res.filePath
}
