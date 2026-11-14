// Markets from open records: which country a field is in, what a crop fetches there, and how the numbers fall back.
import { describe, expect, it } from 'vitest'
import { costIndex, countryAt, demandAdj, gcKm, nearestCountry, observedYield, observedYields, priceQuote, regionOf, type Shape } from './markets'
import { decodeOwnPrices, encodeMarketParam, encodeOwnPrices, parseMarketParam, readScenario, scenarioHash } from './urlState'

const square = (iso3: string, w: number, s: number, e: number, n: number): Shape => ({ iso3, bbox: [w, s, e, n], rings: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] })
const shapes = [square('AAA', 0, 0, 10, 10), square('BBB', 10, 0, 20, 10)]
const d = {
  years: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
  prices: { AAA: { wheat: [100, 110, 120, 130, 140, 150, 160, 170, 180, 190] } },
  world: { wheat: 200, maize: 180 },
  subRatio: { 'Test Sub': 0.8 },
  trade: { AAA: { wheat: [100, 300, 0] }, BBB: { wheat: [1000, 0, 800] } },
  countries: [
    { iso3: 'AAA', a2: 'AA', name: 'A', hub: [5, 5], sub: 'Test Sub', union: null, land: 1, island: false, plr: 1, tariff: 0.1 },
    { iso3: 'BBB', a2: 'BB', name: 'B', hub: [15, 5], sub: 'Test Sub', union: null, land: 1, island: false, plr: 0.5, tariff: 0.05 },
  ],
} as never

describe('markets lookups', () => {
  it('finds the country a point lies in, and none in the sea', () => {
    expect(countryAt(5, 5, shapes)).toBe('AAA')
    expect(countryAt(15, 5, shapes)).toBe('BBB')
    expect(countryAt(50, 50, shapes)).toBeNull()
  })
  it('falls back to the nearest hub for a point outside every country', () => {
    expect(nearestCountry(13.05, 51.52)).toBe('DEU') // real data: Torgau
    expect(typeof nearestCountry(0, -89)).toBe('string') // Antarctica still gets a country
  })
  it('scores the 25th percentile of the price years, not the mean', () => {
    const q = priceQuote('AAA', 'wheat', d)!
    expect(q.source).toBe('faostat')
    expect(q.p25).toBeCloseTo(122.5, 1)
    expect(q.median).toBeCloseTo(145, 1)
  })
  it('estimates a missing price from the world price and the sub-region ratio', () => {
    const q = priceQuote('BBB', 'wheat', d)!
    expect(q.source).toBe('estimate')
    expect(q.median).toBeCloseTo(160, 1)
  })
  it('returns null when neither the country nor the world has a price', () => {
    expect(priceQuote('AAA', 'lupin', d)).toBeNull()
  })
  it('gives a deficit market a bonus and a surplus market a malus, capped at ±10 %', () => {
    expect(demandAdj('AAA', 'wheat', d)).toBeCloseTo(0.075, 3) // (300 − 0) / (100 + 300) × 0.1
    expect(demandAdj('BBB', 'wheat', d)).toBeCloseTo(-0.08, 3)
    expect(demandAdj('AAA', 'maize', d)).toBe(0)
  })
  it('lets only the ~15 % of variable costs that are services, repairs and hired labour follow the price level', () => {
    // USDA ERS Commodity Costs and Returns: seed, fertiliser, chemicals and fuel are ≈85 % of operating costs
    expect(costIndex('USA')).toBeLessThan(1.12) // price level 1.6× the EU median
    expect(costIndex('DEU')).toBeGreaterThan(1)
    expect(costIndex('IND')).toBeLessThan(costIndex('DEU'))
    expect(costIndex('IND')).toBeGreaterThan(0.9)
    expect(costIndex('XXX')).toBe(1)
  })
  it('puts the EU in one region and leaves the country itself out', () => {
    const r = regionOf('DEU')
    expect(r).toContain('FRA')
    expect(r).not.toContain('DEU')
    expect(r).not.toContain('USA')
  })
  it('measures great-circle distance', () => {
    expect(gcKm([13.4, 52.5], [2.35, 48.86])).toBeGreaterThan(850)
    expect(gcKm([13.4, 52.5], [2.35, 48.86])).toBeLessThan(900)
  })
})

