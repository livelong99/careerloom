// Download manifest (build/runtime-manifest.json, written by the installer build): one pinned archive per tool+platform.
import fs from 'node:fs'
import path from 'node:path'

import type { Tool } from './paths'

export type Archive = 'zip' | 'tar.gz' | 'tar.xz'
export type Asset = { url: string; sha256: string; archive: Archive; stripComponents?: number }
export type ToolEntry = { version: string; assets: Record<string, Asset> }
export type Manifest = Partial<Record<Tool, ToolEntry>>

const ARCHIVES: Archive[] = ['zip', 'tar.gz', 'tar.xz']

export function parseManifest(raw: unknown): Manifest {
  if (!raw || typeof raw !== 'object') throw new Error('runtime manifest is not an object')
  const out: Manifest = {}
  for (const tool of ['node', 'python', 'git'] as const) {
    const e = (raw as Record<string, ToolEntry | undefined>)[tool]
    if (!e) continue
    if (typeof e.version !== 'string' || !e.assets || typeof e.assets !== 'object') throw new Error(`runtime manifest: bad entry for ${tool}`)
    for (const [key, a] of Object.entries(e.assets)) {
      if (!/^https:\/\//.test(a.url) || !/^[0-9a-f]{64}$/i.test(a.sha256) || !ARCHIVES.includes(a.archive)) throw new Error(`runtime manifest: bad asset ${tool}/${key}`)
    }
    out[tool] = e
  }
  return out
}

export const pickAsset = (m: Manifest, tool: Tool, platform = process.platform, arch = process.arch): Asset | null => m[tool]?.assets[`${platform}-${arch}`] ?? null

/** Reads the shipped manifest (packaged resources first, then the repo's build/ folder in dev). */
export function readManifest(): Manifest {
  const res = (process as { resourcesPath?: string }).resourcesPath
  const candidates = [res && path.join(res, 'runtime-manifest.json'), res && path.join(res, 'build', 'runtime-manifest.json'), path.join(__dirname, '..', '..', 'build', 'runtime-manifest.json'), path.join(process.cwd(), 'build', 'runtime-manifest.json')]
  for (const file of candidates) {
    if (file && fs.existsSync(file)) return parseManifest(JSON.parse(fs.readFileSync(file, 'utf8')))
  }
  throw new Error('runtime manifest not found')
}
