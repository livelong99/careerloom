// Ported from Open-Cluely (owner's project), adapted for Careerloom: main-process/features/assistant/screenshot-manager.js
// (FIFO cap, cleanup on clear/quit). Changes: window is hidden (never an opacity trick), frames are downsized + JPEG-encoded
// in-process (no OCR on the critical path), files are owner-only temp files with a crash sweep, plus a per-session budget.
// Nothing here runs until capture() is called; the caller gates it on `engine.vision` and the Screenshot action.
import { chmodSync, existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fitLongEdge } from './vision'
import type { PermStatus } from './types'

/** The slice of Electron's NativeImage we use, so tests (and non-Electron benches) can supply synthetic images. */
export interface ImageLike {
  getSize(): { width: number; height: number }
  resize(o: { width: number; height: number; quality?: 'good' | 'better' | 'best' }): ImageLike
  toJPEG(quality: number): Buffer
}

export type Shot = {
  id: string; path: string; jpeg: Buffer; width: number; height: number; bytes: number; at: number
  timings: { captureMs: number; encodeMs: number }
}
export class ScreenshotError extends Error {
  constructor(readonly code: 'permission' | 'budget' | 'capture', message: string) { super(message) }
}

export type ScreenshotDeps = {
  dir: string
  /** desktopCapturer.getSources thumbnail of the display under the overlay; `size` is a hint for the capturer. */
  grab(size: { width: number; height: number }): Promise<ImageLike | null>
  screenStatus(): PermStatus
  hideOverlay(): void
  showOverlay(): void
  /** Request size hint, usually the display size in DIPs. */
  displaySize?: () => { width: number; height: number }
  maxLongEdge?: number   // default 1280
  quality?: number       // JPEG quality, default 70
  hideDelayMs?: number   // compositor needs a frame to drop the hidden window, default 120
  maxFrames?: number     // FIFO cap on retained frames, default 3
  maxPerSession?: number // image budget per session, default 20
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export interface ScreenshotPipeline {
  capture(): Promise<Shot>
  /** The newest frame no older than `maxAgeMs` (pre-capture cache), else null. */
  latest(maxAgeMs: number): Shot | null
  /** Deletes every retained frame and forgets them (session end, quit, panic). */
  clear(): void
  /** Removes frames left by a crashed run; call once at startup. */
  sweep(): void
  readonly taken: number
}

const PREFIX = 'shot-'
export function createScreenshotPipeline(deps: ScreenshotDeps): ScreenshotPipeline {
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)))
  const maxEdge = deps.maxLongEdge ?? 1280
  const maxFrames = deps.maxFrames ?? 3
  const budget = deps.maxPerSession ?? 20
  let frames: Shot[] = []
  let taken = 0
  let inflight: Promise<Shot> | null = null

  const drop = (s: Shot) => { try { unlinkSync(s.path) } catch { /* already gone */ } }

  async function run(): Promise<Shot> {
    if (deps.screenStatus() !== 'granted') throw new ScreenshotError('permission', 'Screen Recording permission is not granted')
    if (taken >= budget) throw new ScreenshotError('budget', `Screenshot limit of ${budget} per session reached`)
    taken++
    const t0 = now()
    let raw: ImageLike | null
    deps.hideOverlay()
    try {
      await sleep(deps.hideDelayMs ?? 120)
      raw = await deps.grab(deps.displaySize?.() ?? { width: maxEdge, height: maxEdge })
    } finally { deps.showOverlay() }
    if (!raw) throw new ScreenshotError('capture', 'No screen image returned')
    const t1 = now()
    const size = raw.getSize()
    const target = fitLongEdge(size, maxEdge)
    const small = target.width === size.width && target.height === size.height ? raw : raw.resize({ ...target, quality: 'good' })
    const jpeg = small.toJPEG(deps.quality ?? 70)
    const t2 = now()
    mkdirSync(deps.dir, { recursive: true, mode: 0o700 })
    const id = `${PREFIX}${t1}-${taken}`
    const path = join(deps.dir, `${id}.jpg`)
    writeFileSync(path, jpeg, { mode: 0o600 })
    chmodSync(path, 0o600)
    const shot: Shot = { id, path, jpeg, ...target, bytes: jpeg.length, at: t2, timings: { captureMs: t1 - t0, encodeMs: t2 - t1 } }
    frames.push(shot)
    while (frames.length > maxFrames) drop(frames.shift()!)
    return shot
  }

  return {
    capture: () => (inflight ??= run().finally(() => { inflight = null })),
    latest: maxAgeMs => { const s = frames[frames.length - 1]; return s && now() - s.at <= maxAgeMs ? s : null },
    clear: () => { frames.forEach(drop); frames = [] },
    sweep: () => {
      if (!existsSync(deps.dir)) return
      for (const f of readdirSync(deps.dir)) if (f.startsWith(PREFIX) && f.endsWith('.jpg')) try { unlinkSync(join(deps.dir, f)) } catch { /* ignore */ }
    },
    get taken() { return taken },
  }
}
