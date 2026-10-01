// Bullet quality: action verb, quantified impact, specificity, length. Pure.
import type { CvBullet } from './model'
import { wordCount } from './model'
import { extractSkills } from './skills'

const VERBS = new Set(`accelerated achieved adapted administered advised analyzed analysed architected audited authored automated boosted built
championed clarified coached collaborated completed configured consolidated constructed coordinated created cut debugged decreased delivered
deployed designed developed directed documented drove eliminated enabled engineered enhanced established evaluated executed expanded facilitated
finalized fixed founded generated guided identified implemented improved increased initiated instituted integrated introduced launched led
leveraged maintained managed mentored migrated modernized monitored negotiated optimized optimised orchestrated organized oversaw owned partnered
piloted planned presented prioritized produced programmed proposed prototyped published reduced refactored released remediated replaced reported
researched resolved restructured reviewed revamped scaled secured shipped simplified slashed solved spearheaded standardized streamlined
strengthened supervised supported taught tested tracked trained transformed trimmed troubleshot upgraded validated wrote won elevated elevating
accelerating actively`.split(/\s+/))
const WEAK_START = /^(responsible for|worked on|helped|assisted|involved in|duties included|tasked with|participated in|was part of|exposure to)\b/i
const QUANT = /\d[\d,.]*\s*(%|x\b|k\b|m\b|\+|hours?|days?|weeks?|months?|users?|employees?|records?|stories|apps?|teams?|engineers?|ms\b|seconds?|\$|₹|usd)|[%$₹]\s*\d|\b\d{2,}\b/i

export type BulletNote = { line: number; specific: boolean; quote: string }
export type BulletVerdict = { line: number; text: string; verb: boolean; quantified: boolean; specific: boolean; lengthOk: boolean; points: number; issues: string[] }

const firstWord = (t: string) => t.replace(/^[^A-Za-z]+/, '').split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? ''

/** A judged specificity note only counts when its quote really is in the bullet. */
const noteFor = (b: CvBullet, notes: BulletNote[]) => notes.find(n => n.line === b.line && n.quote.trim() && b.text.toLowerCase().includes(n.quote.trim().toLowerCase()))

export function judgeBullet(b: CvBullet, notes: BulletNote[] = []): BulletVerdict {
  const words = wordCount(b.text)
  const verb = VERBS.has(firstWord(b.text)) && !WEAK_START.test(b.text)
  const quantified = QUANT.test(b.text)
  const judged = noteFor(b, notes)
  // Proxy when no judgement: names a real tool/technology, or carries a number.
  const specific = judged ? judged.specific : extractSkills(b.text).size > 0 || quantified
  const lengthOk = words >= 12 && words <= 30
  const issues: string[] = []
  if (!verb) issues.push(WEAK_START.test(b.text) ? 'Starts with a weak phrase; lead with a strong verb' : 'Does not start with an action verb')
  if (!quantified) issues.push('No number: add scale, time saved, users or a percentage if you have one')
  if (!specific) issues.push('Generic: name the tool, system or outcome')
  if (!lengthOk) issues.push(words < 12 ? `Short (${words} words): add what you did and the result` : `Long (${words} words): split or trim to 30 or fewer`)
  const points = (verb ? 0.25 : 0) + (quantified ? 0.3 : 0) + (specific ? 0.25 : 0) + (lengthOk ? 0.2 : 0)
  return { line: b.line, text: b.text, verb, quantified, specific, lengthOk, points, issues }
}

/** 0-15 over the distinct evidence bullets; `weakest` are the ones worth rewriting first. */
export function bulletQuality(bullets: CvBullet[], notes: BulletNote[] = [], max = 15) {
  const seen = new Set<string>()
  const verdicts = bullets.filter(b => b.evidence && !seen.has(b.text.toLowerCase()) && seen.add(b.text.toLowerCase())).map(b => judgeBullet(b, notes))
  if (!verdicts.length) return { got: 0, max, verdicts, weakest: [] as BulletVerdict[], average: 0 }
  const average = verdicts.reduce((s, v) => s + v.points, 0) / verdicts.length
  return { got: Math.round(average * max * 10) / 10, max, verdicts, weakest: [...verdicts].filter(v => v.points < 0.75).sort((a, b) => a.points - b.points).slice(0, 8), average }
}
