// Parse health 0-100, deterministic: can a parser read this résumé as rendered? Pure.
// Text-layer integrity 30 · sections 20 · contact-in-body 15 · dates 15 · layout risk 10 · length/density/recency 10.
import type { ScoreBlock, ScoreBlockPart, ScoreCap } from '../contract'
import { analyseDates, dateScore, findRanges, nowYM, type DateReport } from './dates'
import { detectColumns, garbageChars, htmlRisk, htmlText, missingWords, readingOrder, wordRecall } from './layout'
import { plain, type CvModel } from './model'
import type { Issue, PdfPage } from './types'

export type ParseInput = { cv: CvModel; pages: PdfPage[] | null; html: string | null; now?: number }
export type ParseResult = ScoreBlock & { issues: Issue[]; degraded: { pdfText: boolean }; dates: DateReport }

const STANDARD: Array<[string, RegExp]> = [
  ['summary', /^(summary|professional summary|profile|objective|about( me)?)$/i],
  ['experience', /^((work|professional|relevant) )?(experience|employment( history)?|work history)$/i],
  ['education', /^education( and training)?$/i],
  ['skills', /^((technical|core|key) )?(skills|technologies|competencies)( (&|and) tools)?$/i],
  ['projects', /^((selected|personal|key) )?projects$/i],
  ['certifications', /^(certifications?|certificates|licenses( (&|and) certifications)?)$/i],
  ['awards', /^(awards|achievements|honou?rs|awards (&|and) honou?rs|accomplishments)$/i],
  ['extra', /^(publications|languages|volunteer(ing)?( experience)?|interests|activities|leadership)$/i],
]
const REQUIRED = ['experience', 'education', 'skills']
const round1 = (n: number) => Math.round(n * 10) / 10
const part = (id: string, label: string, got: number, max: number, evidence?: string): ScoreBlockPart => ({ id, label, got: round1(Math.max(0, Math.min(max, got))), max, evidence })
const kindOf = (title: string) => STANDARD.find(([, re]) => re.test(title.replace(/[&]/g, '&').trim()))?.[0] ?? null

