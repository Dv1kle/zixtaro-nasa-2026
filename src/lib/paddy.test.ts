// Lowland rice grows in a bunded paddy: the bunds hold standing water, which seeps down at a rate set by the soil,
// and the crop only stresses once the pond is gone and the soil dries past its readily available water.
import { describe, expect, it } from 'vitest'
import { CROP_BY_ID } from './crops'
import type { FieldContext } from './rotation'
import { manualProfile, rootZoneWater } from './soil'
import { guineaClimate, monsoonNorthClimate, steppeClimate } from './testkit'
import { allCropRisks, cropRisk, PADDY_POND, percolation, simulateSeason, type Paddy } from './water'

describe('rice in a bunded paddy', () => {
  it('is transplanted into a flooded field, so rice in the wet tropics does not stress while the rains last', () => {
    const climate = guineaClimate()
    const soil = manualProfile('sandy clay loam', 5.5)
    const rice = allCropRisks(climate, soil).rice.crop!
    const taw = rootZoneWater(soil, rice.rootDepth)
    const lossOver = (paddy?: Paddy) => {
      const ys = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) => simulateSeason(rice, climate, taw, y, 0, 1, paddy)!.loss)
      return ys.reduce((a, b) => a + b, 0) / ys.length
    }
    const paddy = lossOver({ pond: PADDY_POND, perc: percolation(soil) })
    expect(paddy).toBeLessThan(0.02)
    expect(paddy).toBeLessThan(lossOver()) // the same crop as a field crop, sown into the soil the dry season left
  })
  it('the Monte Carlo draws rice in its paddy too, so "How sure" reads the water the score was given', async () => {
    const { contextFor, simulateAll, SOIL_FACTORS } = await import('./robust')
    const climate = guineaClimate()
    const soil = manualProfile('sandy clay loam', 5.5)
    const ctx: FieldContext = {
      risks: allCropRisks(climate, soil), soil, stressYear: null, irrigated: false, drying: false, slopePct: 0.5,
      recentLabel: '', baselineLabel: '',
    }
    const sim = simulateAll(ctx, climate, ['rice'])
    const draw = contextFor(ctx, ['rice'], sim, { soil: SOIL_FACTORS.indexOf(1), seasons: sim.recentYears, ky: {}, price: {}, w: { soil: 60, water: 60, profit: 60 } })
    // a nominal draw is the score's own decade (the draws used to lose the pond and stress rice as a field crop)
    expect(draw.risks.rice.recent.loss).toBeCloseTo(ctx.risks.rice.recent.loss, 6)
    expect(draw.risks.rice.recent.deficit).toBeCloseTo(ctx.risks.rice.recent.deficit, 6)
  })
  it('cannot help without rain: rice on the dry steppe still fails', () => {
    expect(cropRisk(CROP_BY_ID.rice, steppeClimate(), manualProfile('loam', 6.5)).recent.loss).toBeGreaterThan(0.5)
  })
  it('loses its pond faster on sand, so a sandy paddy needs more water than a clay one', () => {
    const climate = monsoonNorthClimate()
    const sand = cropRisk(CROP_BY_ID.rice, climate, manualProfile('sandy loam', 6.5)).recent.deficit
    const clay = cropRisk(CROP_BY_ID.rice, climate, manualProfile('clay', 6.5)).recent.deficit
    expect(sand).toBeGreaterThan(clay)
  })
})
