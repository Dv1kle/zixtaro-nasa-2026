// src/lib/data/derive/thermal.test.ts
import { describe, expect, it } from 'vitest'
import type { Daily } from '../../dailyFormat'
import type { MonthNormal } from '../../climate'
import { dayLength, dliFromPar } from './light'
import { aridityClass, aridityIndex, diurnalRange, extremeRainShare, frostFreeSeasons, frostFreeSummary, pMinusE, ripening } from './thermal'

const DAY = 86_400_000
/** A daily record from `start` to `end` (inclusive) with values from functions of the date. */
function daily(start: string, end: string, tmin: (t: Date) => number, tmax: (t: Date) => number, prcp: (i: number) => number = () => 0): Daily {
  const t0 = Date.parse(`${start}T00:00:00Z`)
  const n = Math.round((Date.parse(`${end}T00:00:00Z`) - t0) / DAY) + 1
  const d: Daily = { start, tmax: [], tmin: [], prcp: [] }
  for (let i = 0; i < n; i++) {
    const t = new Date(t0 + i * DAY)
    d.tmin.push(tmin(t))
    d.tmax.push(tmax(t))
    d.prcp.push(prcp(i))
  }
  return d
}
const idxOfYear = (t: Date) => Math.round((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY)

describe('light', () => {
  it('gives 16.6 h at 51.5° N on the June solstice and 24 h north of the Arctic Circle', () => {
    expect(dayLength(51.5, 172)).toBeCloseTo(16.64, 1)
    expect(dayLength(-51.5, 172)).toBeCloseTo(7.83, 1)
    expect(dayLength(80, 172)).toBe(24)
    expect(dayLength(0, 80)).toBeCloseTo(12.1, 1)
  })
  it('converts PAR to a daily light integral at 4.57 mol per MJ', () => {
    expect(dliFromPar(10)).toBeCloseTo(45.7, 5)
  })
})

describe('frost-free season', () => {
  it('finds the last spring and first autumn frost north of the equator', () => {
    const d = daily('2000-01-01', '2005-12-31', (t) => (idxOfYear(t) < 104 || idxOfYear(t) > 292 ? -5 : 10), (t) => 20)
    const s = frostFreeSeasons(d, 51)
    expect(s).toHaveLength(6)
    expect(s[0]).toMatchObject({ year: 2000, lastSpring: 103, firstAutumn: 293, length: 189 })
  })
  it('runs July to June south of the equator, so the southern summer is one season', () => {
    const d = daily('2000-07-01', '2006-06-30', (t) => ([5, 6, 7].includes(t.getUTCMonth()) ? -3 : 12), () => 22)
    const s = frostFreeSeasons(d, -34)
    const y2001 = s.find((x) => x.year === 2001)!
    expect(y2001).toMatchObject({ lastSpring: 61, firstAutumn: 335, length: 273 })
  })
  it('reports a frostless place as 365 days with no trend', () => {
    const d = daily('1990-01-01', '2005-12-31', () => 20, () => 30)
    const sum = frostFreeSummary(frostFreeSeasons(d, 5), 1996)!
    expect(sum).toMatchObject({ median: 365, trend: null, frostless: true, lastSpring: null, firstAutumn: null })
  })
})

describe('day-night range, extreme rain, aridity', () => {
  it('averages Tmax - Tmin in the chosen months and counts big swings per year', () => {
    const d = daily('2001-01-01', '2002-12-31', () => 5, (t) => (t.getUTCMonth() === 6 ? 25 : 12))
    expect(diurnalRange(d, [2001, 2002], [7])).toEqual({ mean: 20, bigDays: 31 })
  })
  it('measures the share of rain from days above the base 95th percentile', () => {
    const d = daily('1981-01-01', '2020-12-31', () => 5, () => 15, (i) => (i % 50 === 0 ? 30 : 1))
    expect(extremeRainShare(d, [1981, 2010], [2011, 2020], 0.95)).toBeCloseTo(30 / 79, 2)
  })
  it('classes the aridity index by UNEP', () => {
    const normals = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, p: 50, pet: 100, t: 10, tMax: 15, w: 0.5 })) as MonthNormal[]
    expect(aridityIndex(normals)).toBeCloseTo(0.5, 6)
    expect(aridityClass(0.5)).toBe('dry sub-humid')
    expect(aridityClass(0.03)).toBe('hyper-arid')
    expect(pMinusE(normals)).toBe(-600)
  })
})

describe('ripening', () => {
  it('adds observed days, then the forecast, then climatology until the need is met', () => {
    const d = daily('2015-01-01', '2020-03-31', () => 10, () => 20)
    const fc = Array.from({ length: 10 }, (_, i) => ({ date: `2020-04-${String(i + 1).padStart(2, '0')}`, tmax: 25, tmin: 15 }))
    const r = ripening(d, '2020-03-01', 900, 0, fc)
    expect(r).toEqual({ sumToDate: 465, date: '2020-04-26', via: 'climatology' })
  })
  it('stops at the observed day when the record alone is enough', () => {
    const d = daily('2019-01-01', '2020-06-30', () => 10, () => 20)
    expect(ripening(d, '2020-03-01', 900, 0, [])).toEqual({ sumToDate: 900, date: '2020-04-29', via: 'observed' })
  })
})
