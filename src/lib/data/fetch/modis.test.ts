// src/lib/data/fetch/modis.test.ts
import { describe, expect, it } from 'vitest'
import { CONVERT, landShares, pastComposites, phenologyDate } from './modis'

describe('MODIS conversions', () => {
  it('scales raw values and drops fill codes', () => {
    expect(CONVERT.ndvi(6543)).toBeCloseTo(0.6543, 6)
    expect(CONVERT.ndvi(-3000)).toBeNull()
    expect(CONVERT.lai(35)).toBeCloseTo(3.5, 6)
    expect(CONVERT.lai(255)).toBeNull()
    expect(CONVERT.fpar(72)).toBe(72)
    expect(CONVERT.et(240)).toBeCloseTo(3, 6) // 24 mm per 8 days
    expect(CONVERT.et(32767)).toBeNull()
    expect(CONVERT.le(864)).toBeCloseTo(100, 6)
    expect(CONVERT.lstDay(15000)).toBeCloseTo(26.85, 2)
    expect(CONVERT.lstDay(0)).toBeNull()
    expect(CONVERT.gpp(400)).toBeCloseTo(5, 6)
    expect(CONVERT.vcf(200)).toBeNull()
  })
  it('turns phenology day numbers into dates', () => {
    expect(phenologyDate(19_500)).toBe('2023-05-23')
    expect(phenologyDate(32_767)).toBeNull()
  })
  it('counts habitat and cropland in the land-cover window, water excluded', () => {
    const cls = [...Array(40).fill(12), ...Array(20).fill(14), ...Array(10).fill(4), ...Array(10).fill(10), 17]
    const s = landShares(cls)!
    expect(s.habitat).toBeCloseTo((10 + 10 + 10) / 80, 6) // forest + grassland + half the mosaic
    expect(s.cropland).toBeCloseTo((40 + 10) / 80, 6)
    expect(landShares([17, 17])).toBeNull()
  })
  it('finds the same composites in earlier years by day of year, one group per year (leap years included)', () => {
    const d = (y: number, doy: number) => ({ modis_date: `A${y}${String(doy).padStart(3, '0')}`, calendar_date: new Date(Date.UTC(y, 0, doy)).toISOString().slice(0, 10) })
    const all = [2023, 2024, 2025, 2026].flatMap((y) => [217, 225, 233, 241].map((doy) => d(y, doy)))
    const recent = [217, 225, 233, 241].map((doy) => d(2026, doy).calendar_date)
    const groups = pastComposites(all, recent, 5)
    expect(groups).toHaveLength(3)
    expect(groups.find((g) => g[0].modis_date.startsWith('A2024'))!.map((x) => x.calendar_date)).toEqual(['2024-08-04', '2024-08-12', '2024-08-20', '2024-08-28'])
  })
})
