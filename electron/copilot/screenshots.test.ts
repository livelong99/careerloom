import { mkdtempSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createScreenshotPipeline, ScreenshotError, type ImageLike } from './screenshots'

/** Synthetic image: records resize calls; JPEG bytes are width*height/1000 long so size scales with pixels. */
const img = (width: number, height: number): ImageLike => ({
  getSize: () => ({ width, height }),
  resize: o => img(o.width, o.height),
  toJPEG: () => Buffer.alloc(Math.max(1, Math.round(width * height / 1000))),
})

function setup(over: Partial<Parameters<typeof createScreenshotPipeline>[0]> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'shots-'))
  let t = 1000
  const calls: string[] = []
  const p = createScreenshotPipeline({
    dir, now: () => t, sleep: async () => { calls.push('wait') },
    screenStatus: () => 'granted',
    hideOverlay: () => { calls.push('hide') }, showOverlay: () => { calls.push('show') },
    grab: async () => { calls.push('grab'); return img(2880, 1800) },
    ...over,
  })
  return { p, dir, calls, tick: (ms: number) => { t += ms } }
}

describe('screenshot pipeline', () => {
  it('hides the overlay, waits, grabs, then restores — and downsizes to the long-edge cap as JPEG', async () => {
    const { p, calls } = setup()
    const s = await p.capture()
    expect(calls).toEqual(['hide', 'wait', 'grab', 'show'])
    expect(Math.max(s.width, s.height)).toBe(1280)
    expect(s.width).toBe(1280)
    expect(s.height).toBe(800)
    expect(s.jpeg.length).toBe(s.bytes)
    expect(s.timings).toMatchObject({ captureMs: expect.any(Number), encodeMs: expect.any(Number) })
  })
  it('restores the overlay even when the grab throws', async () => {
    const { p, calls } = setup({ grab: async () => { throw new Error('boom') } })
    await expect(p.capture()).rejects.toThrow('boom')
    expect(calls).toContain('show')
  })
  it('refuses without Screen Recording permission, before touching the overlay', async () => {
    const { p, calls } = setup({ screenStatus: () => 'denied' })
    await expect(p.capture()).rejects.toMatchObject({ code: 'permission' })
    expect(calls).toEqual([])
  })
  it('enforces the per-session image budget', async () => {
    const { p } = setup({ maxPerSession: 2 })
    await p.capture(); await p.capture()
    await expect(p.capture()).rejects.toMatchObject({ code: 'budget' })
    expect(ScreenshotError).toBeDefined()
  })
  it('shares one in-flight capture between concurrent callers', async () => {
    const { p, calls } = setup()
    const [a, b] = await Promise.all([p.capture(), p.capture()])
    expect(a.id).toBe(b.id)
    expect(calls.filter(c => c === 'grab')).toHaveLength(1)
  })
  it('latest() returns a fresh frame only within the max age', async () => {
    const { p, tick } = setup()
    expect(p.latest(5000)).toBeNull()
    const s = await p.capture()
    tick(4000); expect(p.latest(5000)?.id).toBe(s.id)
    tick(2000); expect(p.latest(5000)).toBeNull()
  })
  it('keeps at most maxFrames files (FIFO) and clear() removes the rest', async () => {
    const { p, dir, tick } = setup({ maxFrames: 2 })
    for (let i = 0; i < 4; i++) { await p.capture(); tick(10) }
    expect(readdirSync(dir)).toHaveLength(2)
    p.clear()
    expect(readdirSync(dir)).toHaveLength(0)
    expect(p.latest(1e9)).toBeNull()
  })
  it('files are owner-only and sweep() removes stale frames from a crashed run', async () => {
    const { p, dir } = setup()
    const s = await p.capture()
    expect((statSync(s.path).mode & 0o777)).toBe(0o600)
    writeFileSync(join(dir, 'shot-1-1.jpg'), 'x')
    writeFileSync(join(dir, 'keep.txt'), 'x')
    const fresh = setup({ dir })
    fresh.p.sweep()
    expect(existsSync(join(dir, 'shot-1-1.jpg'))).toBe(false)
    expect(existsSync(join(dir, 'keep.txt'))).toBe(true)
  })
  it('does nothing until capture() is called (no background work)', () => {
    const grab = vi.fn(async () => img(10, 10))
    setup({ grab })
    expect(grab).not.toHaveBeenCalled()
  })
})
