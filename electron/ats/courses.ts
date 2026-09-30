// Courses are only ever shown after their URL answered. Never invented, never kept dead. Pure except the injected fetcher.
import type { Course } from '../contract'

export type Fetcher = (url: string, method: 'HEAD' | 'GET') => Promise<{ status: number }>

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|\[?::1\]?)$|^(127|10)\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./

/** http(s) only, no credentials, nothing on the local network: the agent's URLs are untrusted. */
export function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password && !PRIVATE_HOST.test(u.hostname.toLowerCase()) && u.hostname.includes('.')
  } catch { return false }
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

async function alive(url: string, fetcher: Fetcher): Promise<boolean> {
  try {
    const head = await fetcher(url, 'HEAD')
    if (head.status >= 200 && head.status < 400) return true
    // Many sites refuse HEAD (403/405/501) though the page exists: retry once with GET.
    if ([400, 403, 405, 406, 501].includes(head.status)) { const get = await fetcher(url, 'GET'); return get.status >= 200 && get.status < 400 }
    return false
  } catch {
    try { const get = await fetcher(url, 'GET'); return get.status >= 200 && get.status < 400 } catch { return false }
  }
}

export async function verifyCourses(raw: unknown[], fetcher: Fetcher, now: number): Promise<{ courses: Course[]; dropped: Array<{ url: string; reason: string }> }> {
  const seen = new Set<string>()
  const cand = raw.flatMap(x => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const url = s(o.url)
    if (!s(o.title) || !url || seen.has(url)) return []
    seen.add(url)
    return [{ o, url }]
  }).slice(0, 12)
  const dropped: Array<{ url: string; reason: string }> = []
  const courses: Course[] = []
  for (let i = 0; i < cand.length; i += 4) {
    await Promise.all(cand.slice(i, i + 4).map(async ({ o, url }) => {
      if (!isPublicHttpUrl(url)) return void dropped.push({ url, reason: 'not a public web address' })
      if (!(await alive(url, fetcher))) return void dropped.push({ url, reason: 'the page did not load' })
      courses.push({ title: s(o.title), provider: s(o.provider) || new URL(url).hostname, url, verified_at: now, free: o.free === true, hours: typeof o.hours === 'number' && o.hours > 0 ? o.hours : undefined, skill: s(o.skill), why: s(o.why) })
    }))
  }
  return { courses: courses.sort((a, b) => Number(b.free) - Number(a.free)), dropped }
}

/** The real fetcher: 8 s timeout, redirects followed, body never read. */
export const netFetcher: Fetcher = async (url, method) => {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const res = await fetch(url, { method, redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'Careerloom link check' } })
    void res.body?.cancel()
    return { status: res.status }
  } finally { clearTimeout(timer) }
}
