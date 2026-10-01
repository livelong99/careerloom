// API-key manager: one registry entry per provider. Secrets stay in safeStorage (`<name>.key`, via
// context.readSecret/writeSecret); callers only ever get `hasKey` + the last four characters.
import { readSecret, readSettings, writeSecret, writeSettings } from '../context'
import { KEY_IDS } from './prefs'
import type { KeyId, KeyInfo, KeyTest } from './types'

type KeyDef = {
  label: string
  usedBy: string[]
  neededByRunners: string[]
  optional: boolean
  helpUrl: string | null
  formatHint: string
  /** Throws a user-facing message that must not contain the value. */
  validate: (value: string) => void
}

const must = (re: RegExp, message: string) => (v: string) => { if (!re.test(v)) throw new Error(message) }

export const KEY_DEFS: Record<KeyId, KeyDef> = {
  openrouter: {
    label: 'OpenRouter', usedBy: ['API runner', 'Interview Copilot answers'], neededByRunners: ['api'], optional: false,
    helpUrl: 'https://openrouter.ai/keys', formatHint: 'Starts with sk-or-',
    validate: must(/^sk-or-[\w-]{10,}$/, 'That does not look like an OpenRouter key (sk-or-…)'),
  },
  opencode: {
    label: 'OpenCode Zen', usedBy: ['OpenCode CLI (paid models)', 'OpenCode Zen runner'], neededByRunners: ['zen'], optional: true,
    helpUrl: 'https://opencode.ai/auth', formatHint: '16–200 characters: letters, digits, . _ -',
    validate: must(/^[\w.-]{16,200}$/, 'That does not look like an OpenCode Zen API key'),
  },
  firecrawl: {
    label: 'Firecrawl', usedBy: ['Any-site job boards (self-hosted, local)'], neededByRunners: [], optional: true,
    helpUrl: null, formatHint: '8–200 characters, no spaces. Only needed if your own stack enforces auth',
    validate: must(/^\S{8,200}$/, 'A Firecrawl API key is 8–200 characters with no spaces'),
  },
  brave: {
    label: 'Brave Search', usedBy: ['Job knowledge base research'], neededByRunners: [], optional: true,
    helpUrl: 'https://api-dashboard.search.brave.com/', formatHint: 'Starts with BSA, 20–80 letters, digits, - or _',
    validate: must(/^BSA[\w-]{17,77}$/, 'That does not look like a Brave Search key (BSA…)'),
  },
  exa: {
    label: 'Exa', usedBy: ['Job knowledge base research (fallback)'], neededByRunners: [], optional: true,
    helpUrl: 'https://dashboard.exa.ai/api-keys', formatHint: '16–100 characters: letters, digits, - or _',
    validate: must(/^[\w-]{16,100}$/, 'That does not look like an Exa API key'),
  },
  serper: {
    label: 'Serper', usedBy: ['Job knowledge base research (fallback)'], neededByRunners: [], optional: true,
    helpUrl: 'https://serper.dev/api-key', formatHint: '16–100 characters: letters, digits',
    validate: must(/^[A-Za-z0-9]{16,100}$/, 'That does not look like a Serper API key'),
  },
}

/** Secret file name per key (kept stable: existing installs already have these files). */
export const secretName = (id: KeyId): string => id

export function isKeyId(v: unknown): v is KeyId { return typeof v === 'string' && (KEY_IDS as readonly string[]).includes(v) }

export function keyInfo(id: KeyId): KeyInfo {
  const def = KEY_DEFS[id]
  const value = readSecret(secretName(id))
  return {
    id, label: def.label, hasKey: value !== null, tail: value ? value.slice(-4) : null, optional: def.optional,
    usedBy: def.usedBy, neededByRunners: def.neededByRunners, helpUrl: def.helpUrl, formatHint: def.formatHint,
    lastTest: readSettings().keyMeta[id] ?? null,
  }
}

export const keysList = (): KeyInfo[] => KEY_IDS.map(keyInfo)

/** Validate, then store (value) or remove (null). Any stored test result described the old key, so it is dropped. */
export function setKey(id: KeyId, value: string | null): KeyInfo {
  const trimmed = value === null ? null : value.trim()
  if (trimmed) KEY_DEFS[id].validate(trimmed)
  writeSecret(secretName(id), trimmed || null)
  const { [id]: _dropped, ...keyMeta } = readSettings().keyMeta
  writeSettings({ keyMeta })
  return keyInfo(id)
}

export function recordTest(id: KeyId, result: KeyTest): KeyTest {
  writeSettings({ keyMeta: { ...readSettings().keyMeta, [id]: result } })
  return result
}