export function scoreParseHealth({ cv, pages, html, now = Date.now() }: ParseInput): ParseResult {
  const issues: Issue[] = []
  const caps: ScoreCap[] = [{ id: 'ceiling', max: 98, reason: 'A heuristic cannot replace submitting to the real ATS' }]
  const add = (i: Issue) => issues.push(i)
  const stream = pages?.flatMap(p => p.items.map(i => i.str)).join(' ') ?? null
  const risk = html ? htmlRisk(html) : null
  const fullText = stream ?? cv.markdown

  // 1. Text-layer integrity (30): recall 15, garbage glyphs 5, reading order 10.
  let integrity: ScoreBlockPart
  let lossy = false
  if (stream !== null && pages) {
    // Extraction loss: does the text layer hold what the template drew? (falls back to cv.md without the HTML)
    const cvText = plain(cv.markdown) // link targets are not reading text
    const drawn = html ? htmlText(html) : cvText
    const recall = wordRecall(drawn, stream)
    // Coverage: does the rendered résumé still carry everything in cv.md?
    const coverage = wordRecall(cvText, html ? htmlText(html) : stream)
    const garbage = garbageChars(stream)
    const order = readingOrder(cv.bullets.map(b => b.text), stream)
    lossy = recall < 0.85
    const g = recall >= 0.98 ? 10 : Math.max(0, ((recall - 0.7) / 0.28) * 10)
    const cov = coverage >= 0.95 ? 5 : Math.max(0, ((coverage - 0.6) / 0.35) * 5)
    const junk = Math.max(0, 5 - garbage)
    const ord = order === null ? 5 : order * 10
    integrity = part('text-layer', 'Text-layer integrity', g + cov + junk + ord, 30, `${Math.round(recall * 100)}% of the drawn text reaches the text layer; ${Math.round(coverage * 100)}% of cv.md is in the rendered résumé; ${garbage} unreadable glyphs; reading order ${order === null ? 'not measurable' : Math.round(order * 100) + '% in sequence'}`)
    if (lossy) {
      caps.push({ id: 'lossy-extraction', max: 59, reason: `Only ${Math.round(recall * 100)}% of the text can be extracted from the PDF` })
      add({ id: 'parse.text-loss', severity: 'critical', category: 'parse', title: 'Part of your résumé is missing from the PDF text layer', detail: 'Applicant systems read the text layer, not the picture. Text drawn as images, outlines or unusual fonts disappears. Choose a template that keeps text as real text.', evidence: `${Math.round(recall * 100)}% recall` })
    }
    if (coverage < 0.9) add({ id: 'parse.coverage', severity: 'major', category: 'section', title: 'The rendered résumé leaves out part of your cv.md', detail: 'The template builds from your extracted profile, which differs from cv.md. Sections such as Awards, or some skills, may not appear in the PDF you send. Re-extract the profile or add the missing content.', evidence: `${Math.round(coverage * 100)}% of cv.md words present; missing e.g. ${missingWords(cvText, html ? htmlText(html) : stream).join(', ')}` })
    if (garbage > 0) add({ id: 'parse.garbage', severity: 'major', category: 'parse', title: 'Some characters extract as unreadable symbols', detail: 'Icons and special glyphs become junk in a parser. Replace them with plain text labels.', evidence: `${garbage} glyphs` })
    if (order !== null && order < 0.85) add({ id: 'parse.order', severity: 'major', category: 'parse', title: 'Text is extracted out of order', detail: 'Bullets come out of the PDF in a different order than you wrote them, which usually means a multi-column or floated layout.', evidence: `${Math.round(order * 100)}% in sequence` })
  } else {
    integrity = part('text-layer', 'Text-layer integrity', 18, 30, 'Not measured: no rendered PDF was available, so this part is estimated at 60%')
  }

  // 2. Sections (20): standard names 8, required present 8, sensible order 4.
  const kinds = cv.sections.map(s => ({ title: s.title, kind: kindOf(s.title) }))
  const nonStd = kinds.filter(k => !k.kind)
  const present = new Set(kinds.map(k => k.kind))
  const missing = REQUIRED.filter(r => !present.has(r))
  const std = kinds.length ? (kinds.length - nonStd.length) / kinds.length : 0
  const order = kinds.filter(k => k.kind).map(k => k.kind!)
  const ex = order.indexOf('experience')
  const sensibleOrder = !(order.includes('summary') && ex >= 0 && order.indexOf('summary') > ex)
  for (const n of nonStd) add({ id: `section.name.${n.title}`, severity: 'minor', category: 'section', title: `"${n.title}" is not a heading parsers recognise`, detail: 'Use a standard heading (Experience, Education, Skills, Projects, Certifications) so the section is classified correctly.', evidence: n.title })
  for (const m of missing) add({ id: `section.missing.${m}`, severity: m === 'experience' ? 'critical' : 'major', category: 'section', title: `No ${m[0]!.toUpperCase()}${m.slice(1)} section`, detail: `Applicant systems look for a ${m} section; without one that part of your profile is left empty.` })
  if (!sensibleOrder) add({ id: 'section.order', severity: 'minor', category: 'section', title: 'Summary comes after Experience', detail: 'Recruiters and parsers expect the summary first.' })
  const sections = part('sections', 'Section structure', std * 8 + ((REQUIRED.length - missing.length) / REQUIRED.length) * 8 + (sensibleOrder ? 4 : 1), 20, `${kinds.length - nonStd.length} of ${kinds.length} headings are standard${missing.length ? `; missing ${missing.join(', ')}` : ''}`)

  // 3. Contact in body (15): email 5, phone 4, location 3, link 3.
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(fullText)
  const phone = /\+?\d[\d\s().-]{8,}\d/.test(fullText)
  const location = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*(?:[A-Z]{2}\b|[A-Z][a-z]+)/.test(cv.contact || fullText.slice(0, 400))
  const link = /(linkedin\.com|github\.com|https?:\/\/)/i.test(fullText)
  let contact = (email ? 5 : 0) + (phone ? 4 : 0) + (location ? 3 : 0) + (link ? 3 : 0)
  if (!email) add({ id: 'contact.email', severity: 'critical', category: 'parse', title: 'No email address in the text layer', detail: 'Without a readable email the ATS cannot create your candidate record.' })
  if (!phone) add({ id: 'contact.phone', severity: 'major', category: 'parse', title: 'No phone number in the text layer', detail: 'Add a phone number as plain text near the top.' })
  if (!location) add({ id: 'contact.location', severity: 'minor', category: 'parse', title: 'No city and country/state found', detail: 'Many systems filter by location; add "City, Country" next to your contact details.' })
  if (risk?.contactInHeaderFooter) { contact -= 2; add({ id: 'contact.header', severity: 'minor', category: 'parse', title: 'Contact details sit in a header/footer element', detail: 'Some parsers skip page headers and footers; keep contact details in the main body.' }) }
  if (risk?.iconGlyphs) {
    contact -= 4
    caps.push({ id: 'icon-contact', max: 89, reason: 'Contact details use icon glyphs' })
    add({ id: 'contact.icons', severity: 'major', category: 'parse', title: 'Contact details use icon glyphs', detail: 'Icon fonts extract as unreadable symbols or are dropped. Use text labels such as "Email:" or no icon at all.' })
  }
  const contactPart = part('contact', 'Contact details in body', contact, 15, [email && 'email', phone && 'phone', location && 'location', link && 'link'].filter(Boolean).join(', ') || 'none found')

  // 4. Dates (15).
  const textOf = (re: RegExp) => cv.sections.filter(s => re.test(s.title)).map(s => s.lines.join('\n')).join('\n')
  const nowYm = nowYM(new Date(now))
  // Overlaps and gaps are judged on work history only: studying while interning is normal.
  const { ranges, bad } = findRanges(textOf(/experience|employment|work|intern/i), nowYm)
  const others = findRanges(textOf(/education|project|certif/i), nowYm)
  const dateRep = analyseDates(ranges, [...bad, ...others.bad], nowYm)
  const ds = dateScore(dateRep)
  for (const n of ds.notes) add({ id: `date.${n.slice(0, 24)}`, severity: 'minor', category: 'date', title: n, detail: 'Parsers build your timeline from these dates; clean, consistent ranges make tenure and recency read correctly.' })
  const dates = part('dates', 'Date consistency', ds.got, 15, `${ranges.length} ranges read${bad.length ? `, ${bad.length} unreadable` : ''}`)

  // 5. Layout risk (10): columns 6, tables 3, images 2, text boxes 3, icons 3 (deducted).
  const geo = pages ? detectColumns(pages) : { columns: false, evidence: '' }
  const columns = geo.columns || !!risk?.columns
  let layout = 10
  if (columns) {
    layout -= 6
    caps.push({ id: 'multi-column', max: 89, reason: 'The layout uses more than one column' })
    add({ id: 'layout.columns', severity: 'critical', category: 'parse', title: 'Multi-column layout', detail: 'Parsers read across columns and interleave the text. A single-column template is safest.', evidence: geo.evidence || 'Column styles found in the template HTML' })
  }
  if (risk?.tables) { layout -= 3; add({ id: 'layout.tables', severity: 'major', category: 'parse', title: 'Layout uses tables', detail: 'Table cells can be read out of order. Use plain paragraphs and lists.', evidence: `${risk.tables} table(s)` }) }
  if (risk?.images) { layout -= 2; add({ id: 'layout.images', severity: 'major', category: 'parse', title: 'Images in the template', detail: 'Text inside images cannot be read. Keep the résumé as live text.', evidence: `${risk.images} image(s)` }) }
  if (risk?.textBoxes) { layout -= 3; add({ id: 'layout.textboxes', severity: 'major', category: 'parse', title: 'Absolutely positioned text boxes', detail: 'Free-floating text boxes are often skipped or misordered.', evidence: `${risk.textBoxes} element(s)` }) }
  const layoutPart = part('layout', 'Layout risk', layout, 10, columns ? 'Multi-column detected' : risk ? 'Single column, no tables or images' : 'Template HTML not available, measured from the PDF only')

  // 6. Length, density, recency (10): pages 4, density 3, recency 3.
  const pageCount = pages?.length ?? Math.max(1, Math.round(cv.words / 550))
  const pg = pageCount <= 2 ? 4 : pageCount === 3 ? 2 : 0
  const dens = cv.words >= 300 && cv.words <= 900 ? 3 : cv.words >= 200 && cv.words <= 1200 ? 1.5 : 0
  const latest = ranges.length ? Math.max(...ranges.map(r => r.end)) : -Infinity
  const rec = latest >= nowYm - 12 ? 3 : latest >= nowYm - 36 ? 1.5 : 0
  if (pageCount > 2) add({ id: 'length.pages', severity: 'minor', category: 'parse', title: `The résumé runs to ${pageCount} pages`, detail: 'Two pages is the practical maximum for most roles; trim older or weaker content.' })
  if (cv.words < 200) add({ id: 'length.thin', severity: 'major', category: 'parse', title: 'The résumé is very short', detail: `Only ${cv.words} words; there is too little for a parser or recruiter to match against.` })
  if (cv.words > 1200) add({ id: 'length.dense', severity: 'minor', category: 'parse', title: 'The résumé is very dense', detail: `${cv.words} words; cut the least relevant bullets.` })
  const length = part('length', 'Length, density, recency', pg + dens + rec, 10, `${pageCount} page(s), ${cv.words} words, latest role ends ${latest >= nowYm - 1 ? 'now' : 'earlier'}`)

  const parts = [integrity, sections, contactPart, dates, layoutPart, length]
  const raw = parts.reduce((s, p) => s + p.got, 0)
  const ceiling = Math.min(...caps.map(c => c.max))
  const score = Math.round(Math.min(raw, ceiling))
  const spread = pages ? 2 : 6
  return {
    score, low: Math.max(0, score - spread), high: Math.min(ceiling, score + spread), confidence: pages && html ? 'high' : pages || html ? 'medium' : 'low',
    parts, caps: caps.filter(c => c.max < 100), issues, degraded: { pdfText: !pages }, dates: dateRep,
  }
}
