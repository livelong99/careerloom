// robots.txt (RFC 9309): group selection by product token, longest-match rule (Allow wins ties), `*` and `$`, 24 h cache.
const TTL_MS = 24 * 3_600_000
type Rules = Array<{ allow: boolean; re: RegExp; len: number }>
const cache = new Map<string, { at: number; rules: Rules }>()
export const clearRobotsCache = (): void => cache.clear()

const toRegExp = (path: string): RegExp => {
  const anchored = path.endsWith('$')
  const body = (anchored ? path.slice(0, -1) : path).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`)
}

export function parseRobots(text: string, token: string): Rules {
  const want = token.toLowerCase()
  const groups: Array<{ agents: string[]; rules: Rules }> = []
  let cur: { agents: string[]; rules: Rules } | null = null
  let lastWasAgent = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const i = line.indexOf(':')
    if (i < 0) continue
    const field = line.slice(0, i).trim().toLowerCase()
    const value = line.slice(i + 1).trim()
    if (field === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur) }
      cur.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if (field === 'allow' || field === 'disallow') {
      lastWasAgent = false
      if (cur && value !== '') cur.rules.push({ allow: field === 'allow', re: toRegExp(value), len: value.length })
    } else lastWasAgent = false
  }
  const named = groups.filter(g => g.agents.some(a => a !== '*' && a !== '' && want.includes(a)))
  const chosen = named.length ? named : groups.filter(g => g.agents.includes('*'))
  return chosen.flatMap(g => g.rules)
}

export function ruleAllows(rules: Rules, pathAndQuery: string): boolean {
  let best: { allow: boolean; len: number } | null = null
  for (const r of rules) {
    if (!r.re.test(pathAndQuery)) continue
    if (!best || r.len > best.len || (r.len === best.len && r.allow)) best = r
  }
  return best ? best.allow : true
}

/** `fetchText` resolves the file's text, `null` when the site has none (4xx ⇒ everything allowed) and throws when it is unreachable (⇒ nothing allowed, per RFC 9309 §2.3.1.4). */
export async function robotsAllows(url: string, userAgent: string, fetchText: (robotsUrl: string) => Promise<string | null>, now: () => number = Date.now): Promise<boolean> {
  const u = new URL(url)
  const key = u.origin
  const hit = cache.get(key)
  let rules: Rules
  if (hit && now() - hit.at < TTL_MS) rules = hit.rules
  else {
    try {
      const text = await fetchText(`${u.origin}/robots.txt`)
      rules = text === null ? [] : parseRobots(text, userAgent.split('/')[0] ?? userAgent)
    } catch { return false }
    cache.set(key, { at: now(), rules })
  }
  return ruleAllows(rules, `${u.pathname}${u.search}`)
}
