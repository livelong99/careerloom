import type { EducationItem, ExperienceItem, ExtractedProfile, ProfileLink, ProjectItem, ResearchSource, ResumeSection } from './contract'

// Pure helpers for Resume v2 (no fs/electron) — covered by resume.test.ts.

/** `## Heading` / `# Heading` blocks → sections, plus a whole-doc word count. */
export function parseCvMarkdown(md: string): { words: number; sections: ResumeSection[] } {
  const words = md.split(/\s+/).filter(Boolean).length
  const sections: ResumeSection[] = []
  let current: { title: string; lines: string[] } | null = null
  for (const line of md.split('\n')) {
    const heading = /^#{1,2}\s+(.+?)\s*$/.exec(line)
    if (heading) {
      if (current) sections.push({ title: current.title, lines: current.lines.length, text: current.lines.join('\n').trim() })
      current = { title: heading[1]!, lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) sections.push({ title: current.title, lines: current.lines.length, text: current.lines.join('\n').trim() })
  return { words, sections }
}

// ————— Extraction input routing —————

export const EXTRACT_EXT = new Set(['pdf', 'md', 'txt', 'docx', 'rtf', 'tex'])

/** How main hands a résumé file to the agent: as-is, or converted to text first (textutil). */
export function extractRoute(file: string, platform: string): 'direct' | 'textutil' {
  const ext = file.split('.').pop()?.toLowerCase() ?? ''
  if (!EXTRACT_EXT.has(ext) || !file.includes('.')) throw new Error(`Can't extract .${ext || '?'} files — use PDF, Word, RTF, Markdown or plain text`)
  if (ext !== 'docx' && ext !== 'rtf') return 'direct'
  if (platform !== 'darwin') throw new Error(`Save it as PDF first — .${ext} conversion needs macOS`)
  return 'textutil'
}

// ————— Profile JSON (written by the extraction agent) —————

const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
const LINK_KINDS = new Set(['linkedin', 'github', 'portfolio', 'other'])

/** Tolerant validation: bad root/name → null, missing arrays → [], junk entries dropped. */
export function validateProfile(raw: unknown): ExtractedProfile | null {
  const r = obj(raw)
  const name = s(r.name)
  if (!name) return null
  const links: ProfileLink[] = arr(r.links).flatMap(l => {
    const o = obj(l)
    const url = s(o.url)
    return url ? [{ kind: (LINK_KINDS.has(o.kind as string) ? o.kind : 'other') as ProfileLink['kind'], url }] : []
  })
  const experience: ExperienceItem[] = arr(r.experience).flatMap(e => {
    const o = obj(e)
    const company = s(o.company) ?? ''
    const title = s(o.title) ?? ''
    if (!company && !title) return []
    return [{ company, title, location: s(o.location), start: s(o.start), end: s(o.end), highlights: arr(o.highlights).map(s).filter((x): x is string => !!x) }]
  })
  const education: EducationItem[] = arr(r.education).flatMap(e => {
    const o = obj(e)
    const school = s(o.school)
    return school ? [{ school, degree: s(o.degree), start: s(o.start), end: s(o.end) }] : []
  })
  const projects: ProjectItem[] = arr(r.projects).flatMap(p => {
    const o = obj(p)
    const pname = s(o.name)
    return pname ? [{ name: pname, url: s(o.url), summary: s(o.summary) }] : []
  })
  return {
    name,
    headline: s(r.headline), email: s(r.email), phone: s(r.phone), location: s(r.location), summary: s(r.summary),
    links,
    skills: arr(r.skills).map(s).filter((x): x is string => !!x),
    experience, education, projects,
    extractedFrom: s(r.extractedFrom),
    extractedAt: typeof r.extractedAt === 'number' ? r.extractedAt : undefined,
  }
}

/** Best-effort profile from career-ops cv.md, used until the agent has written the JSON. */
export function profileFromCv(md: string): ExtractedProfile | null {
  const h1 = /^#\s+(.+)$/m.exec(md)?.[1]?.trim()
  if (!h1) return null
  const [name, headline] = h1.split(/\s+[—–|-]\s+/)
  const sections = parseCvMarkdown(md).sections
  const sec = (re: RegExp) => sections.find(x => re.test(x.title))?.text ?? ''
  const bullets = (t: string) => t.split('\n').map(l => /^\s*[-*]\s+(.+)/.exec(l)?.[1]?.trim()).filter((x): x is string => !!x)
  const experience: ExperienceItem[] = sec(/experience|employment|work/i).split(/^###\s+/m).slice(1).map(block => {
    const [head = '', ...rest] = block.split('\n')
    const dates = /\(([^)]*)\)\s*$/.exec(head)?.[1]
    const [title = '', company = ''] = head.replace(/\([^)]*\)\s*$/, '').trim().split(/\s+[—–|@]\s+|\s+at\s+/)
    const [start, end] = dates?.split(/\s*[–—-]\s*/) ?? []
    return { company: company.trim(), title: title.trim(), start, end, highlights: bullets(rest.join('\n')) }
  })
  const lines = (t: string) => t.split('\n').map(l => l.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean)
  return {
    name: name!.trim(), headline: headline?.trim(),
    summary: sec(/summary|profile|about/i) || undefined,
    links: [],
    skills: sec(/skills/i).split(/[,\n]/).map(x => x.replace(/^\s*[-*]\s+/, '').replace(/\.$/, '').trim()).filter(Boolean),
    experience,
    education: lines(sec(/education/i)).map(school => ({ school })),
    projects: lines(sec(/projects/i)).map(l => {
      const m = /^\*\*(.+?)\*\*\s*[—–-]?\s*(.*)$/.exec(l)
      return m ? { name: m[1]!, summary: m[2] || undefined } : { name: l }
    }),
  }
}

