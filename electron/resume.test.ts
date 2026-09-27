import { describe, expect, it, vi } from 'vitest'

// resume.ts imports 'electron' (dialog/shell) and context.ts (app/BrowserWindow/
// safeStorage) at module scope; stub both so this file only exercises the pure
// helpers below without an Electron runtime.
vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
  app: { getPath: () => '/tmp' },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
}))

const {
  parseCvMarkdown,
  slugTemplateName,
  prettifyTemplateName,
  missingPlaceholders,
  setProfileTemplate,
  sanitizeDocName,
  buildAtsCheckHtml,
  validateProfile,
  profileFromCv,
  profileToPayload,
  collectResearchUrls,
  researchFileName,
  extractRoute,
  validateSources,
} = await import('./resume')

describe('parseCvMarkdown', () => {
  it('splits on # and ## headings and counts words', () => {
    const md = '# Jordan Reyes\n\n## Summary\nPlatform engineer.\n\n## Skills\nNode, Go.\n'
    const { words, sections } = parseCvMarkdown(md)
    expect(sections.map(s => s.title)).toEqual(['Jordan Reyes', 'Summary', 'Skills'])
    expect(sections[1]).toEqual({ title: 'Summary', lines: 2, text: 'Platform engineer.' })
    expect(words).toBeGreaterThan(0)
  })

  it('returns no sections for a doc with no headings', () => {
    expect(parseCvMarkdown('just text').sections).toEqual([])
  })
})

describe('slugTemplateName', () => {
  it('kebab-cases free text', () => {
    expect(slugTemplateName('My Cool Template!')).toBe('my-cool-template')
  })

  it('throws when nothing usable remains', () => {
    expect(() => slugTemplateName('***')).toThrow()
  })
})

describe('prettifyTemplateName', () => {
  it('title-cases a slug', () => {
    expect(prettifyTemplateName('my-cool-template')).toBe('My Cool Template')
  })
})

describe('missingPlaceholders', () => {
  it('finds missing tokens', () => {
    expect(missingPlaceholders('<p>{{NAME}}</p>', ['NAME', 'EXPERIENCE', 'EDUCATION'])).toEqual(['EXPERIENCE', 'EDUCATION'])
  })

  it('empty when all present', () => {
    expect(missingPlaceholders('{{NAME}}{{EXPERIENCE}}{{EDUCATION}}', ['NAME', 'EXPERIENCE', 'EDUCATION'])).toEqual([])
  })
})

describe('setProfileTemplate', () => {
  it('sets cv.template and preserves other keys and comments', () => {
    const yaml = '# personal info\nname: Jordan Reyes\ncv:\n  template: standard\nsalary_target:\n  min: 85000\n'
    const out = setProfileTemplate(yaml, 'modern')
    expect(out).toContain('# personal info')
    expect(out).toContain('name: Jordan Reyes')
    expect(out).toContain('template: modern')
    expect(out).toContain('min: 85000')
  })

  it('creates the cv.template key when absent', () => {
    const out = setProfileTemplate('name: Jordan Reyes\n', 'compact')
    expect(out).toContain('template: compact')
  })
})

describe('sanitizeDocName', () => {
  it('strips path separators and unsafe characters', () => {
    expect(sanitizeDocName('../../etc/passwd')).toBe('_.._etc_passwd')
    expect(sanitizeDocName('my résumé (final).pdf')).toBe('my_r_sum___final_.pdf')
  })
})

describe('buildAtsCheckHtml', () => {
  it('renders sections as section-title divs and escapes contact info', () => {
    const md = '## Experience\nDid things.\n\n## Education\nDegree.\n'
    const html = buildAtsCheckHtml(md, { name: 'A&B', email: 'a@b.com' })
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('class="section-title">Experience<')
    expect(html).toContain('class="section-title">Education<')
    expect(html).toContain('A&amp;B')
    expect(html).toContain('a@b.com')
  })
})

const CV = '# Jordan Reyes — Platform Engineer\n\n## Summary\nPlatform engineer.\n\n## Experience\n\n### Senior Platform Engineer — Acme Corp (2022–2026)\n- Built things.\n- Led migration.\n\n## Projects\n- **shipcheck** — pre-deploy checker.\n\n## Education\nB.Sc. Computer Science, University of Leeds, 2019.\n\n## Skills\nNode.js, TypeScript, Go.\n'

describe('validateProfile', () => {
  it('returns null without a name or for junk', () => {
    expect(validateProfile(null)).toBeNull()
    expect(validateProfile({ links: [] })).toBeNull()
    expect(validateProfile('x')).toBeNull()
  })
  it('defaults missing arrays and drops junk entries', () => {
    const p = validateProfile({ name: ' Ada ', links: [{ kind: 'weird', url: 'https://a.dev' }, { url: '' }], experience: [{ company: 'X' }, {}], skills: ['Go', 3] })!
    expect(p.name).toBe('Ada')
    expect(p.links).toEqual([{ kind: 'other', url: 'https://a.dev' }])
    expect(p.experience).toEqual([{ company: 'X', title: '', location: undefined, start: undefined, end: undefined, highlights: [] }])
    expect(p.skills).toEqual(['Go'])
    expect(p.education).toEqual([])
    expect(p.projects).toEqual([])
  })
})

