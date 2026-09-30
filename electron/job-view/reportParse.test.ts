import { describe, expect, it } from 'vitest'

import { REPORT, REPORT_DE } from './fixtures'
import { parseReport } from './reportParse'

describe('parseReport', () => {
  const v = parseReport(REPORT)
  it('reads the header and machine summary', () => {
    expect(v.company).toBe('Acme Corp')
    expect(v.role).toBe('Senior Platform Engineer')
    expect(v.score).toBe(3.8)
    expect(v.legitimacy).toBe('High Confidence')
    expect(v.url).toBe('https://jobs.example.com/acme/123')
    expect(v.decision).toBe('Apply')
    expect(v.topStrengths).toEqual(['Kubernetes in production', 'CI/CD ownership'])
    expect(v.softGaps).toEqual(['No Terraform at scale'])
    expect(v.hardStops).toEqual([])
    expect(v.advertisedComp).toBe('$120,000 - $150,000 USD')
  })
  it('extracts the archived JD without the rest of the report', () => {
    expect(v.jd).toContain('Run Kubernetes clusters')
    expect(v.jd).not.toContain('Machine Summary')
  })
  it('parses the CV match table with statuses and gaps', () => {
    expect(v.cvMatch.map(r => [r.requirement, r.status])).toEqual([['Kubernetes', 'match'], ['Terraform', 'partial'], ['Mentoring', 'missing']])
    expect(v.cvMatch[0]).toMatchObject({ importance: 'critical (stated)', evidence: 'Ran prod clusters' })
    expect(v.gaps).toHaveLength(2)
    expect(v.gaps[0]).toMatchObject({ risk: 'Screened out on IaC.', mitigation: 'Lead with the side project.' })
  })
  it('reads scores, plan, keywords, role attributes and risks', () => {
    expect(v.scores.find(s => s.dimension === 'CV match')?.value).toBe(4)
    expect(v.scores.find(s => s.dimension === 'Global')?.value).toBe(3.8)
    expect(v.personalization[0]).toMatchObject({ section: 'Summary', proposed: 'Platform focus' })
    expect(v.keywords).toEqual(['Kubernetes', 'Terraform', 'CI/CD'])
    expect(v.roleAttributes).toContainEqual({ label: 'Domain', value: 'Developer platform' })
    expect(v.risks).toContainEqual({ label: 'Visa', value: 'Medium' })
  })
  it('keeps every section for the Report tab, tables parsed', () => {
    const f = v.sections.find(s => s.letter === 'F')!
    expect(f.title).toMatch(/Interview/)
    expect(f.blocks.some(b => b.kind === 'table')).toBe(true)
    expect(v.sections.map(s => s.letter)).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D', 'E', 'F', 'G']))
  })
  it('tolerates locale headings and missing sections without throwing', () => {
    const d = parseReport(REPORT_DE)
    expect(d.company).toBe('Beispiel GmbH')
    expect(d.score).toBe(2.9)
    expect(d.cvMatch).toHaveLength(1)
    expect(d.cvMatch[0]).toMatchObject({ requirement: 'Java', status: 'match', evidence: '5 Jahre' })
    expect(d.roleAttributes).toHaveLength(1)
    expect(d.warnings.length).toBeGreaterThan(0)
  })
  it('never throws on junk', () => {
    for (const s of ['', '\n\n', '## ', '| a |\n|---|', '```yaml\n: : :\n```', '# x']) expect(() => parseReport(s)).not.toThrow()
    expect(parseReport('').warnings.length).toBeGreaterThan(0)
  })
})
