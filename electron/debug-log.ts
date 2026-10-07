// Debug log mode (Settings → Advanced): while a folder is set, activity is appended there as JSON lines, one file per
// day, so a user can hand the folder over. No electron imports (the Electron hooks live in debug-log-hooks.ts).
// Never throws: logging must not break the app. Secret-looking keys and sk- strings are masked before writing.
import fs from 'node:fs'
import path from 'node:path'

const MASK_KEY = /cookie|authorization|api[_-]?key|password|secret|bearer|^token$|access[_-]?token/i
const KEYISH = /\bsk-[A-Za-z0-9_-]{8,}/g
const MAX_LINE = 6000

let dir: string | null = null

export const debugLogDir = (): string | null => dir
const fileFor = (d: string, at = new Date()): string => path.join(d, `careerloom-debug-${at.toISOString().slice(0, 10)}.log`)

export function formatLine(src: string, msg: string, data?: unknown, at = new Date()): string {
  const line = JSON.stringify({ t: at.toISOString(), src, msg, ...(data === undefined ? {} : { data }) }, (k, v) => {
    if (k && MASK_KEY.test(k)) return '[hidden]'
    if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack }
    if (typeof v === 'bigint') return String(v)
    return typeof v === 'string' ? v.replace(KEYISH, 'sk-…') : v
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
    if (!path.isAbsolute(next) || !fs.statSync(next).isDirectory()) throw new Error('Choose an existing folder for the debug log')
    fs.appendFileSync(fileFor(next), `${formatLine('debug', 'log started')}\n`) // a write probe: surfaces permission errors now
  } else debugLog('debug', 'log stopped')
  dir = next
}