describe('profileFromCv', () => {
  it('parses career-ops cv.md into a profile', () => {
    const p = profileFromCv(CV)!
    expect(p.name).toBe('Jordan Reyes')
    expect(p.headline).toBe('Platform Engineer')
    expect(p.experience[0]).toMatchObject({ title: 'Senior Platform Engineer', company: 'Acme Corp', start: '2022', end: '2026', highlights: ['Built things.', 'Led migration.'] })
    expect(p.projects[0]).toEqual({ name: 'shipcheck', summary: 'pre-deploy checker.' })
    expect(p.skills).toEqual(['Node.js', 'TypeScript', 'Go'])
    expect(p.education).toHaveLength(1)
  })
  it('returns null without a # heading', () => expect(profileFromCv('no heading')).toBeNull())
})

describe('profileToPayload', () => {
  it('maps to build-cv-html keys', () => {
    const p = validateProfile({ name: 'Ada', headline: 'Eng', links: [{ kind: 'linkedin', url: 'https://www.linkedin.com/in/ada/' }], experience: [{ company: 'X', title: 'Dev', start: '2020', end: 'Now', highlights: ['a'] }], education: [{ school: 'MIT', degree: 'BSc' }], skills: ['Go'] })!
    const out = profileToPayload(p, 'a4')
    expect(out.page_format).toBe('a4')
    expect(out.candidate.linkedin).toEqual({ url: 'https://www.linkedin.com/in/ada/', display: 'linkedin.com/in/ada' })
    expect(out.experience[0]).toMatchObject({ company: 'X', role: 'Dev', dates: '2020 – Now', bullets: ['a'] })
    expect(out.education[0]).toMatchObject({ title: 'BSc', org: 'MIT' })
    expect(out.skills).toEqual([{ items: ['Go'] }])
  })
})

describe('collectResearchUrls / researchFileName', () => {
  it('defaults the scheme, rejects non-http, dedupes and caps at 8', () => {
    const p = validateProfile({ name: 'A', links: [
      { kind: 'linkedin', url: 'linkedin.com/in/ada' },
      { kind: 'other', url: 'https://www.linkedin.com/in/ada/' },
      { kind: 'other', url: 'javascript:alert(1)' },
      { kind: 'other', url: 'ftp://x.dev' },
      ...Array.from({ length: 10 }, (_, i) => ({ kind: 'other', url: `https://s${i}.dev` })),
    ] })!
    const urls = collectResearchUrls(p)
    expect(urls[0]).toBe('https://linkedin.com/in/ada')
    expect(urls).toHaveLength(8)
    expect(urls.some(u => u.startsWith('javascript') || u.startsWith('ftp'))).toBe(false)
  })
  it('slugs host + path', () => {
    expect(researchFileName('https://www.github.com/Ada/Repo')).toBe('github.com-ada-repo.md')
    expect(researchFileName('https://ada.dev/')).toBe('ada.dev-index.md')
  })
  it('reads sources tolerantly', () => {
    expect(validateSources({ sources: [{ url: 'https://a.dev', ok: true, fetchedAt: 1, file: 'f.md' }, { bad: 1 }] })).toEqual([{ url: 'https://a.dev', ok: true, fetchedAt: 1, file: 'f.md', error: undefined }])
    expect(validateSources(null)).toEqual([])
  })
})

describe('extractRoute', () => {
  it('routes docx/rtf through textutil on macOS only', () => {
    expect(extractRoute('cv.pdf', 'linux')).toBe('direct')
    expect(extractRoute('cv.DOCX', 'darwin')).toBe('textutil')
    expect(() => extractRoute('cv.rtf', 'win32')).toThrow(/Save it as PDF/)
    expect(() => extractRoute('cv.exe', 'darwin')).toThrow()
  })
})

describe('splitCv / joinCv', async () => {
  const { splitCv, joinCv } = await import('../renderer/components/resume/cvSections')
  it('round-trips and edits one section', () => {
    const { header, parts } = splitCv(CV)
    expect(header).toBe('# Jordan Reyes — Platform Engineer\n\n')
    expect(parts.map(p => p.title)).toEqual(['Summary', 'Experience', 'Projects', 'Education', 'Skills'])
    expect(joinCv(header, parts)).toBe(CV)
    const edited = joinCv(header, parts.map(p => (p.title === 'Skills' ? { ...p, body: 'Rust' } : p)))
    expect(edited.endsWith('## Skills\nRust\n')).toBe(true)
  })
})
