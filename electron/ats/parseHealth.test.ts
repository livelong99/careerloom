import { describe, expect, it } from 'vitest'

import { SAMPLE_CV, htmlOf, onePagePdf, tinyPdf } from './fixtures'
import { detectColumns, htmlRisk, wordRecall } from './layout'
import { parseCv } from './model'
import { scoreParseHealth } from './parseHealth'
import { extractPdfPages } from './pdfText'

const NOW = Date.UTC(2026, 8, 1)
const CLEAN_HTML = '<html><body><h1>Sam Doe</h1><p>sam.doe@example.com</p><h2>Experience</h2><ul><li>Did a thing</li></ul></body></html>'
const score = (md = SAMPLE_CV, pages = onePagePdf(md), html: string | null = htmlOf(md)) => scoreParseHealth({ cv: parseCv(md), pages, html, now: NOW })

describe('scoreParseHealth', () => {
  it('a clean one-column résumé scores high but never 100', () => {
    const r = score()
    expect(r.score).toBeGreaterThanOrEqual(80)
    expect(r.score).toBeLessThan(100)
    expect(r.parts.map(p => p.id)).toEqual(['text-layer', 'sections', 'contact', 'dates', 'layout', 'length'])
    expect(r.parts.reduce((s, p) => s + p.max, 0)).toBe(100)
    expect(r.degraded.pdfText).toBe(false)
  })
  it('perturbation: converting to two columns lowers the score and caps it at 89', () => {
    const one = score()
    const two = score(SAMPLE_CV, onePagePdf(SAMPLE_CV, { twoColumns: true }))
    expect(two.score).toBeLessThan(one.score)
    expect(two.score).toBeLessThanOrEqual(89)
    expect(two.caps.some(c => c.id === 'multi-column')).toBe(true)
    expect(two.issues.some(i => i.id === 'layout.columns')).toBe(true)
  })
  it('perturbation: rasterising (empty text layer) is lossy and caps at 59', () => {
    const r = score(SAMPLE_CV, [{ width: 612, height: 792, items: [] }])
    expect(r.score).toBeLessThanOrEqual(59)
    expect(r.caps.some(c => c.id === 'lossy-extraction')).toBe(true)
  })
  it('content drift is reported separately from extraction loss and does not cap', () => {
    const html = '<body>' + SAMPLE_CV.replace(/\n/g, ' ').replace(/Awards[\s\S]*/, '') + '</body>'
    const md = SAMPLE_CV + '\n## Awards\n\n- Won the national robotics hackathon finals competition with autonomous warehouse drones\n'
    const r = score(md, onePagePdf(SAMPLE_CV), html)
    expect(r.issues.some(i => i.id === 'parse.coverage')).toBe(false)
    const drift = score(md + '\n- Gold medal in regional mathematics olympiad championship representing university team\n'.repeat(6), onePagePdf(SAMPLE_CV), html)
    expect(drift.issues.some(i => i.id === 'parse.coverage')).toBe(true)
    expect(drift.caps.some(c => c.id === 'lossy-extraction')).toBe(false)
  })
  it('education overlapping an internship is not flagged', () => {
    const md = SAMPLE_CV.replace('(July 2015–May 2019)', '(July 2015–May 2022)')
    expect(score(md).issues.some(i => i.category === 'date')).toBe(false)
  })
  it('dropping Experience and Skills text lowers the score', () => {
    const md = SAMPLE_CV.replace(/## Skills[\s\S]*$/, '')
    expect(score(md).score).toBeLessThan(score().score)
    expect(score(md).issues.some(i => i.id === 'section.missing.skills')).toBe(true)
  })
  it('icon-glyph contact caps at 89', () => {
    const r = score(SAMPLE_CV, onePagePdf(SAMPLE_CV), htmlOf(SAMPLE_CV).replace('<p>', '<p><i class="fa fa-phone"></i>'))
    expect(r.score).toBeLessThanOrEqual(89)
  })
  it('without a rendered PDF the text layer is estimated and flagged', () => {
    const r = score(SAMPLE_CV, null as never, htmlOf(SAMPLE_CV))
    expect(r.degraded.pdfText).toBe(true)
    expect(r.confidence).toBe('medium')
  })
  it('right-aligned date rows are not mistaken for columns', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ str: 'Backend Engineer — Acme', x: 40, y: 700 - i * 14, w: 130, h: 10 }))
    const dates = Array.from({ length: 8 }, (_, i) => ({ str: `Jan 20${10 + i} – Dec 20${11 + i}`, x: 440 - i * 3, y: 700 - i * 14, w: 100, h: 10 }))
    expect(detectColumns([{ width: 612, height: 792, items: [...rows, ...dates] }]).columns).toBe(false)
  })
})

describe('layout helpers', () => {
  it('wordRecall', () => {
    expect(wordRecall('alpha bravo charlie delta', 'alpha bravo charlie delta')).toBe(1)
    expect(wordRecall('alpha bravo charlie delta', 'alpha bravo')).toBe(0.5)
  })
  it('htmlRisk finds columns, tables, images, absolute boxes', () => {
    const r = htmlRisk('<style>.a{display:grid;grid-template-columns:30% 70%}.b{position:absolute}</style><table></table><img src=x>')
    expect(r).toMatchObject({ columns: true, tables: 1, images: 1, textBoxes: 1 })
    expect(htmlRisk(CLEAN_HTML)).toMatchObject({ columns: false, tables: 0, images: 0, textBoxes: 0 })
  })
})

describe('pdf.js extraction', () => {
  it('reads the text layer of a real PDF', async () => {
    const pages = await extractPdfPages(tinyPdf(['Sam Doe', 'sam.doe@example.com', 'Reduced latency by 40%']))
    expect(pages).toHaveLength(1)
    expect(pages[0]!.items.map(i => i.str).join(' ')).toContain('sam.doe@example.com')
  })
})
