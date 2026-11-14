// The cutaway draws only what the greenhouse model says: its month values held to the model's own numbers.
import { describe, expect, it } from 'vitest'
import { cutawayMonth, yearTank } from './ghCutaway'
import { greenhouseModel, type GreenhouseSpec } from './greenhouse'
import { load } from './testkit'

const glass: GreenhouseSpec = { cover: 'glass', floorM2: 5000, heated: true, lit: false, screen: true, crop: 'tomato' }
const tunnel: GreenhouseSpec = { cover: 'film', floorM2: 1000, heated: false, lit: false, screen: false, crop: 'tomato' }
const prices = { heat: 0.05, power: 0.18 }

describe('greenhouse cutaway: month values', () => {
  const { climate } = load('torgau')
  const r = greenhouseModel(climate, glass, prices)
  const levels = yearTank(r)
  const months = r.months.map((_, i) => cutawayMonth(r, i, levels))

  it('keeps the tank between empty and full, one level a month', () => {
    expect(levels).toHaveLength(12)
    for (const l of levels) {
      expect(l).toBeGreaterThanOrEqual(0)
      expect(l).toBeLessThanOrEqual(1)
    }
  })

  it('grows the crop only while it stands in the house, and fully only at harvest', () => {
    for (const c of months) {
      if (!c.inCrop) expect(c.growth).toBe(0)
      if (c.harvest) expect(c.growth).toBe(1)
      if (c.m.state === 'establish') {
        expect(c.growth).toBeGreaterThan(0)
        expect(c.growth).toBeLessThan(1)
      }
    }
  })

  it('lights the boiler, and draws the night screen, only in months the model really heats', () => {
    for (const c of months) {
      if (c.heat > 0) expect(c.m.heatKwh).toBeGreaterThanOrEqual(5)
      expect(c.screen).toBe(c.heat > 0)
      expect(c.heat).toBeLessThanOrEqual(1)
    }
    expect(months.some((c) => c.heat > 0)).toBe(true)
  })

  it('scales the sun to the brightest month and calls the dark months night', () => {
    expect(Math.max(...months.map((c) => c.light))).toBeCloseTo(1, 6)
    for (const c of months) expect(c.night).toBe(c.light < 0.4)
  })

  it('lays snow only under a freezing mean, frost only under freezing nights, and keeps every share in 0-1', () => {
    for (const c of months) {
      for (const v of [c.vent, c.snow, c.frost, c.wet, c.green, c.fog]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      if (c.snow > 0) expect(c.m.tOut).toBeLessThan(0)
      if (c.frost > 0) expect(c.m.tMinOut).toBeLessThan(0)
      if (!c.inCrop) expect(c.fog).toBe(0)
      if (c.m.insideDayMax < r.crop.dayT - 2) expect(c.vent).toBe(0)
    }
  })

  it('opens the vents wider in the hottest month than in the coldest', () => {
    const byT = [...months].sort((a, b) => a.m.tOut - b.m.tOut)
    expect(byT[byT.length - 1].vent).toBeGreaterThan(byT[0].vent)
  })

  it('never heats, lights or screens a house that has none of them', () => {
    const t = greenhouseModel(climate, tunnel, prices)
    const tl = yearTank(t)
    for (let i = 0; i < 12; i++) {
      const c = cutawayMonth(t, i, tl)
      expect(c.heat).toBe(0)
      expect(c.lamps).toBe(false)
      expect(c.screen).toBe(false)
    }
  })
})
