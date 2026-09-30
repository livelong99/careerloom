// Site-agnostic job-card finder for boards with no dedicated extractor, and the self-healing tier when a
// dedicated one goes stale after a site redesign. It finds links that look like job links, climbs each to
// its repeating "card" (an element with ≥3 same-tag siblings), keeps the parent that holds the most cards
// and reads title / company / location from the card's text lines. Self-contained (serialised into the page).
import type { RawJob } from './sites'

type N = { tagName: string; parentElement: N | null; children: ArrayLike<N>; textContent: string | null; getAttribute(n: string): string | null; querySelectorAll(s: string): ArrayLike<N> }
type D = { querySelectorAll(s: string): ArrayLike<N> }

export function genericExtract(doc: D): RawJob[] {
  const JOB = /(\/jobs?\/|job-listing|viewjob|\/jd\/|\/careers?\/|\/vacanc|\/position|[?&](jk|jobid|job_id|currentJobId)=|-jobs?-\d|\/job[-_]?\d)/i
  const NOISE = /^(easily apply|apply|save|share|easy apply|view job|see more|next|previous|sign in|log in|new|promoted|viewed|be an early applicant|actively (hiring|recruiting))/i
  const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim()
  // parent → (card → its job links). Every ancestor of a job link with ≥3 same-tag siblings is a candidate.
  const groups: { parent: N; height: number; cards: { card: N; links: N[] }[] }[] = []
  const anchors = doc.querySelectorAll('a[href]')
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]!
    const href = a.getAttribute('href') || ''
    const label = clean(a.getAttribute('aria-label')) || clean(a.textContent)
    if (!JOB.test(href) || label.length < 4 || label.length > 140 || /^(javascript|mailto|#)/.test(href)) continue
    let el: N | null = a
    for (let height = 0; el && el.parentElement && height < 14; height++, el = el.parentElement) {
      const parent: N = el.parentElement!
      let same = 0
      for (let c = 0; c < parent.children.length; c++) if (parent.children[c]!.tagName === el.tagName) same++
      if (same < 3) continue
      let g = groups.find(x => x.parent === parent)
      if (!g) groups.push(g = { parent, height, cards: [] })
      let card = g.cards.find(x => x.card === el)
      if (!card) g.cards.push(card = { card: el, links: [] })
      card.links.push(a)
    }
  }
  // A repeating unit holds about one job each; the outermost level with the most units is the whole card.
  const fit = (g: (typeof groups)[number]) => g.cards.filter(c => new Set(c.links.map(l => l.getAttribute('href'))).size <= 4)
  groups.sort((x, y) => fit(y).length - fit(x).length || y.height - x.height)
  const best = groups[0]
  const cards = best ? fit(best) : []
  if (cards.length < 3) return []
  const out: RawJob[] = []
  const seen: Record<string, true> = {}
  for (const { card, links } of cards) {
    const link = links[0]!
    const url = link.getAttribute('href') || ''
    const title = (clean(link.getAttribute('aria-label')) || clean(link.textContent)).replace(/^(full details of|view details for)\s+/i, '')
    if (seen[url]) continue
    seen[url] = true
    const lines: string[] = []
    const leaves = card.querySelectorAll('*')
    for (let i = 0; i < leaves.length; i++) {
      const n = leaves[i]!
      if (n.children.length) continue
      const t = clean(n.textContent)
      if (t && t.length <= 80 && t !== title && !title.includes(t) && !NOISE.test(t) && lines.indexOf(t) < 0) lines.push(t)
    }
    const location = lines.find(l => /,|remote|hybrid|on-?site|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai/i.test(l) && l.length < 60) || ''
    out.push({ title, url, company: lines.find(l => l !== location) || '', location })
  }
  return out
}
