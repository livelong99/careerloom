// "Update available" check (ported from codeburn): it reads
// the public GitHub releases feed once per launch and every 24h, finds the newest
// `v<semver>` release, and semver-compares it to the running version.
//
// The check itself never downloads or installs. Installing is a separate, user-started step
// (electron/self-update/): it verifies the asset's SHA-256 first. Offline or any error is a
// silent no-op that retries on the next cycle.
//
// Privacy: this is a plain, unauthenticated GitHub read that carries no
// identifiers. We deliberately send NO app-identifying headers — only the
// runtime's default User-Agent (Node/Electron's "node") goes out, and no auth
// token — so the request reveals nothing about the user or install. GitHub only
// requires *some* User-Agent, which the default satisfies. See fetchReleases.

import { pickAsset, RELEASES_REPO, type ReleaseAsset } from './self-update/release'

export { RELEASES_REPO }
const RELEASES_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=15`
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000
// Desktop releases are tagged `v<major>.<minor>.<patch>`.
const DESKTOP_TAG_RE = /^v(\d+\.\d+\.\d+)$/

export type UpdateStatus = {
  currentVersion: string
  /** Newest published desktop version, or null when unknown (offline / no match). */
  latestVersion: string | null
  updateAvailable: boolean
  /** The release tag to link when an update is available (else null). */
  tag: string | null
  /** A Microsoft Store (AppX) install: the Store delivers updates, on its own schedule, so
   *  GitHub is never asked and nothing is offered. */
  storeManaged?: boolean
  /** Release notes (markdown) and publish date of the newest release, when known. */
  notes?: string | null
  publishedAt?: string | null
  /** The file the updater would install on this machine, or null (no matching asset). */
  asset?: { name: string; size: number; verifiable: boolean } | null
  /** Why "Update now" is unavailable here (null = it works). */
  blocker?: string | null
}

type GitHubRelease = { tag_name?: string; body?: string | null; published_at?: string | null; assets?: unknown; draft?: boolean; prerelease?: boolean }

const FAIL_BACKOFF_MS = 5 * 60_000

function baselineStatus(currentVersion: string): UpdateStatus {
  return { currentVersion, latestVersion: null, updateAvailable: false, tag: null }
}

/** Numeric compare of two `major.minor.patch` strings: -1 / 0 / 1. Missing or
 *  non-numeric parts count as 0. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < 3; i++) {
    const x = parseInt(pa[i] ?? '0', 10) || 0
    const y = parseInt(pb[i] ?? '0', 10) || 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** The newest `v<semver>` release among the feed, or null if none match.
 *  Picks by semver rather than trusting feed order. */
export function pickLatestDesktopVersion(releases: GitHubRelease[]): { version: string; tag: string; release: GitHubRelease } | null {
  let best: { version: string; tag: string; release: GitHubRelease } | null = null
  for (const release of releases) {
    if (release?.draft || release?.prerelease) continue
    const tag = typeof release?.tag_name === 'string' ? release.tag_name : ''
    const match = DESKTOP_TAG_RE.exec(tag)
    if (!match) continue
    const version = match[1]!
    if (!best || compareSemver(version, best.version) > 0) best = { version, tag, release }
  }
  return best
}

/** Fetch + parse the releases feed. No auth, no app-identifying headers (see the
 *  file header). Aborts after 15s. Throws on a non-2xx response. */
export async function fetchReleases(signal: AbortSignal, fetchImpl: typeof fetch = globalThis.fetch): Promise<GitHubRelease[]> {
  const response = await fetchImpl(RELEASES_URL, { signal })
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
  const data = await response.json()
  return Array.isArray(data) ? (data as GitHubRelease[]) : []
}

export type UpdateChecker = {
  /** Cached status, refreshed only when older than the 24h interval. */
  getStatus(): Promise<UpdateStatus>
  /** Force a fresh check now (launch + the 24h timer call this). */
  check(): Promise<UpdateStatus>
  /** The last known status without any network call (used while update checks are switched off). */
  peek(): UpdateStatus
  /** The installable asset of the newest release, as of the last successful check. */
  latestAsset(): ReleaseAsset | null
}

export function createUpdateChecker(opts: {
  currentVersion: string
  storeManaged?: boolean
  /** Injected in tests; defaults to the real GitHub read. */
  fetchReleasesImpl?: (signal: AbortSignal) => Promise<GitHubRelease[]>
  now?: () => number
  intervalMs?: number
  platform?: string
  arch?: string
  /** Reason an in-app install cannot run on this machine (see self-update/release.ts installBlocker). */
  blocker?: () => string | null
}): UpdateChecker {
  const now = opts.now ?? (() => Date.now())
  const intervalMs = opts.intervalMs ?? CHECK_INTERVAL_MS
  const fetchReleasesImpl = opts.fetchReleasesImpl ?? ((signal: AbortSignal) => fetchReleases(signal))

  let cached = baselineStatus(opts.currentVersion)
  let asset: ReleaseAsset | null = null
  let lastCheckedAt = 0
  let inflight: Promise<UpdateStatus> | null = null

  // A release is tagged on GitHub before the Store has certified it, so the GitHub feed would
  // announce a version the Store cannot install yet (#1520).
  if (opts.storeManaged) {
    const status: UpdateStatus = { ...baselineStatus(opts.currentVersion), storeManaged: true }
    return { getStatus: () => Promise.resolve(status), check: () => Promise.resolve(status), peek: () => status, latestAsset: () => null }
  }

  const check = (): Promise<UpdateStatus> => {
    if (inflight) return inflight
    inflight = (async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const releases = await fetchReleasesImpl(controller.signal)
        const latest = pickLatestDesktopVersion(releases)
        lastCheckedAt = now()
        if (!latest) {
          cached = baselineStatus(opts.currentVersion)
          asset = null
        } else {
          const updateAvailable = compareSemver(latest.version, opts.currentVersion) > 0
          asset = updateAvailable ? pickAsset(latest.release.assets, latest.version, opts.platform ?? process.platform, opts.arch ?? process.arch) : null
          cached = {
            currentVersion: opts.currentVersion,
            latestVersion: latest.version,
            updateAvailable,
            tag: updateAvailable ? latest.tag : null,
            ...(updateAvailable ? {
              notes: typeof latest.release.body === 'string' ? latest.release.body.slice(0, 20_000) : null,
              publishedAt: typeof latest.release.published_at === 'string' ? latest.release.published_at : null,
              asset: asset ? { name: asset.name, size: asset.size, verifiable: asset.sha256 !== null } : null,
              blocker: opts.blocker?.() ?? null,
            } : {}),
          }
        }
      } catch {
        // Offline / GitHub error / private repo (404): silent no-op. Keep the last known
        // status and retry after a short backoff, not on every getStatus poll.
        lastCheckedAt = now() - intervalMs + FAIL_BACKOFF_MS
      } finally {
        clearTimeout(timer)
        inflight = null
      }
      return cached
    })()
    return inflight
  }

  const getStatus = (): Promise<UpdateStatus> => {
    if (lastCheckedAt !== 0 && now() - lastCheckedAt < intervalMs) return Promise.resolve(cached)
    return check()
  }

  return { getStatus, check, peek: () => cached, latestAsset: () => asset }
}
