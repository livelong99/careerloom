// Pure (no node/electron imports): shared by the main process and the Runs page.
export const SECRETISH = /cookie|authorization|bearer|api[_-]?key|token|password|secret/i
/** Key-shaped strings (sk-…, sk-or-…) on lines that otherwise look harmless. */
const KEYISH = /\bsk-[A-Za-z0-9_-]{16,}/g
export const REDACTED_LINE = '▒ line hidden — looked like a credential'

/** A log with credential-looking lines replaced (same line count, so step numbers hold; usage lines saying "tokens" are fine) and key-shaped strings masked. */
export function redactLog(text: string): string {
  return text.split('\n').map(l => (SECRETISH.test(l.replace(/\btokens\b/gi, '')) ? REDACTED_LINE : l.replace(KEYISH, 'sk-…'))).join('\n')
}
