// The PDF's text layer as a parser would read it. The only impure module of the parse side.
// pdf.js is ESM-only; node16 keeps the dynamic import() as a real import, so this works from the CJS main bundle.
import type { PdfPage } from './types'

type Doc = {
  numPages: number
  getPage(n: number): Promise<{ view: number[]; getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }> }> }>
}
type Task = { promise: Promise<Doc>; destroy(): Promise<void> }
type PdfJs = { getDocument(opts: object): Task }
let lib: Promise<PdfJs> | null = null
const load = () => (lib ??= import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJs>)

/** Text runs per page in content-stream order (the order an extractor emits them). Throws when the bytes are not a PDF. */
export async function extractPdfPages(bytes: Uint8Array): Promise<PdfPage[]> {
  const pdfjs = await load()
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 })
  const doc = await task.promise
  try {
    const pages: PdfPage[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const [, , width = 612, height = 792] = page.view
      const content = await page.getTextContent()
      const items = content.items.flatMap(it => (typeof it.str === 'string' ? [{ str: it.str, x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0, w: it.width ?? 0, h: it.height ?? 0 }] : []))
      pages.push({ width, height, items })
    }
    return pages
  } finally {
    await task.destroy()
  }
}
