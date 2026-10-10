// Pure helpers for the in-app updater: which release asset fits this machine, whether a URL
// is one we trust to download from, and why an install cannot run here.
import path from 'node:path'

/** GitHub `owner/name` that publishes Careerloom releases (tags `vX.Y.Z`). */
export const RELEASES_REPO = 'livelong99/careerloom'

export type ReleaseAsset = { name: string; size: number; url: string; sha256: string | null }
type RawAsset = { name?: unknown; size?: unknown; browser_download_url?: unknown; digest?: unknown }

/** "sha256:<64 hex>" (GitHub's per-asset digest) → the hex, else null. */
export function parseDigest(d: unknown): string | null {
  const m = typeof d === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(d) : null
  return m ? m[1]!.toLowerCase() : null
}

/** The asset the updater installs: the macOS zip for this CPU, or the Windows installer. Null elsewhere. */
export function pickAsset(assets: unknown, version: string, platform: string, arch: string): ReleaseAsset | null {
  const want = platform === 'darwin' ? `Careerloom-${version}-${arch === 'arm64' ? 'arm64' : 'x64'}.zip` : platform === 'win32' ? `Careerloom-Setup-${version}.exe` : null
  if (!want || !Array.isArray(assets)) return null
  const a = (assets as RawAsset[]).find(x => x?.name === want)
  if (!a || typeof a.browser_download_url !== 'string' || typeof a.size !== 'number') return null
  return { name: want, size: a.size, url: a.browser_download_url, sha256: parseDigest(a.digest) }
}

const DOWNLOAD_PREFIX = `/${RELEASES_REPO}/releases/download/`
/** Only our own release assets, over https. */
export function trustedAssetUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(DOWNLOAD_PREFIX)
  } catch { return false }
}
/** GitHub serves release downloads from these hosts after a redirect. */
export function trustedFinalUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && (u.hostname === 'github.com' || u.hostname.endsWith('.githubusercontent.com'))
  } catch { return false }
}

/** `/Applications/Careerloom.app/Contents/MacOS/Careerloom` → `/Applications/Careerloom.app`. */
export function bundlePathFromExe(exe: string): string | null {
  const i = exe.indexOf('.app/Contents/MacOS/')
  return i > 0 ? exe.slice(0, i + 4) : null
}

/** A plain-words reason the updater cannot install on this machine, or null when it can. */
export function installBlocker(o: { platform: string; packaged: boolean; storeManaged?: boolean; exePath: string; writable: (dir: string) => boolean }): string | null {
  if (o.storeManaged) return 'The Microsoft Store updates this install.'
  if (!o.packaged) return 'This is a development build.'
  if (o.platform === 'win32') return null
  if (o.platform !== 'darwin') return 'In-app updates are available on macOS and Windows.'
  const bundle = bundlePathFromExe(o.exePath)
  if (!bundle) return 'Careerloom is not running from an app bundle.'
  if (bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return 'Move Careerloom to the Applications folder first, then update.'
  if (!o.writable(path.dirname(bundle))) return `Careerloom cannot write to ${path.dirname(bundle)}. Download the update and replace the app yourself.`
  return null
}
