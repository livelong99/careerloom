// cv.md → a small structured model with line numbers, so findings can quote the exact line. Pure.

export type CvBullet = { text: string; section: string; entry: string | null; line: number; evidence: boolean }
export type CvEntry = { heading: string; section: string; line: number; bullets: CvBullet[] }
export type CvSection = { title: string; start: number; lines: string[] }
export type CvModel = {
  markdown: string
  name: string
  contact: string
  sections: CvSection[]
  entries: CvEntry[]
  bullets: CvBullet[]
  /** Text of the Skills section(s): a list of keywords is weak evidence on its own. */
  skillsText: string
  words: number
}

const EVIDENCE_SECTION = /experience|employment|work|project|intern/i
const SKILLS_SECTION = /skill|technolog|competenc|tools/i

/** Markdown inline → plain text (links keep their label, emphasis marks go). */
export const plain = (s: string) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim()

export function parseCv(markdown: string): CvModel {
  const lines = markdown.split('\n')
  const sections: CvSection[] = []
  const entries: CvEntry[] = []
  const bullets: CvBullet[] = []
  let name = ''
  let section: CvSection | null = null
  let entry: CvEntry | null = null
  lines.forEach((raw, i) => {
    const line = i + 1
    const h1 = /^#\s+(.+)/.exec(raw)
    const h2 = /^##\s+(.+)/.exec(raw)
    const h3 = /^###\s+(.+)/.exec(raw)
    if (h1) { name ||= plain(h1[1]!).split(/\s+[—–-]\s+/)[0]!; return }
    if (h2) { section = { title: plain(h2[1]!), start: line, lines: [] }; sections.push(section); entry = null; return }
    if (h3 && section) { section.lines.push(raw); entry = { heading: plain(h3[1]!), section: section.title, line, bullets: [] }; entries.push(entry); return }
    section?.lines.push(raw)
    const b = /^\s*[-*•]\s+(.+)/.exec(raw)
    if (b && section) {
      const evidence = EVIDENCE_SECTION.test(section.title) && !SKILLS_SECTION.test(section.title)
      const bullet: CvBullet = { text: plain(b[1]!), section: section.title, entry: entry?.heading ?? null, line, evidence }
      bullets.push(bullet)
      entry?.bullets.push(bullet)
    }
  })
  const contact = lines.slice(0, 8).find(l => /@|\+?\d[\d\s().-]{7,}/.test(l)) ?? ''
  const skillsText = sections.filter(s => SKILLS_SECTION.test(s.title)).map(s => plain(s.lines.join('\n'))).join('\n')
  return { markdown, name, contact, sections, entries, bullets, skillsText, words: markdown.split(/\s+/).filter(Boolean).length }
}

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length
