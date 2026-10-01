// Screenshot → vision helpers: sizing, token estimates, the image message part, the "does this need the screen" rule,
// and OCR as an offline fallback that is never awaited on the critical path (plan §WP5 M3).
import type { DetectedQuestion } from './types'

export type Size = { width: number; height: number }
/** Shrinks the long edge to `max` keeping aspect ratio; never upscales. */
export function fitLongEdge(s: Size, max: number): Size {
  const long = Math.max(s.width, s.height)
  if (long <= max) return { width: s.width, height: s.height }
  const k = max / long
  return { width: Math.round(s.width * k), height: Math.round(s.height * k) }
}

export type ImageFamily = 'anthropic' | 'openai' | 'gemini'
/**
 * Input-token ESTIMATE for one image, from each provider's published formula (not measured):
 * - anthropic (standard tier): ceil(w/28)*ceil(h/28), image first downscaled to ≤1568 long edge and ≤1568 tokens
 *   (platform.claude.com/docs/en/build-with-claude/vision).
 * - openai tile models (GPT-4o/4.1): low = 85; high = fit 2048², shortest side → 768, then 85 + 170 per 512 px tile
 *   (developers.openai.com/api/docs/guides/images-vision). Mini/nano and patch models use other multipliers.
 * - gemini: 258 when both sides ≤384, else 258 per tile, crop unit floor(min/1.5) clamped to 256..768
 *   (ai.google.dev/gemini-api/docs/image-understanding; the clamp is from memory of that page).
 */
export function imageTokens(family: ImageFamily, width: number, height: number, detail: 'low' | 'high' = 'high'): number {
  if (family === 'anthropic') {
    let s = fitLongEdge({ width, height }, 1568)
    while (Math.ceil(s.width / 28) * Math.ceil(s.height / 28) > 1568) s = { width: Math.floor(s.width * 0.97), height: Math.floor(s.height * 0.97) }
    return Math.ceil(s.width / 28) * Math.ceil(s.height / 28)
  }
  if (family === 'openai') {
    if (detail === 'low') return 85
    let s = fitLongEdge({ width, height }, 2048)
    const short = Math.min(s.width, s.height)
    if (short > 768) { const k = 768 / short; s = { width: Math.round(s.width * k), height: Math.round(s.height * k) } }
    return 85 + 170 * Math.ceil(s.width / 512) * Math.ceil(s.height / 512)
  }
  if (width <= 384 && height <= 384) return 258
  const crop = Math.min(768, Math.max(256, Math.floor(Math.min(width, height) / 1.5)))
  return 258 * Math.ceil(width / crop) * Math.ceil(height / crop)
}

export type ImagePart = { type: 'image_url'; image_url: { url: string; detail: 'low' | 'high' | 'auto' } }
export type TextPart = { type: 'text'; text: string }
/** OpenRouter chat-completions user content with a base64 JPEG; image first (providers answer better that way). */
export function userContentWithImage(text: string, jpeg: Buffer, detail: 'low' | 'high' | 'auto' = 'high'): [ImagePart, TextPart] {
  return [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail } }, { type: 'text', text }]
}

const ON_SCREEN = /\b(on[- ](my |the |your )?screen|this (code|diagram|problem|function|snippet|query|page|slide|chart|error)|(look|looking) at|shown|see here|in front of you|above|below)\b/i
/** Routing rule for "pre-capture on end-of-turn": only coding / design questions that point at something visible. */
export function needsScreenshot(q: Pick<DetectedQuestion, 'text' | 'type'>): boolean {
  return (q.type === 'coding' || q.type === 'system-design') && ON_SCREEN.test(q.text)
}

/**
 * Runs the vision request; OCR is started in parallel (offline fallback) but only awaited if vision throws.
 * Callers pass the OCR thunk lazily, e.g. tesseract.js; it is never on the critical path.
 */
export async function withOcrFallback<T>(vision: () => Promise<T>, ocr: (p: string) => Promise<T>, imagePath: string): Promise<T> {
  const fallback = ocr(imagePath)
  fallback.catch(() => undefined) // a late OCR failure must not become an unhandled rejection
  try { return await vision() } catch (e) {
    try { return await fallback } catch { throw e }
  }
}