describe('market in the URL', () => {
  it('reads market modes and treats junk as auto', () => {
    expect(parseMarketParam('USA')).toEqual({ kind: 'to', iso3: 'USA' })
    expect(parseMarketParam('home')).toEqual({ kind: 'home' })
    expect(parseMarketParam('region')).toEqual({ kind: 'region' })
    expect(parseMarketParam('XXX')).toEqual({ kind: 'auto' })
    expect(parseMarketParam(null)).toEqual({ kind: 'auto' })
    expect(encodeMarketParam({ kind: 'auto' })).toBeNull()
    expect(encodeMarketParam({ kind: 'to', iso3: 'EGY' })).toBe('EGY')
    expect(encodeMarketParam({ kind: 'home' })).toBe('home')
  })
  it('round-trips the grower’s own prices and drops junk', () => {
    expect(decodeOwnPrices('wheat~400_maize~abc_tomato~2.5_lupin~-3_nope~5')).toEqual({ wheat: 400, tomato: 2.5 })
    expect(decodeOwnPrices(encodeOwnPrices({ wheat: 400, rapeseed: 380 }) ?? '')).toEqual({ wheat: 400, rapeseed: 380 })
    expect(encodeOwnPrices({})).toBeNull()
  })
})

describe('observed yields', () => {
  it('uses the country’s own FAOSTAT yield where it grows the crop', () => {
    const y = observedYield('USA', 'maize')!
    expect(y.source).toBe('country')
    expect(y.t).toBeGreaterThan(9.5)
    expect(y.t).toBeLessThan(12)
  })
  it('falls back to the sub-region, then the world, where the country does not grow it', () => {
    const y = observedYield('LUX', 'cassava')!
    expect(['region', 'world']).toContain(y.source)
    expect(y.t).toBeGreaterThan(0)
  })
  it('has nothing for a crop that no country reports (cover, ley)', () => {
    expect(observedYield('DEU', 'cover')).toBeNull()
  })
  it('marks a crop grown on under 1 % of the country’s crop land as a niche - Senegal’s 43 t/ha sweet potatoes', () => {
    expect(observedYields('SEN').sweetpotato!.niche).toBe(true)
    expect(observedYields('KAZ').wheat!.niche).toBeFalsy()
  })
  it('gives the engine one map for all field crops, leaving out those nobody reports', () => {
    const m = observedYields('KAZ')
    expect(m.wheat).toEqual(observedYield('KAZ', 'wheat'))
    expect(m.wheat!.source).toBe('country')
    expect(m.cover).toBeUndefined()
    expect(m.clover).toBeUndefined()
  })
})

describe('greenhouse own prices in the URL', () => {
  const withHash = (h: string) => {
    ;(globalThis as { window?: unknown }).window = { location: { hash: h } }
    return readScenario()
  }
  it('keeps decimal € per kg prices (they were split on the decimal point)', () => {
    const s = scenarioHash({ ...withHash('#f=51.5,13.05') as never, field: { kind: 'point', lat: 51.5, lon: 13.05 }, history: [], priorities: { soil: 1, water: 1, profit: 1 }, exclude: [], irrigated: false, budget: 0, replay: null, texture: null, lab: {}, site: 'greenhouse', gh: { cover: 'glass', floorM2: 5000, heated: true, lit: false, screen: true, crop: 'tomato' }, warming: 0, co2: true, ghOwn: { tomato: 2.5, basil: 12 } })
    expect(withHash(s).ghOwn).toEqual({ tomato: 2.5, basil: 12 })
  })
  it('still reads old links that joined pairs with a dot', () => {
    expect(withHash('#f=51.5,13.05&k=g&go=tomato~2.basil~12').ghOwn).toEqual({ tomato: 2, basil: 12 })
  })
})
