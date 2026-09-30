// What a parser sees in a rendered résumé: geometry from the PDF text layer and risky constructs in the HTML. Pure.
import type { PdfItem, PdfPage } from './types'

export type Row = { page: number; y: number; blocks: Array<{ x0: number; x1: number; text: string }> }

/** Group a page's runs into rows (same baseline ±2pt), then into blocks split by wide horizontal gaps. */
export function rowsOf(pages: PdfPage[]): Row[] {
  const rows: Row[] = []
  pages.forEach((p, pi) => {
    const byY: PdfItem[][] = []
    for (const it of [...p.items].filter(i => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
      const row = byY.find(r => Math.abs(r[0]!.y - it.y) <= 2)
      if (row) row.push(it); else byY.push([it])
    }
    const gap = p.width * 0.06
    for (const r of byY) {
      const items = r.sort((a, b) => a.x - b.x)
      const blocks: Row['blocks'] = []
      for (const it of items) {
        const last = blocks[blocks.length - 1]
        if (last && it.x - last.x1 <= gap) { last.text += (it.x - last.x1 > 1 ? ' ' : '') + it.str; last.x1 = it.x + it.w } else blocks.push({ x0: it.x, x1: it.x + it.w, text: it.str })
      }
      rows.push({ page: pi, y: r[0]!.y, blocks })
    }
  })
  return rows
}

/**
 * Multi-column detection: a real column layout has a long right-hand block starting at the same x on many rows.
 * Right-aligned dates ("Feb 2024 – Present") are short and start at varying x, so they do not count.
 */
export function detectColumns(pages: PdfPage[]): { columns: boolean; evidence: string } {
  for (const [pi, p] of pages.entries()) {
    const right = rowsOf([p]).flatMap(r => r.blocks.slice(1).filter(b => b.x1 - b.x0 > p.width * 0.18 && b.text.length > 25).map(b => Math.round(b.x0 / (p.width * 0.03))))
    const tally = new Map<number, number>()
    for (const k of right) tally.set(k, (tally.get(k) ?? 0) + 1)
    const [bucket, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]
    if (n >= 4) return { columns: true, evidence: `Page ${pi + 1}: ${n} rows have a second text column starting near x=${Math.round(bucket * p.width * 0.03)}` }
  }
  return { columns: false, evidence: '' }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const wordsOf = (s: string) => norm(s).split(' ').filter(w => w.length >= 3)

/** Share of the résumé's words that survive into the PDF text layer (multiset overlap). */
export function wordRecall(cvText: string, pdfText: string): number {
  const bag = new Map<string, number>()
  for (const w of wordsOf(pdfText)) bag.set(w, (bag.get(w) ?? 0) + 1)
  const want = wordsOf(cvText)
  if (!want.length) return 1
  let hit = 0
  for (const w of want) { const n = bag.get(w) ?? 0; if (n > 0) { hit++; bag.set(w, n - 1) } }
  return hit / want.length
}

/** Characters that mean the extractor could not map a glyph (replacement char, private-use icons). */
export function garbageChars(text: string): number {
  return [...text].filter(c => { const n = c.codePointAt(0)!; return n === 0xfffd || (n >= 0xe000 && n <= 0xf8ff) || (n >= 0xf0000) }).length
}

/** Fraction of résumé bullets (by their opening words) that appear in the PDF stream in the same order. null = too few found. */
export function readingOrder(bulletStarts: string[], pdfStream: string): number | null {
  const hay = norm(pdfStream)
  const pos = bulletStarts.map(b => norm(b).split(' ').slice(0, 5).join(' ')).filter(Boolean).map(s => hay.indexOf(s)).filter(i => i >= 0)
  if (pos.length < 3) return null
  let ok = 0
  for (let i = 1; i < pos.length; i++) if (pos[i]! > pos[i - 1]!) ok++
  return ok / (pos.length - 1)
}

export type HtmlRisk = { columns: boolean; tables: number; images: number; textBoxes: number; iconGlyphs: boolean; contactInHeaderFooter: boolean; floats: boolean }

export function htmlRisk(html: string): HtmlRisk {
  const css = (html.match(/<style[\s\S]*?<\/style>/gi) ?? []).join('\n') + (html.match(/style="[^"]*"/gi) ?? []).join('\n')
  const grid = /grid-template-columns\s*:\s*([^;}"]+)/gi
  const multiGrid = [...css.matchAll(grid)].some(m => m[1]!.trim().split(/\s+(?![^(]*\))/).length >= 2 && !/^\s*(?:1fr|100%|auto|minmax\([^)]*\))\s*$/.test(m[1]!))
  const columns = /column-count\s*:\s*[2-9]|columns\s*:\s*[2-9]/i.test(css) || multiGrid || /class="[^"]*\b(?:two-col|sidebar|col-(?:md|sm|lg)?-?\d|columns?)\b/i.test(html)
  const header = /<(header|footer)\b[^>]*>([\s\S]*?)<\/\1>/gi
  const contactInHeaderFooter = [...html.matchAll(header)].some(m => /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{8,}/.test(m[2]!))
  return {
    columns,
    tables: (html.match(/<table\b/gi) ?? []).length,
    images: (html.match(/<img\b/gi) ?? []).length + (css.match(/background-image\s*:/gi) ?? []).length,
    textBoxes: (css.match(/position\s*:\s*absolute/gi) ?? []).length,
    iconGlyphs: /class="[^"]*\b(?:fa|fas|fab|far|fal|bi|icon|material-icons|ti)\b[^"]*"/i.test(html) || /[-]/.test(html),
    contactInHeaderFooter,
    floats: /float\s*:\s*(?:left|right)/i.test(css),
  }
}

/** Visible text of the template HTML (what the PDF is supposed to contain). */
export function htmlText(html: string): string {
  return html.replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ')
}

/** Distinct words of `want` that never appear in `have`, for evidence strings. */
export function missingWords(want: string, have: string, limit = 8): string[] {
  const seen = new Set(wordsOf(have))
  return [...new Set(wordsOf(want).filter(w => !seen.has(w)))].slice(0, limit)
}
