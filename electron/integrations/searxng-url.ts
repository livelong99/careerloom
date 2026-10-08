// Pure address check for the self-hosted SearXNG (no electron import).
/** Loopback http only, no credentials/query: the same rule the KB search setting applies. */
export function parseSearxngUrl(v: string): string {
  const u = new URL(v)
  if (u.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) throw new Error('The SearXNG address must be http on this computer (127.0.0.1 or localhost)')
  if (u.username || u.password || u.search || u.hash) throw new Error('The SearXNG address must not have credentials or a query')
  return `${u.origin}${u.pathname}`.replace(/\/+$/, '')
}

