import { describe, expect, it, vi } from 'vitest'
import { fitLongEdge, imageTokens, needsScreenshot, userContentWithImage, withOcrFallback } from './vision'

describe('fitLongEdge', () => {
  it('shrinks the long edge to the cap, keeps aspect, never upscales', () => {
    expect(fitLongEdge({ width: 2560, height: 1440 }, 1280)).toEqual({ width: 1280, height: 720 })
    expect(fitLongEdge({ width: 1080, height: 1920 }, 1280)).toEqual({ width: 720, height: 1280 })
    expect(fitLongEdge({ width: 800, height: 600 }, 1280)).toEqual({ width: 800, height: 600 })
  })
})

describe('imageTokens (estimates from provider docs)', () => {
  it('anthropic: ceil(w/28)*ceil(h/28), downscaled to 1568 long edge / 1568 tokens', () => {
    expect(imageTokens('anthropic', 1000, 1000)).toBe(1296)
    expect(imageTokens('anthropic', 1280, 720)).toBe(46 * 26)
    expect(imageTokens('anthropic', 3840, 2160)).toBeLessThanOrEqual(1568)
  })
  it('openai tile: low is 85, high is 85 + 170 per 512px tile after 2048 / 768 fit', () => {
    expect(imageTokens('openai', 1280, 720, 'low')).toBe(85)
    expect(imageTokens('openai', 1280, 720, 'high')).toBe(85 + 170 * 6) // 3x2 tiles of 512 px
  })
  it('gemini: 258 when both sides <= 384, else 258 per tile', () => {
    expect(imageTokens('gemini', 300, 300)).toBe(258)
    expect(imageTokens('gemini', 960, 540)).toBe(6 * 258)
  })
})

describe('userContentWithImage', () => {
  it('puts the image part before the text as an OpenRouter data URL', () => {
    const c = userContentWithImage('what is the bug?', Buffer.from([1, 2, 3]), 'low')
    expect(c[0]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AQID', detail: 'low' } })
    expect(c[1]).toEqual({ type: 'text', text: 'what is the bug?' })
  })
})

describe('needsScreenshot', () => {
  it('fires for on-screen references, not for plain behavioural questions', () => {
    expect(needsScreenshot({ text: 'Can you look at this code and tell me the complexity?', type: 'coding' })).toBe(true)
    expect(needsScreenshot({ text: 'What does the diagram on screen show?', type: 'system-design' })).toBe(true)
    expect(needsScreenshot({ text: 'Tell me about a conflict with a teammate', type: 'behavioural' })).toBe(false)
    expect(needsScreenshot({ text: 'Walk me through this code', type: 'behavioural' })).toBe(false)
  })
})

describe('withOcrFallback', () => {
  it('never awaits OCR on the happy path, uses it only after a vision failure', async () => {
    const ocr = vi.fn(() => new Promise<string>(() => undefined)) // never resolves
    const ok = await withOcrFallback(async () => 'vision-answer', ocr, 'p')
    expect(ok).toBe('vision-answer')
    const fb = await withOcrFallback(async () => { throw new Error('model has no vision') }, async () => 'ocr-text', 'p')
    expect(fb).toBe('ocr-text')
  })
  it('rethrows the vision error when OCR also fails', async () => {
    await expect(withOcrFallback(async () => { throw new Error('v') }, async () => { throw new Error('o') }, 'p')).rejects.toThrow('v')
  })
})
