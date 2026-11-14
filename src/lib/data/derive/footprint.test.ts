// src/lib/data/derive/footprint.test.ts
import { describe, expect, it } from 'vitest'
import { CROPS } from '../../crops'
import { co2ePerTonne, eroi, N2O_PER_KG_N, OFFTAKE, pollinationRisk, POLLINATOR, removal, TRANSPIRATION_RATIO, waterFootprint, weedWindowWeeks } from './footprint'
import { coefficientOfVariation, faparFromNdvi, fvcFromNdvi } from './vegetation'

describe('vegetation cover', () => {
  it('turns NDVI into cover and fAPAR within 0-1', () => {
    expect(fvcFromNdvi(0.15)).toBe(0)
    expect(fvcFromNdvi(0.85)).toBe(1)
    expect(fvcFromNdvi(0.5)).toBeCloseTo(0.25, 6)
    expect(faparFromNdvi(0.9)).toBeCloseTo(0.948, 3)
    expect(faparFromNdvi(0.05)).toBe(0)
    expect(coefficientOfVariation(0.5, 0.1)).toBeCloseTo(0.2, 6)
  })
})

describe('crop footprint tables', () => {
  it('covers every grain, oil, pulse, root and fibre crop of the model', () => {
    for (const c of CROPS.filter((x) => !['clover', 'cover'].includes(x.id) && x.econ.yield > 0)) {
      expect(OFFTAKE[c.id], c.id).toBeDefined()
      expect(TRANSPIRATION_RATIO[c.id], c.id).toBeDefined()
      expect(POLLINATOR[c.id], c.id).toBeDefined()
    }
  })
  it('takes 160 kg N, 62 kg P2O5 and 45 kg K2O off with 8 t of wheat grain', () => {
    expect(removal('wheat', 8)).toEqual({ n: 160, p2o5: 62.4, k2o: 44.8 })
  })
  it('uses the plan’s CO2e per kg of N and lands in the published range for wheat', () => {
    expect(N2O_PER_KG_N).toBeCloseTo(4.29, 2)
    const kg = co2ePerTonne('wheat', 8, 0)!
    expect(kg).toBeGreaterThan(150)
    expect(kg).toBeLessThan(500)
    expect(co2ePerTonne('wheat', 8, 200)!).toBeGreaterThan(kg)
  })
  it('gives wheat an energy return between 4 and 12', () => {
    const r = eroi('wheat', 8, 0)!
    expect(r).toBeGreaterThan(4)
    expect(r).toBeLessThan(12)
  })
  it('splits the water footprint into rain and irrigation', () => {
    expect(waterFootprint(8, 450, 0)).toEqual({ total: 562.5, blueShare: 0 })
    expect(waterFootprint(8, 500, 100)!.blueShare).toBeCloseTo(0.2, 6)
    expect(waterFootprint(0, 500, 0)).toBeNull()
  })
  it('scales pollination risk by dependence and missing habitat', () => {
    expect(pollinationRisk('modest', 0.05)).toBeCloseTo(0.1875, 6)
    expect(pollinationRisk('none', 0)).toBe(0)
    expect(pollinationRisk('great', 0.3)).toBe(0)
  })
  it('reads the open-canopy weeks from FAO-56 stages', () => {
    expect(weedWindowWeeks('maize')).toBeCloseTo((30 + 40 / 2) / 7, 6)
  })
})
