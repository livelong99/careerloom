// Date ranges in résumé text: parsing, consistency findings and years of experience. Pure.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DATE = `(?:${MON}\\.?,?\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4}-\\d{2}|\\d{4})`
const NOW = '(?:present|current|now|today|till date|to date|ongoing)'
const SEP = '\\s*(?:–|—|-|to|until|till)\\s*'
const RANGE = new RegExp(`(${DATE})${SEP}(${DATE}|${NOW})`, 'gi')

export type YM = number // months since year 0
export type DateRange = { raw: string; start: YM; end: YM; ongoing: boolean; yearOnly: boolean; style: 'month-name' | 'numeric' | 'year' }

export const toYM = (y: number, m: number): YM => y * 12 + m

export function nowYM(d = new Date()): YM { return toYM(d.getFullYear(), d.getMonth()) }

/** One date token → months index. Year-only dates resolve to January (start) or December (end). */
export function parseYM(s: string, edge: 'start' | 'end', now: YM): { ym: YM; yearOnly: boolean; style: DateRange['style'] } | null {
  const t = s.trim().toLowerCase()
  if (new RegExp(`^${NOW}$`).test(t)) return { ym: now, yearOnly: false, style: 'month-name' }
  let m = /^(\d{4})$/.exec(t)
  if (m) return { ym: toYM(+m[1]!, edge === 'start' ? 0 : 11), yearOnly: true, style: 'year' }
  m = /^(\d{1,2})\/(\d{4})$/.exec(t)
  if (m && +m[1]! >= 1 && +m[1]! <= 12) return { ym: toYM(+m[2]!, +m[1]! - 1), yearOnly: false, style: 'numeric' }
  m = /^(\d{4})-(\d{2})$/.exec(t)
  if (m && +m[2]! >= 1 && +m[2]! <= 12) return { ym: toYM(+m[1]!, +m[2]! - 1), yearOnly: false, style: 'numeric' }
  m = /^([a-z]{3,9})\.?,?\s+(\d{4})$/.exec(t)
  const mi = m ? MONTHS.indexOf(m[1]!.slice(0, 3)) : -1
  if (m && mi >= 0) return { ym: toYM(+m[2]!, mi), yearOnly: false, style: 'month-name' }
  return null
}

/** Every "date – date|Present" range in the text. Ranges that do not parse come back in `bad`. */
export function findRanges(text: string, now: YM = nowYM()): { ranges: DateRange[]; bad: string[] } {
  const ranges: DateRange[] = []
  const bad: string[] = []
  for (const hit of text.matchAll(RANGE)) {
    const a = parseYM(hit[1]!, 'start', now)
    const b = parseYM(hit[2]!, 'end', now)
    if (!a || !b) { bad.push(hit[0]); continue }
    ranges.push({ raw: hit[0], start: a.ym, end: b.ym, ongoing: new RegExp(`^${NOW}$`, 'i').test(hit[2]!.trim()), yearOnly: a.yearOnly || b.yearOnly, style: a.style })
  }
  return { ranges, bad }
}

export type DateReport = {
  ranges: number
  inverted: string[]
  future: string[]
  overlaps: Array<{ a: string; b: string; months: number }>
  gaps: Array<{ from: YM; to: YM; months: number }>
  mixedStyles: boolean
  yearOnly: number
  bad: string[]
}

const OVERLAP_TOLERANCE = 2 // a month or two of handover is normal
export const GAP_MONTHS = 6

export function analyseDates(ranges: DateRange[], bad: string[], now: YM = nowYM()): DateReport {
  const ok = ranges.filter(r => r.end >= r.start)
  const sorted = [...ok].sort((a, b) => a.start - b.start)
  const overlaps: DateReport['overlaps'] = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const months = Math.min(sorted[i]!.end, sorted[j]!.end) - sorted[j]!.start
      if (months > OVERLAP_TOLERANCE) overlaps.push({ a: sorted[i]!.raw, b: sorted[j]!.raw, months })
    }
  }
  const gaps: DateReport['gaps'] = []
  let reach = sorted[0]?.end ?? 0
  for (const r of sorted.slice(1)) {
    if (r.start - reach > GAP_MONTHS) gaps.push({ from: reach, to: r.start, months: r.start - reach })
    reach = Math.max(reach, r.end)
  }
  return {
    ranges: ranges.length,
    inverted: ranges.filter(r => r.end < r.start).map(r => r.raw),
    future: ranges.filter(r => !r.ongoing && r.start > now).map(r => r.raw),
    overlaps,
    gaps,
    mixedStyles: new Set(ranges.map(r => r.style)).size > 1,
    yearOnly: ranges.filter(r => r.yearOnly).length,
    bad,
  }
}

/** Distinct months covered by the ranges, in years (concurrent jobs are not double counted). */
export function yearsCovered(ranges: DateRange[]): number {
  const months = new Set<number>()
  for (const r of ranges) if (r.end >= r.start) for (let m = r.start; m <= r.end; m++) months.add(m)
  return Math.round((months.size / 12) * 10) / 10
}

/** 0-15: how trustworthy the dates are to a parser. */
export function dateScore(rep: DateReport): { got: number; notes: string[] } {
  const notes: string[] = []
  let got = 15
  if (rep.ranges === 0 && rep.bad.length === 0) return { got: 6, notes: ['No date ranges were found, so a parser cannot build your timeline'] }
  const cut = (n: number, why: string) => { got -= n; notes.push(why) }
  if (rep.bad.length) cut(Math.min(6, rep.bad.length * 3), `${rep.bad.length} date range(s) could not be read: ${rep.bad.slice(0, 2).join(', ')}`)
  if (rep.inverted.length) cut(Math.min(6, rep.inverted.length * 4), `Range ends before it starts: ${rep.inverted[0]}`)
  if (rep.future.length) cut(2, `Starts in the future: ${rep.future[0]}`)
  if (rep.overlaps.length) cut(Math.min(4, rep.overlaps.length * 2), `Roles overlap by more than ${OVERLAP_TOLERANCE} months: ${rep.overlaps[0]!.a} and ${rep.overlaps[0]!.b}`)
  if (rep.gaps.length) cut(Math.min(4, rep.gaps.length * 2), `Gap of ${rep.gaps[0]!.months} months between roles`)
  if (rep.mixedStyles) cut(2, 'Date formats are mixed (for example "Feb 2024" and "02/2024")')
  if (rep.yearOnly > 0 && rep.yearOnly === rep.ranges) cut(2, 'Year-only dates hide tenure; add months')
  return { got: Math.max(0, got), notes }
}
