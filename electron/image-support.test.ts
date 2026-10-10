import { describe, expect, it } from 'vitest'
import { checkCandidate, imageArgs, sniffMime, supportsImages } from './image-support'
import { ATTACHMENT_LIMITS, type Attachment } from './skills/types'

const bytes = (...v: number[]) => Uint8Array.from([...v, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const att = (n: number): Attachment => ({ id: `a${n}`, name: `s${n}.png`, mime: 'image/png', bytes: 10, path: `/data/attachments/t1/s${n}.png` })

describe('sniffMime', () => {
  it('reads the type from magic bytes', () => {
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffMime(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('image/gif')
    expect(sniffMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp')
  })
  it('rejects look-alikes (RIFF wav, text, svg, empty)', () => {
    expect(sniffMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull()
    expect(sniffMime(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniffMime(new Uint8Array())).toBeNull()
  })
})

describe('checkCandidate', () => {
  const ok = { name: 'a.png', type: 'image/png', size: 1000 }
  it('accepts a normal image', () => expect(checkCandidate(ok, 0)).toBeNull())
  it('enforces count, type and size limits', () => {
    expect(checkCandidate(ok, ATTACHMENT_LIMITS.maxFiles)).toMatch(/Only 6/)
    expect(checkCandidate({ ...ok, type: 'application/pdf' }, 0)).toMatch(/Not a PNG/)
    expect(checkCandidate({ ...ok, size: ATTACHMENT_LIMITS.maxBytes + 1 }, 0)).toMatch(/Larger than 8 MB/)
    expect(checkCandidate({ ...ok, size: 0 }, 0)).toMatch(/empty/)
  })
})

describe('imageArgs', () => {
  it('is a no-op without attachments', () => expect(imageArgs('claude', [])).toEqual({ flags: [], addDirs: [], note: '' }))
  it('codex: -i per file, then -- before the prompt', () => {
    expect(imageArgs('codex', [att(1), att(2)]).flags).toEqual(['-i', att(1).path, '-i', att(2).path, '--'])
  })
  it('opencode: -f per file, then --', () => {
    expect(imageArgs('opencode', [att(1)], 'anthropic/claude-sonnet').flags).toEqual(['-f', att(1).path, '--'])
  })
  it('claude and agy: path in the prompt plus read access to the folder', () => {
    for (const r of ['claude', 'antigravity']) {
      const out = imageArgs(r, [att(1), att(2)])
      expect(out.addDirs).toEqual(['/data/attachments/t1'])
      expect(out.note).toContain(att(2).path)
    }
  })
  it('reports a clear error for text-only models and the api runner', () => {
    expect(imageArgs('zen', [att(1)], 'big-pickle').error).toMatch(/cannot read images — switch model/)
    expect(imageArgs('opencode', [att(1)], 'deepseek-chat').error).toMatch(/switch model/)
    expect(imageArgs('api', [att(1)]).error).toMatch(/cannot read images/)
  })
  it('zen with a vision model passes no CLI args', () => {
    expect(imageArgs('zen', [att(1)], 'claude-sonnet-4-5')).toEqual({ flags: [], addDirs: [], note: '' })
    expect(supportsImages('zen', null).ok).toBe(false)
  })
})
