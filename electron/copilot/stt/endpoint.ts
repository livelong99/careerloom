// Adaptive end-of-turn (PERF-2): once the speaker has been quiet for a short floor, decode early; if the text is a finished
// sentence the final goes out now instead of after the full endSilenceMs. Audio-clock only, like the rest of the chunker.
const SENTENCE_END = /[.?!]["”')\]]*$/
const ABBREV = /\b(?:e\.g|i\.e|etc|vs|mr|mrs|dr|inc|approx)\.$/i

/** The text ends like a finished sentence ("…?", "….", "…!"), not mid-clause or after an abbreviation. */
export const isSentenceFinal = (text: string): boolean => {
  const t = text.trim()
  return SENTENCE_END.test(t) && !ABBREV.test(t) && !/\.\.\.$|…$/.test(t)
}

/** Quiet needed before the early decode: 160-250 ms, about a third of the configured wait. */
export const earlyEndMs = (endSilenceMs: number): number => Math.min(250, Math.max(160, Math.round(endSilenceMs * 0.35)))

/** Normalised text for duplicate-final checks: case, punctuation and spacing differences do not make a new utterance. */
export const normFinal = (t: string): string => t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