// ————— build-cv-html.mjs payload (keys per career-ops lib/cv-payload-schema.mjs, html) —————

const linkObj = (url?: string) => (url ? { url, display: url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') } : undefined)
const dates = (a?: string, b?: string) => [a, b].filter(Boolean).join(' – ') || undefined

export function profileToPayload(p: ExtractedProfile, pageFormat: 'a4' | 'letter') {
  const link = (kind: ProfileLink['kind']) => linkObj(p.links.find(l => l.kind === kind)?.url)
  return {
    lang: 'en',
    page_format: pageFormat,
    candidate: { name: p.name, title: p.headline, email: p.email, phone: p.phone, location: p.location, linkedin: link('linkedin'), github: link('github'), portfolio: link('portfolio') },
    summary: p.summary ?? '',
    competencies: [],
    experience: p.experience.filter(e => e.company || e.title).map(e => ({
      company: e.company || e.title, role: e.title || e.company, location: e.location, dates: dates(e.start, e.end), bullets: e.highlights,
    })),
    projects: p.projects.map(x => ({ name: x.name, description: x.summary, url: x.url })),
    education: p.education.map(e => ({ title: e.degree ?? e.school, org: e.degree ? e.school : undefined, year: dates(e.start, e.end) })),
    certifications: [],
    awards: [],
    interests: [],
    skills: p.skills.length ? [{ items: p.skills }] : [],
  }
}

// ————— Research URLs —————

const RESEARCH_CAP = 8

/** http(s) URLs from the profile's links + project urls, scheme-defaulted, deduped, capped. */
export function collectResearchUrls(p: ExtractedProfile): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...p.links.map(l => l.url), ...p.projects.map(x => x.url)]) {
    if (!raw) continue
    let u: URL
    try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`) } catch { continue }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') continue
    u.hash = ''
    const key = `${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}${u.search}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(u.toString())
    if (out.length === RESEARCH_CAP) break
  }
  return out
}

/** `<host>-<path-slug>.md` for documents/research/. */
export function researchFileName(url: string): string {
  const u = new URL(url)
  const host = u.hostname.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '')
  const path = u.pathname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'index'
  return `${host}-${path}.md`
}

/** Tolerant read of data/careerloom-research.json. */
export function validateSources(raw: unknown): ResearchSource[] {
  return arr(obj(raw).sources).flatMap(x => {
    const o = obj(x)
    const url = s(o.url)
    if (!url) return []
    return [{ url, file: s(o.file) ?? null, fetchedAt: typeof o.fetchedAt === 'number' ? o.fetchedAt : 0, ok: o.ok === true, error: s(o.error) }]
  })
}
