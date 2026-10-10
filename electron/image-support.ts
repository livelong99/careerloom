// Pure helpers for Agent-chat image attachments: no node or electron imports, so the renderer
// shares them (composer limits) with the main process (validation, per-runner arguments).
import { ATTACHMENT_LIMITS, type Attachment } from './skills/types'

export type ImageMime = (typeof ATTACHMENT_LIMITS.mimes)[number]

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v)

/** The image type a file really is, from its first bytes (never from its name or claimed type). */
export function sniffMime(b: Uint8Array): ImageMime | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38]) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif'
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  return null
}

export const EXT: Record<ImageMime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

export type Rejection = { name: string; reason: string }
const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`

/** Pre-check by claimed type and size (renderer, before reading bytes). Magic bytes are re-checked in main. */
export function checkCandidate(file: { name: string; type: string; size: number }, existing: number): string | null {
  if (existing >= ATTACHMENT_LIMITS.maxFiles) return `Only ${ATTACHMENT_LIMITS.maxFiles} images per message`
  if (!(ATTACHMENT_LIMITS.mimes as readonly string[]).includes(file.type)) return 'Not a PNG, JPEG, WebP or GIF image'
  if (file.size > ATTACHMENT_LIMITS.maxBytes) return `Larger than ${mb(ATTACHMENT_LIMITS.maxBytes)}`
  if (file.size === 0) return 'The file is empty'
  return null
}

/** Models that accept image input. Unknown ids are treated as text-only for in-process runs. */
const VISION = /claude|gpt-?[45]|o[34]\b|gemini|gemma-?3|qwen.*vl|vl\b|vision|kimi|grok|llama-?4|pixtral|mistral-(medium|large)|glm-4\.[5-9]v/i

/** Whether the active runner/model can read images. CLI runners with no model set use their own (vision) default. */
export function supportsImages(runner: string, model?: string | null): { ok: boolean; reason?: string } {
  switch (runner) {
    case 'claude': case 'codex': case 'antigravity': return { ok: true }
    case 'opencode': return !model || VISION.test(model) ? { ok: true } : { ok: false, reason: `${model} cannot read images — switch model` }
    case 'zen': return model && VISION.test(model) ? { ok: true } : { ok: false, reason: `${model ?? 'This model'} cannot read images — switch model` }
    default: return { ok: false, reason: 'This runner cannot read images — switch to Claude Code, Codex, Antigravity, OpenCode or Zen' }
  }
}

export type ImageArgs = {
  /** Flags placed before the prompt (codex/opencode); end with `--` so a variadic flag cannot swallow the prompt. */
  flags: string[]
  /** Folders the agent must be allowed to read. */
  addDirs: string[]
  /** Appended to the prompt when the runner reads images by path. */
  note: string
  /** Set when this runner/model cannot use the images: show it, do not start the run. */
  error?: string
}

const none: ImageArgs = { flags: [], addDirs: [], note: '' }
const dirOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')))
const listing = (a: Attachment[]) => `\n\nAttached images (read them from these paths):\n${a.map(x => `- ${x.path}`).join('\n')}`

/** The one place that knows how each runner receives images. zen/api content parts are built in zen-agent. */
export function imageArgs(runner: string, attachments: Attachment[], model?: string | null): ImageArgs {
  if (!attachments.length) return none
  const cap = supportsImages(runner, model)
  if (!cap.ok) return { ...none, error: cap.reason }
  const paths = attachments.map(a => a.path)
  switch (runner) {
    case 'codex': return { ...none, flags: [...paths.flatMap(p => ['-i', p]), '--'] }
    case 'opencode': return { ...none, flags: [...paths.flatMap(p => ['-f', p]), '--'] }
    case 'claude': case 'antigravity': return { ...none, addDirs: [...new Set(paths.map(dirOf))], note: listing(attachments) }
    default: return none // zen: image parts are added to the request itself
  }
}
