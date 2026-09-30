export type DocKind = 'resume' | 'cover'
export type Artifact = {
  id: string
  jobId: string
  kind: DocKind
  /** Folder relative to the career-ops folder (output/careerloom/<reportNum|hash>-<slug>). */
  dir: string
  /** Files by role, relative to the career-ops folder: md, pdf, changes. */
  files: { md: string; pdf: string | null; changes?: string; /** The cover letter before the humanizer pass. */ draft?: string }
  createdAt: number
  inputHash: string
  model: string | null
  tokens: number
  humanized: boolean
  humanizeTokens: number
  gate: { ok: boolean; notes: string[]; applied?: number; rejected?: number; tells?: string[]; tellsBefore?: string[] }
}
export type DocsOptions = { tone?: 'concise' | 'warm' | 'formal'; length?: 'short' | 'standard'; humanize?: boolean; voiceSample?: string }
export type DocsEvent = { jobId: string; kind: DocKind; phase: 'start' | 'draft' | 'humanize' | 'pdf' | 'done' | 'error'; message: string; artifact?: Artifact }
