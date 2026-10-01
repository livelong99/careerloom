// Builds the self-contained prompt a user pastes into any agent CLI when a setup step fails. Pure.
import os from 'node:os'

export type FailureInput = {
  stepId: string
  label: string
  command: string | null
  exitCode: number | null
  error: string
  log: string
  /** Shell command that proves the step is fixed. */
  verify: string
  runtimeDir: string
  platform?: string
  arch?: string
  osVersion?: string
  home?: string
  user?: string
}

const TAIL_LINES = 60
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Hide the home path / user name and anything that looks like a secret. */
export function redact(text: string, home = os.homedir(), user = safeUser()): string {
  let out = text
  const parts = home.split(/[\\/]+/).filter(Boolean).map(esc)
  if (parts.length) out = out.replace(new RegExp(`${/^[\\/]/.test(home) ? '[\\\\/]+' : ''}${parts.join('[\\\\/]+')}`, 'gi'), '~')
  if (user) {
    // 1-2 char names only as a whole path segment, so ordinary words aren't mangled
    const re = user.length >= 3 ? `(?<![\\w])${esc(user)}(?![\\w])` : `(?<=[\\\\/])${esc(user)}(?=[\\\\/\\s:'"]|$)`
    out = out.replace(new RegExp(re, 'gi'), '<user>')
  }
  return out
    .replace(/\/\/[^\s/@]+@/g, '//<redacted>@') // user:pass@ in URLs
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>')
    .replace(/\b(?:sk|pk|ghp|gho|ghs|github_pat|xox[a-z]|AKIA|AIza)[-_A-Za-z0-9]{12,}/g, '<redacted>')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer <redacted>')
    .replace(/((?:api[_-]?key|token|secret|password|passwd|authorization|auth)["']?\s*[=:]\s*["']?)[^\s"'&]+/gi, '$1<redacted>')
    .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, '<redacted>')
}

function safeUser(): string {
  try { return os.userInfo().username } catch { return '' }
}

export const lastLines = (text: string, n = TAIL_LINES) => text.replace(/\r/g, '').split('\n').filter(l => l.trim()).slice(-n).join('\n')

export function buildFailurePrompt(i: FailureInput): string {
  const home = i.home ?? os.homedir()
  const user = i.user ?? safeUser()
  const r = (t: string) => redact(t, home, user)
  const tail = r(lastLines(i.log))
  return `# Fix a failed Careerloom setup step

I'm using Careerloom, a desktop app. On first launch it installs the tools it needs by itself. One step failed and I need you to fix it for me.

## What failed
- Step: \`${i.stepId}\` (${i.label})
- Problem: ${r(i.error)}
- Command: \`${i.command ? r(i.command) : 'n/a (in-app step)'}\`${i.exitCode === null ? '' : ` — exit code ${i.exitCode}`}
- Platform: ${i.platform ?? process.platform} ${i.arch ?? process.arch}, OS ${i.osVersion ?? os.release()}
- Careerloom's own tools live in: \`${r(i.runtimeDir)}\` (node, python, git, and npm global CLIs under \`npm/\`)

## Last log lines
\`\`\`
${tail || '(no output)'}
\`\`\`

## What I need you to do
1. Diagnose the cause from the log above (network/proxy, disk space, permissions, antivirus, missing system tool, etc.).
2. Fix it without sudo / administrator rights where possible.
3. Install anything missing ONLY into \`${r(i.runtimeDir)}\` — don't change system-wide Node, Python or Git.
4. Verify it's fixed by running: \`${i.verify}\`
5. Then tell me to press **Retry** in Careerloom.

Keep explanations short and in plain language.
`
}
