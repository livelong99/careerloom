// Debug log mode (Settings → Advanced): while a folder is set, activity is appended there as JSON lines, one file per
// day, so a user can hand the folder over. No electron imports (the Electron hooks live in debug-log-hooks.ts).
// Never throws: logging must not break the app. Secret-looking keys and sk- strings are masked before writing.
import fs from 'node:fs'
import path from 'node:path'

const MASK_KEY = /cookie|authorization|api[_-]?key|password|secret|bearer|credential|^token$|(access|refresh|id|auth|session)[_-]?token/i
// secrets inside free text (error messages, URLs, headers): sk-/fc-/BSA key shapes, Bearer tokens, ?key=/token= query values
const KEYISH = /\b(?:sk|fc)-[A-Za-z0-9_-]{8,}|\bBSA[A-Za-z0-9_-]{16,}|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|([?&](?:api[_-]?key|key|token|access_token)=)[^&\s"']+/gi
const MAX_LINE = 6000

let dir: string | null = null

export const debugLogDir = (): string | null => dir
const fileFor = (d: string, at = new Date()): string => path.join(d, `careerloom-debug-${at.toISOString().slice(0, 10)}.log`)

export function formatLine(src: string, msg: string, data?: unknown, at = new Date()): string {
  const line = JSON.stringify({ t: at.toISOString(), src, msg, ...(data === undefined ? {} : { data }) }, (k, v) => {
    if (k && MASK_KEY.test(k)) return '[hidden]'
    if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack }
    if (typeof v === 'bigint') return String(v)
    return typeof v === 'string' ? v.replace(KEYISH, (m: string, q?: string) => (q ? `${q}…` : /^sk-/i.test(m) ? 'sk-…' : '[hidden]')) : v
  })
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…[truncated ${line.length - MAX_LINE}]` : line
}

export function debugLog(src: string, msg: string, data?: unknown): void {
  if (!dir) return
  try { fs.appendFileSync(fileFor(dir), `${formatLine(src, msg, data)}\n`) } catch { /* best effort */ }
}

/** Turn logging on for an existing folder (throws if it can't be written, so Settings can say why) or off with null. */
export function setDebugLogDir(next: string | null): void {
  if (next === dir) return
  if (next !== null) {
    let isDir = false
    try { isDir = path.isAbsolute(next) && fs.statSync(next).isDirectory() } catch { /* reported below */ }
    if (!isDir) throw new Error('Choose an existing folder for the debug log')
    try { fs.appendFileSync(fileFor(next), `${formatLine('debug', 'log started')}\n`) } catch (err) { // a write probe: surfaces permission errors now
      throw new Error(`Can't write to that folder (${(err as NodeJS.ErrnoException).code ?? 'error'}). Choose another one.`)
    }
  } else debugLog('debug', 'log stopped')
  dir = next
}
