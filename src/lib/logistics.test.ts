// Getting a tonne to market: road, sea or air, the duty at the border, and what spoils on the way.
import { describe, expect, it } from 'vitest'
import { RATES, routeCost, seaKm, type SeaMatrix } from './logistics'
import { gcKm } from './markets'

const torgau: [number, number] = [13.05, 51.52]
// sea km from each country's best port to the buyer's city (as scripts/markets.mjs bakes it), and each country's ports
const hamburg: [number, number] = [9.93, 53.55]
const sea: SeaMatrix = {
  order: ['DEU', 'USA', 'EGY', 'FRA'],
  km: [null, 6500, 6350, 1210, 6500, null, 9800, 6400, 6350, 9800, null, 4000, 1210, 6400, 4000, null],
  snap: [390, 50, 20, 150],
  ports: [[[13.41, 54.21], hamburg], [[-74, 40.7]], [[32.17, 30.95]], [[0.2, 49.5]]],
}

describe('logistics', () => {
  it('reads sea km without adding the port drive twice', () => {
    expect(seaKm(sea, 'DEU', 'USA')).toBe(6500)
    expect(seaKm(sea, 'DEU', 'XXX')).toBeNull()
    expect(seaKm(null, 'DEU', 'USA')).toBeNull()
  })
  it('sells at home at the farm gate: FAOSTAT producer prices are farm-gate, so no freight, duty or spoilage', () => {
    const r = routeCost({ origin: torgau, home: 'DEU', dest: 'DEU', shelfDays: 5, sea })
    expect(r.mode).toBe('local')
    expect(r.tariff).toBe(0)
    expect(r.loss).toBe(0)
    expect(r.freight).toBe(0)
    expect(r.reachable).toBe(true)
  })
  it('exports from the nearest home port, not via the capital', () => {
    const r = routeCost({ origin: torgau, home: 'DEU', dest: 'USA', shelfDays: 365, sea })
    const toPort = Math.min(gcKm(torgau, hamburg), gcKm(torgau, [13.41, 54.21])) * 1.3
    expect(r.km).toBeCloseTo(toPort + 6500, 0)
  })
  it('trades inside the EU with no duty, by whichever of road or sea is cheaper', () => {
    const r = routeCost({ origin: torgau, home: 'DEU', dest: 'FRA', shelfDays: 365, sea })
    expect(['road', 'sea']).toContain(r.mode)
    expect(r.tariff).toBe(0)
    expect(r.reachable).toBe(true)
    const noSea = routeCost({ origin: torgau, home: 'DEU', dest: 'FRA', shelfDays: 365, sea: null })
    expect(noSea.mode).toBe('road')
  })
  it('ships grain across the Atlantic and pays the US duty', () => {
    const r = routeCost({ origin: torgau, home: 'DEU', dest: 'USA', shelfDays: 365, sea })
    expect(r.mode).toBe('sea')
    expect(r.tariff).toBeGreaterThan(0) // Germany and the US share no customs union
    expect(r.days).toBeGreaterThan(10)
    expect(r.reachable).toBe(true)
  })
  it('flies strawberries when the sea is too slow, and it costs thousands per tonne', () => {
    const r = routeCost({ origin: torgau, home: 'DEU', dest: 'USA', shelfDays: 5, sea })
    expect(r.mode).toBe('air')
    expect(r.freight).toBeGreaterThan(1500)
  })
  it('marks a route unreachable when even the air trip outlives the crop', () => {
    const r = routeCost({ origin: torgau, home: 'DEU', dest: 'USA', shelfDays: 1, sea })
    expect(r.reachable).toBe(false)
  })
  it('works before the sea matrix has loaded: home market only', () => {
    expect(routeCost({ origin: torgau, home: 'DEU', dest: 'USA', shelfDays: 365, sea: null }).reachable).toBe(false)
    expect(routeCost({ origin: torgau, home: 'DEU', dest: 'DEU', shelfDays: 365, sea: null }).reachable).toBe(true)
  })
  it('respects food embargoes: no route from the EU or Ukraine into Russia, none from Russia into Ukraine', () => {
    expect(routeCost({ origin: torgau, home: 'DEU', dest: 'RUS', shelfDays: 365, sea }).reachable).toBe(false)
    expect(routeCost({ origin: [33, 47], home: 'UKR', dest: 'RUS', shelfDays: 14, sea: null }).reachable).toBe(false)
    expect(routeCost({ origin: [37.6, 55.7], home: 'RUS', dest: 'UKR', shelfDays: 365, sea: null }).reachable).toBe(false)
    expect(routeCost({ origin: [33, 47], home: 'UKR', dest: 'POL', shelfDays: 365, sea: null }).reachable).toBe(true)
  })
  it('keeps the rates in the documented order of magnitude', () => {
    expect(RATES.airKg * 1000).toBeGreaterThan(RATES.reeferFeu / RATES.feuTonnes)
  })
})
