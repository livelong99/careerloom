// Upserts KEY=VALUE lines in a `.env` file without disturbing the rest of it.
// Values are never logged or returned — callers only ever check presence.
import fs from 'node:fs'

const KEY_RE = /^[A-Z][A-Z0-9_]{0,63}$/

function quote(value: string): string {
  return /[\s#"']/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

export function readEnvPresence(envPath: string, keys: string[]): Record<string, boolean> {
  const present = new Set<string>()
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
      if (m && m[2].trim()) present.add(m[1])
    }
  } catch { /* no .env yet — nothing present */ }
  const out: Record<string, boolean> = {}
  for (const key of keys) out[key] = present.has(key)
  return out
}

/** Sets or clears one KEY in `.env`, preserving every other line. `null` removes it.
 *  `key` must look like an env var name, and `value` may not smuggle a new
 *  line (or line-ending pair) or a NUL into the file. */
export function upsertEnv(envPath: string, key: string, value: string | null): void {
  if (!KEY_RE.test(key)) throw new Error(`Invalid env key: ${key}`)
  if (value !== null && /[\r\n\0]/.test(value)) throw new Error('Env values may not contain newlines or NUL bytes')
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : []
  const re = new RegExp(`^\\s*${key}\\s*=`)
  const next = lines.filter(l => !re.test(l))
  if (value) next.push(`${key}=${quote(value)}`)
  const text = next.join('\n').replace(/\n+$/, '\n')
  fs.writeFileSync(envPath, text.endsWith('\n') || text === '' ? text : `${text}\n`, { mode: 0o600 })
}
