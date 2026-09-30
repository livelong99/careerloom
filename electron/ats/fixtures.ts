// Test fixtures only: a synthetic résumé, PDF page builders for layout perturbations and a tiny real PDF writer.
import type { PdfPage } from './types'

export const SAMPLE_CV = `# Sam Doe — Backend Engineer

sam.doe@example.com · +1 415 555 0134 · Pune, India · [LinkedIn](https://linkedin.com/in/samdoe)

## Summary

Backend engineer with six years of experience building payment and reporting services in Node.js, PostgreSQL and Kubernetes.

## Experience

### Senior Backend Engineer — Acme Payments (March 2022–Present)

- Reduced p95 latency by 40% across 12 Node.js services by adding Redis caching and connection pooling
- Migrated 30 services to Kubernetes with Docker and Jenkins, cutting deploy time from 40 to 8 minutes
- Built PostgreSQL reporting pipelines processing 2 million records nightly for the finance team
- Mentored four engineers through code reviews and weekly design sessions, raising review turnaround by 30%

### Backend Engineer — Globex (June 2019–February 2022)

- Designed REST APIs in Node.js serving 1.5 million requests per day with 99.95% uptime over two years
- Automated regression testing with Jest and Playwright, reducing release defects by 35% in four quarters
- Introduced Terraform modules that provisioned staging environments in 15 minutes instead of two days

## Projects

- **Ledger** — Open-source double-entry ledger in TypeScript with PostgreSQL, used by 300 developers worldwide

## Education

### B.Tech in Computer Engineering — Manipal University (July 2015–May 2019)

## Skills

- **Languages:** JavaScript, TypeScript, Python, SQL
- **Tools:** Node.js, Express, PostgreSQL, Redis, Docker, Kubernetes, Terraform, Jenkins, Jest, Playwright, Git
`

const run = (text: string, x: number, y: number, size = 10) => ({ str: text, x, y, w: text.length * size * 0.5, h: size })

/** One-column pages: every line of the markdown (headings and bullets stripped) as its own row, top to bottom. */
export function onePagePdf(md: string, opts: { twoColumns?: boolean; drop?: (line: string) => boolean } = {}): PdfPage[] {
  const lines = md.split('\n').map(l => l.replace(/^#+\s*|^\s*[-*]\s+|\*\*|\[|\]\([^)]*\)/g, '').trim()).filter(Boolean).filter(l => !opts.drop?.(l))
  const items: PdfPage['items'] = []
  lines.forEach((l, i) => {
    const y = 760 - i * 14
    if (opts.twoColumns && i > 6) {
      const mid = Math.ceil(l.length / 2)
      const at = l.lastIndexOf(' ', mid)
      items.push(run(l.slice(0, at), 40, y), run(l.slice(at + 1), 330, y))
    } else items.push(run(l, 40, y))
  })
  return [{ width: 612, height: 792, items }]
}

/** A real, minimal PDF (Helvetica) with the given text lines, for exercising pdf.js end to end. */
export function tinyPdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, '\\$&')
  const stream = `BT /F1 10 Tf 40 760 Td 14 TL ${lines.map(l => `(${esc(l)}) Tj T*`).join(' ')} ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(out)
}

/** Template-like HTML whose visible text is the résumé text (a clean one-column template). */
export const htmlOf = (md: string) => `<html><head><style>body{font:10pt Arial}</style></head><body>${md.replace(/[#*[\]]/g, ' ').replace(/\([^)]*\)/g, ' ').split('\n').map(l => `<p>${l}</p>`).join('')}</body></html>`
