// Adaptive end-of-turn (PERF-2): once the speaker has been quiet for a short floor, decode early; if the text is a finished
// sentence the final goes out now instead of after the full endSilenceMs. Audio-clock only, like the rest of the chunker.
const SENTENCE_END = /[.?!]["”')\]]*$/
const ABBREV = /\b(?:e\.g|i\.e|etc|vs|mr|mrs|dr|inc|approx)\.$/i

/** The text ends like a finished sentence ("…?", "….", "…!"), not mid-clause or after an abbreviation. */
export const isSentenceFinal = (text: string): boolean => {
  const t = text.trim()
  return SENTENCE_END.test(t) && !ABBREV.test(t) && !/\.\.\.$|…$/.test(t)
}

/** A "?" ends a turn at once; so does a short standalone prompt ("Tell me about yourself."). Any other finished sentence ("We had an outage last quarter.") is context that a question usually follows. */
const PROMPT = /^(?:(?:so|okay|ok|alright|now|and)[,.]?\s+)?(?:tell me|walk me through|talk me through|describe|explain|introduce yourself)\b/i
export const endsTurn = (text: string): boolean => {
  const t = text.trim()
  return isSentenceFinal(t) && (/\?["”')\]]*$/.test(t) || (PROMPT.test(t) && t.split(/\s+/).length <= 10))
}
/** Extra quiet, beyond endSilenceMs, before a turn that did not end on a question/prompt is final: a thinking pause or "um…" inside a long question runs 1-1.5 s and must not split it. */
export const CONT_EXTRA_MS = 1250
/** The text trails off mid-thought ("…and", "…the", "um", a comma): the speaker is searching for words, and a 2-3 s pause is still the same question. */
const TRAILING = /(?:[,;:\-–—]|…|\.\.\.|\b(?:and|but|so|or|because|that|which|who|the|a|an|to|of|with|for|in|on|at|from|about|if|when|how|what|why|where|um+|uh+|er+|erm|like|you know))\s*$/i
export const TRAILING_EXTRA_MS = 3000
/** Extra quiet, beyond endSilenceMs, before an unfinished turn is final: longer when `text` (the early decode, if it has landed) trails off. */
export const holdExtraMs = (text: string | null): number => (text && TRAILING.test(text.trim()) ? TRAILING_EXTRA_MS : CONT_EXTRA_MS)

/** Quiet needed before the early decode: 160-250 ms, about a third of the configured wait. */
export const earlyEndMs = (endSilenceMs: number): number => Math.min(250, Math.max(160, Math.round(endSilenceMs * 0.35)))

/** Normalised text for duplicate-final checks: case, punctuation and spacing differences do not make a new utterance. */
export const normFinal = (t: string): string => t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
