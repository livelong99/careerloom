import type { AtsCategory, AtsSeverity } from '../contract'

/** One positioned text run from a PDF's text layer, in content-stream order. y grows upward (PDF space). */
export type PdfItem = { str: string; x: number; y: number; w: number; h: number }
export type PdfPage = { width: number; height: number; items: PdfItem[] }

/** A problem the scorers found, before the agent writes an Apply for it. */
export type Issue = { id: string; severity: AtsSeverity; category: AtsCategory; title: string; detail: string; evidence?: string }
