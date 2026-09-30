// Replaces names/emails/phones in transcript text with tokens before any LLM call (regex MVP; plan §3.4, §9).
export type Redactor = (text: string) => string

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const PHONE = /(?<![\w])\+?\d[\d\s().-]{5,}\d(?![\w])/g
// Self-introductions and titled names: the only places a name is reliably a name in speech-to-text output.
// ponytail: any capitalised word after "I'm" is masked ("I'm Docker-certified" loses "Docker"); an NER model is the upgrade if that bites.
const INTRO = /\b((?:[Mm]y name is|[Ii] am|[Ii]'m|[Tt]his is|[Cc]all me|[Ii]t's)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g
const TITLED = /\b(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `names` are known people (the user, the interviewer) that should be masked wherever they appear. */
export function createRedactor(names: string[] = []): Redactor {
  const known = names.map(n => n.trim()).filter(n => n.length > 1)
  const knownRe = known.length ? new RegExp(`\\b(?:${known.map(escapeRe).join('|')})\\b`, 'gi') : null
  return text => {
    let t = text.replace(EMAIL, '[EMAIL]').replace(TITLED, '[NAME]').replace(INTRO, (_m, lead: string) => `${lead}[NAME]`)
    // Phones after emails so digits inside an address are already gone; 7+ digits keeps "2024" and "3 to 5" intact.
    t = t.replace(PHONE, m => (m.replace(/\D/g, '').length >= 7 ? '[PHONE]' : m))
    return knownRe ? t.replace(knownRe, '[NAME]') : t
  }
}

export const redact: Redactor = createRedactor()
