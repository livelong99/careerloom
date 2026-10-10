// Shared types for the skill registry and for run attachments. The contract is described in
// docs/architecture/engine-and-skills.md §8; keep the two in step.

export type SkillSource =
  | { kind: 'git'; url: string; ref?: string; subdir?: string }
  | { kind: 'folder'; path: string }
  | { kind: 'zip'; path: string }

/** What an install would add, shown to the user before anything is copied. */
export type SkillPreview = {
  id: string
  name: string
  description: string
  version: string | null
  source: SkillSource
  sizeBytes: number
  fileCount: number
  /** Relative paths of files that can execute (scripts/, *.sh, *.py, *.mjs …). */
  scripts: string[]
  /** Capabilities the skill declares in careerloom.json. */
  provides: string[]
  /** Non-fatal findings: binaries, very large files, missing optional fields. */
  warnings: string[]
  /** True when an installed skill with this id already exists. */
  replaces: boolean
}

export type InstalledSkill = {
  id: string
  name: string
  description: string
  version: string | null
  source: SkillSource
  /** Hash of the installed folder; used to detect changes on update. */
  hash: string
  path: string
  enabled: boolean
  installedAt: string
  sizeBytes: number
  hasScripts: boolean
  provides: string[]
}

/** A file the user attached to an Agent message, stored under <userData>/attachments/<runId>/. */
export type Attachment = {
  id: string
  name: string
  mime: string
  bytes: number
  /** Absolute path in the attachments folder. */
  path: string
}

export const ATTACHMENT_LIMITS = { maxFiles: 6, maxBytes: 8 * 1024 * 1024, mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] } as const
export const SKILL_LIMITS = { maxBytes: 5 * 1024 * 1024, maxFiles: 500 } as const
