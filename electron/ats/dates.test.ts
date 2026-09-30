import { describe, expect, it } from 'vitest'

import { analyseDates, dateScore, findRanges, toYM, yearsCovered } from './dates'

const NOW = toYM(2026, 8)
const scan = (t: string) => findRanges(t, NOW)

describe('findRanges', () => {
  it('reads month-name, numeric and year ranges plus Present', () => {
    const { ranges, bad } = scan('Dell (February 2024–Present) · Acme (Aug 2022 - Jan 2024) · Old (07/2018 to 08/2022) · Early (2015-2017)')
    expect(bad).toEqual([])
    expect(ranges.map(r => [r.start, r.end])).toEqual([
      [toYM(2024, 1), NOW], [toYM(2022, 7), toYM(2024, 0)], [toYM(2018, 6), toYM(2022, 7)], [toYM(2015, 0), toYM(2017, 11)],
    ])
    expect(ranges[0]!.ongoing).toBe(true)
  })
  it('ignores prose years that are not ranges', () => {
    expect(scan('Won a hackathon in 2020 and shipped in 2021').ranges).toEqual([])
  })
})

describe('analyseDates', () => {
  it('finds gaps over 6 months and overlaps over 2', () => {
    const { ranges } = scan('A (Jan 2018 – Dec 2018), B (Sep 2019 – Dec 2020), C (Jun 2020 – Present)')
    const rep = analyseDates(ranges, [], NOW)
    expect(rep.gaps).toHaveLength(1)
    expect(rep.gaps[0]!.months).toBeGreaterThan(6)
    expect(rep.overlaps).toHaveLength(1)
  })
  it('flags inverted ranges and scores them lower than a clean timeline', () => {
    const clean = analyseDates(scan('A (Jan 2020 – Dec 2021), B (Jan 2022 – Present)').ranges, [], NOW)
    const messy = analyseDates(scan('A (Jan 2022 – Dec 2020), B (Jan 2019 – Present)').ranges, [], NOW)
    expect(messy.inverted).toHaveLength(1)
    expect(dateScore(clean).got).toBe(15)
    expect(dateScore(messy).got).toBeLessThan(dateScore(clean).got)
  })
  it('counts concurrent months once', () => {
    expect(yearsCovered(scan('A (Jan 2020 – Dec 2020), B (Jun 2020 – Dec 2021)').ranges)).toBe(2)
  })
})
