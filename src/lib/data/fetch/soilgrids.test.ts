// src/lib/data/fetch/soilgrids.test.ts
import { describe, expect, it } from 'vitest'
import { parseSgExtra, soilValues } from './soilgrids'

const layer = (name: string, d: number, vals: Record<string, [number, number, number]>) => ({
  name,
  unit_measure: { d_factor: d },
  depths: Object.entries(vals).map(([label, [mean, lo, hi]]) => ({ label, values: { mean, 'Q0.05': lo, 'Q0.95': hi } })),
})
const same = (v: [number, number, number]) => ({ '0-5cm': v, '5-15cm': v, '15-30cm': v, '30-60cm': v, '60-100cm': v })
const iowa = {
  properties: {
    layers: [
      layer('sand', 10, same([300, 250, 350])), layer('clay', 10, same([280, 250, 310])), layer('soc', 10, same([300, 200, 400])),
      layer('nitrogen', 100, same([250, 150, 350])), layer('cec', 10, same([200, 150, 250])), layer('phh2o', 10, same([62, 55, 70])),
      layer('bdod', 100, same([130, 120, 140])), layer('wv0010', 10, same([390, 350, 430])), layer('wv0033', 10, same([340, 300, 380])),
      layer('wv1500', 10, same([160, 130, 190])),
    ],
  },
}

describe('SoilGrids extended', () => {
  it('converts units by d_factor and weights depths', () => {
    const s = parseSgExtra(iowa)
    expect(s.top.ph.mean).toBeCloseTo(6.2, 6)
    expect(s.top.ph.lo).toBeCloseTo(5.5, 6)
    expect(s.top.ph.hi).toBeCloseTo(7, 6)
    expect(s.top.cec).toBeCloseTo(20, 6)
    expect(s.top.n).toBeCloseTo(2.5, 6)
    expect(s.top.soc).toBeCloseTo(30, 6)
    expect(s.top.th33).toBeCloseTo(0.34, 6)
    expect(s.sub.bd).toBeCloseTo(1.3, 6)
  })
  it('derives C:N, tension, Ksat and the hydrologic group', () => {
    const v = Object.fromEntries(soilValues(parseSgExtra(iowa), { d0_7: 0.34, d7_28: 0.16, d28_100: 0.25 }, 'live').map((x) => [x.id, x]))
    expect(v.cn.v).toBeCloseTo(12, 6)
    expect(v.psi_0_7.v).toBeCloseTo(33, -1) // at field capacity ≈ 33 kPa
    expect(v.psi_7_28.v).toBeGreaterThan(1000) // at wilting point
    expect(v.hsg.text).toMatch(/^[ABCD]$/)
    expect(v.paw_sg.v).toBeCloseTo((0.34 - 0.16) * 300, 6)
    expect(v.al_risk.v).toBe(0)
  })
  it('refuses a point where SoilGrids has nothing (water, city, rock)', () => {
    const empty = { properties: { layers: iowa.properties.layers.map((l) => ({ ...l, depths: l.depths.map((d) => ({ ...d, values: { mean: null, 'Q0.05': null, 'Q0.95': null } })) })) } }
    expect(() => parseSgExtra(empty as never)).toThrow(/no data/)
  })
})
