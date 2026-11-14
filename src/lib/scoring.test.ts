// The score axes in one currency. Drought-proof means what a crop still pays in a dry year - the driest 30 % of recent
// seasons - not how small a share of its own potential it loses: proso millet that keeps 99 % of a 3 t/ha ceiling is
// not automatically a safer bet than maize that keeps 80 % of 12 t/ha.
import { DEFAULT_PRESET } from './presets'
import { describe, expect, it } from 'vitest'
import { CROP_BY_ID } from './crops'
import { evaluate, type FieldContext } from './rotation'
import { manualProfile } from './soil'
import { guineaClimate, load, monsoonClimate } from './testkit'
import { allCropRisks } from './water'

const even = { soil: 60, water: 60, profit: 60 }

describe('the water axis counts what a dry year still pays', () => {
  it('prices the drought risk: a better maize price puts more money at stake in dry years, but never lowers the score', () => {
    const { ctx } = load('iowa')
    const at = (f: number) => evaluate(CROP_BY_ID.maize, [], { ...ctx, priceFactor: { maize: f } }, even)
    expect(at(1.3).sub.profit).toBeGreaterThan(at(1).sub.profit)
    expect(at(1.3).sub.water).toBeLessThanOrEqual(at(1).sub.water)
    for (const w of [even, DEFAULT_PRESET.priorities]) {
      const score = (f: number) => evaluate(CROP_BY_ID.maize, [], { ...ctx, priceFactor: { maize: f } }, w).score
      expect(score(1.3)).toBeGreaterThanOrEqual(score(1))
    }
  })
  it('in a dry Sahel, where maize fails in the dry years, millet stays the drought-proof crop', () => {
    const climate = monsoonClimate([0, 0, 2, 8, 30, 70, 120, 140, 80, 12, 0, 0])
    const soil = manualProfile('sandy loam', 6)
    const ctx: FieldContext = {
      risks: allCropRisks(climate, soil), soil, stressYear: null, irrigated: false, drying: false, slopePct: 1, recentLabel: '', baselineLabel: '',
    }
    expect(evaluate(CROP_BY_ID.millet, [], ctx, even).sub.water).toBeGreaterThan(evaluate(CROP_BY_ID.maize, [], ctx, even).sub.water)
  })
})

describe('costs follow the intensity the country farms at', () => {
  // with no market the price is the reference price, so the costs are what the harvest earns less the margin
  const costs = (t: number) => {
    const { ctx } = load('iowa')
    const e = evaluate(CROP_BY_ID.maize, [], { ...ctx, yieldRef: { maize: { t, source: 'country' } } }, even)
    return e.harvest * CROP_BY_ID.maize.econ.price - e.margin
  }
  it('a country harvesting a sixth of the reference maize yield does not pay the reference seed and field passes', () => {
    expect(costs(1.6)).toBeLessThan(0.4 * costs(10))
  })
})

describe('irrigated, the water axis is water productivity in money', () => {
  it('prices each millimetre: a better price makes the same irrigated maize more water-productive', () => {
    const { ctx } = load('kansas')
    const irrigated = { ...ctx, irrigated: true }
    const at = (f: number) => evaluate(CROP_BY_ID.maize, [], { ...irrigated, priceFactor: { maize: f } }, even).sub.water
    expect(at(1.3)).toBeGreaterThan(at(1) + 0.03)
  })
})

describe('irrigated water productivity counts irrigation water, not the rain', () => {
  it('does not mark down rice that the rain waters all season, on an irrigated field', () => {
    const climate = guineaClimate()
    const soil = manualProfile('clay loam', 6.5)
    const ctx: FieldContext = {
      risks: allCropRisks(climate, soil), soil, stressYear: null, irrigated: true, drying: false, slopePct: 1, recentLabel: '', baselineLabel: '',
    }
    const rice = evaluate(CROP_BY_ID.rice, [], ctx, even)
    expect(rice.deficit).toBeLessThan(50) // the rains water it: next to no irrigation
    expect(rice.sub.water).toBeGreaterThan(0.8)
  })
})

describe('a niche crop’s national yield does not carry to an ordinary field', () => {
  it('keeps sweet potatoes on the physics where the country grows them only in irrigated gardens', () => {
    const { ctx } = load('iowa')
    const at = (niche: boolean) => evaluate(CROP_BY_ID.sweetpotato, [], { ...ctx, yieldRef: { sweetpotato: { t: 43, source: 'country', niche } } }, even)
    const e = at(true)
    expect(e.harvest).toBeLessThanOrEqual(CROP_BY_ID.sweetpotato.econ.yield * e.yieldShare + 1e-9)
    expect(at(false).harvest).toBeGreaterThan(e.harvest)
  })
})
