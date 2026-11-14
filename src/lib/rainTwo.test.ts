import { describe, expect, it } from 'vitest'
import { monthKey } from './climate'
import { compareRain, imergUrl, parseImerg, IMERG_FROM } from './rainTwo'
import { load } from './testkit'

describe('GPM IMERG beside NASA POWER', () => {
  it('asks NASA POWER for the satellite record on the UTC standard (the only one it is served on)', () => {
    const u = new URL(imergUrl(51.5212, 13.0481, 2025))
    expect(u.hostname).toBe('power.larc.nasa.gov')
    expect(u.searchParams.get('parameters')).toBe('IMERG_PRECTOT')
    expect(u.searchParams.get('time-standard')).toBe('UTC')
    expect(u.searchParams.get('start')).toBe(String(IMERG_FROM))
  })

  it('reads mm a day as mm a month, and leaves out fill values and the annual key', () => {
    // (the first three values are NASA POWER's own for 51.56 N, 13.0 E)
    const m = parseImerg({ properties: { parameter: { IMERG_PRECTOT: { '202201': 0.97, '202202': 2.63, '202203': 0.35, '202204': -999, '202213': 1.42, '202402': 1 } } } })
    expect(m.get(monthKey(2022, 1))).toBeCloseTo(0.97 * 31, 6)
    expect(m.get(monthKey(2022, 2))).toBeCloseTo(2.63 * 28, 6)
    expect(m.get(monthKey(2024, 2))).toBeCloseTo(29, 6) // a leap February
    expect(m.has(monthKey(2022, 4))).toBe(false)
    expect(m.size).toBe(4)
  })

  it('finds a record that is the model’s own rain, one tenth wetter, to be exactly that', () => {
    const { climate } = load('torgau')
    const sat = new Map<string, number>()
    for (const [k, r] of climate.byMonth) if (r.year >= IMERG_FROM) sat.set(k, r.p * 1.1)
    const two = compareRain(climate, sat)!
    expect(two.years[0].year).toBe(IMERG_FROM)
    expect(two.years[two.years.length - 1].year).toBe(climate.lastYear)
    expect(two.bias).toBeCloseTo(0.1, 6)
    expect(two.months.r).toBeCloseTo(1, 6)
    expect(two.months.n).toBe(two.years.length * 12)
    expect(two.driest.power).toBe(two.driest.imerg)
    expect(two.apart).toEqual([])
  })

  it('counts only years both records cover in full, and gives no verdict on fewer than five', () => {
    const { climate } = load('torgau')
    const sat = new Map<string, number>()
    for (const [k, r] of climate.byMonth) if (r.year >= 2010 && r.year <= 2013) sat.set(k, r.p)
    expect(compareRain(climate, sat)).toBeNull()
    for (const [k, r] of climate.byMonth) if (r.year >= 2014 && r.year <= 2020) sat.set(k, r.p)
    sat.delete(monthKey(2015, 7))
    const two = compareRain(climate, sat)!
    expect(two.years.map((y) => y.year)).toEqual([2010, 2011, 2012, 2013, 2014, 2016, 2017, 2018, 2019, 2020])
  })

  it('says which years the two part in', () => {
    const { climate } = load('torgau')
    const sat = new Map<string, number>()
    for (const [k, r] of climate.byMonth) if (r.year >= IMERG_FROM) sat.set(k, r.year === 2018 ? r.p * 0.6 : r.p)
    const two = compareRain(climate, sat)!
    expect(two.apart).toEqual([2018])
    expect(two.driest.imerg).toBe(2018)
  })
})
