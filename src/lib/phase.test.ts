// Each penalty in its own layer, once, at the right moment: heat counts in the flowering window the FAO-56 stages give,
// not on any hot day of the month; drought is priced in the yield and the dry-year water axis, not again in viability.
import { describe, expect, it } from 'vitest'
import { CROP_BY_ID } from './crops'
import { cropExtremes, HEAT_DD_FULL } from './extremes'
import { evaluate } from './rotation'
import { manualProfile } from './soil'
import { load, prairieClimate, steppeClimate } from './testkit'
import { allCropRisks } from './water'

const even = { soil: 60, water: 60, profit: 60 }

describe('heat at flowering, in the flowering window', () => {
  // maize at Torgau is sown on 1 May; FAO-56 stages 30 + 40 days put the start of flowering (mid-season) on 10 July
  const hotOn = (days: number[]) => {
    const { climate, daily } = load('torgau')
    const d = structuredClone(daily.raw)
    const t0 = Date.parse(`${d.start}T00:00:00Z`)
    d.tmax = d.tmax.map((t) => (t == null ? t : 20))
    for (let y = climate.recent.from; y <= climate.recent.to; y++) for (const k of days) d.tmax[Math.round((Date.UTC(y, 6, k) - t0) / 86_400_000)] = 36
    return cropExtremes('maize', d, climate)!.heat.recent
  }
  it('does not count hot days before maize flowers, even in the same month', () => {
    expect(hotOn([1, 2, 3, 4, 5])).toBe(0)
  })
  it('counts the same heat inside the flowering window, by its degree-days', () => {
    // five days at 36 °C against maize's 35 °C: 5 degree-days of the HEAT_DD_FULL a full hit takes
    expect(hotOn([15, 16, 17, 18, 19])).toBeCloseTo(5 / HEAT_DD_FULL, 6)
  })
  it('reads a winter crop without FAO-56 stages at flowering, not at grain fill', () => {
    // winter wheat at Torgau flowers from late May (its June heat month, moved by how much earlier it ripens here than
    // on the reference calendar - advanceSpan): heat on 25-30 June falls in grain fill, heat on 1-6 June at flowering
    const at = (days: number[]) => {
      const { climate, daily } = load('torgau')
      const d = structuredClone(daily.raw)
      const t0 = Date.parse(`${d.start}T00:00:00Z`)
      d.tmax = d.tmax.map((t) => (t == null ? t : 20))
      for (let y = climate.recent.from; y <= climate.recent.to; y++) for (const k of days) d.tmax[Math.round((Date.UTC(y, 5, k) - t0) / 86_400_000)] = 34
      return cropExtremes('wheat', d, climate)!.heat.recent
    }
    expect(at([25, 26, 27, 28, 29, 30])).toBe(0)
    expect(at([1, 2, 3, 4, 5, 6])).toBe(1)
  })
  it('puts spring rapeseed on the prairie at flowering from late June into July, not in its ripening August', () => {
    const { daily } = load('torgau')
    const x = cropExtremes(allCropRisks(prairieClimate(), manualProfile('loam', 6.5)).rapeseed.crop!, daily.raw, prairieClimate())
    expect([6, 7]).toContain(x?.heat.month)
  })
})

describe('drought is counted once', () => {
  it('does not gate a water-stressed crop again: spring wheat on the steppe stays viable, its losses are in its yield', () => {
    const climate = steppeClimate()
    const soil = manualProfile('loam', 6.5)
    const ctx = { risks: allCropRisks(climate, soil), soil, stressYear: null, irrigated: false, drying: false, slopePct: 1, recentLabel: '', baselineLabel: '' }
    const e = evaluate(CROP_BY_ID.wheat, [], ctx, even)
    expect(e.loss).toBeGreaterThan(0.3)
    expect(e.sub.viability).toBe(1)
  })
})
