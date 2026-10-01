// Injection markers, URL/markdown stripping, evidence-span check (plan §9). Page text is data; nothing from it is trusted.
import type { Candidate } from './extract'

const INJECTION = [
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|your)\b[^.\n]{0,40}(instructions?|prompts?|rules?)/i,
  /(forget|override)\s+(all\s+|your\s+)?(previous\s+|prior\s+)?(instructions?|rules?)/i,
  /you\s+are\s+now\s+(a|an|the|in)\b/i,
  /\b(system|developer)\s+(prompt|message)\b/i,
  /(respond|reply|answer|output)\s+(only\s+)?(with|in)\s+(the\s+following\s+)?(json|this)/i,
  /PAGE_DATA|<<<|>>>/,
  /\bnew\s+instructions?\s*:/i,
  /<\s*\/?\s*(system|assistant|instructions?)\s*>/i,
]

/** True when the page tries to instruct the extractor; such pages are dropped and counted, never partially used. */
export const hasInjection = (pageText: string): boolean => INJECTION.some(re => re.test(pageText))

/** Our own wording only: no URLs, markdown, HTML, code fences or control characters, ≤ 300 chars. */
export function sanitize(text: string, max = 300): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/(?:https?:\/\/|ftp:\/\/|www\.)\S+/gi, ' ')
    .replace(/`{1,3}/g, '')
    .replace(/[*_#>~|]{1,}/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export const squash = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const MIN_EVIDENCE = 15

/** The quoted evidence must really occur in the fetched text, so a hallucinated or injected item cannot pass. */
export function evidenceHolds(candidate: Pick<Candidate, 'evidence'>, pageText: string): boolean {
  const ev = squash(candidate.evidence ?? '')
  return ev.length >= MIN_EVIDENCE && squash(pageText).includes(ev)
}
