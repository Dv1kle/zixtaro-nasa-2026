// Where each crop nets most once it has travelled: home, the region next door, or wherever the grower ships.
import { describe, expect, it } from 'vitest'
import { buildMarket, exportsCrop, ghMarketPrices, parseOwnPrice, shipOptions, worldP90 } from './marketProfit'
import { MARKETS } from './markets'
import sea from '../../public/data/markets/sea.json'
import type { SeaMatrix } from './logistics'

const torgau: [number, number] = [13.05, 51.52]
const S = sea as SeaMatrix

describe('market quotes', () => {
  it('sells at home in home mode', () => {
    const m = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'home' }, crops: ['wheat', 'maize'], sea: S })
    expect(m.quotes.wheat!.market).toBe('DEU')
    expect(m.quotes.wheat!.netPerT).toBeCloseTo(m.quotes.wheat!.homeNetPerT, 6)
  })
  it('in auto mode never does worse than home', () => {
    const m = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'auto' }, crops: ['wheat', 'maize', 'rapeseed'], sea: S })
    for (const q of Object.values(m.quotes)) expect(q!.netPerT).toBeGreaterThanOrEqual(q!.homeNetPerT - 1e-9)
  })
  it('auto only chases markets big enough to take a harvest and priced from records, not tiny noisy ones', () => {
    const m = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'auto' }, crops: ['wheat', 'maize', 'tomato', 'strawberry'], sea: S })
    for (const q of Object.values(m.quotes)) {
      expect(['MLT', 'CYP', 'LUX']).not.toContain(q!.market)
      if (q!.market !== 'DEU') expect(['faostat', 'import']).toContain(q!.source)
    }
  })
  it('a tiny home market is a niche: its price is capped at the world median for scoring, and flagged', () => {
    const m = buildMarket({ origin: [-93.47, 42.03], home: 'USA', mode: { kind: 'home' }, crops: ['cowpea', 'maize'], sea: S })
    expect(m.quotes.cowpea!.niche).toBe(true)
    expect(m.quotes.cowpea!.price).toBeLessThanOrEqual(MARKETS.world.cowpea!)
    expect(m.quotes.maize!.niche).toBe(false)
  })
  it('ships to a chosen country and shows the difference against home', () => {
    const m = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'to', iso3: 'EGY' }, crops: ['wheat'], sea: S })
    expect(m.quotes.wheat!.market).toBe('EGY')
    expect(m.quotes.wheat!.route.mode).toBe('sea')
  })
  it('flies greenhouse strawberries to the US and the net stays a finite number, however negative', () => {
    const m = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'to', iso3: 'USA' }, crops: ['strawberry'], sea: S })
    const q = m.quotes.strawberry!
    expect(q.route.mode).toBe('air')
    expect(Number.isFinite(q.netPerT)).toBe(true)
  })
  it('uses the grower’s own price and ignores junk input', () => {
    const m = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'home' }, crops: ['wheat'], sea: S, own: { wheat: 400 } })
    expect(m.quotes.wheat!.source).toBe('yours')
    expect(m.quotes.wheat!.price).toBe(400)
    for (const bad of [0, -5, NaN, '', 'abc', null, undefined, Infinity]) expect(parseOwnPrice(bad)).toBeNull()
    expect(parseOwnPrice('250')).toBe(250)
    const junk = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'home' }, crops: ['wheat'], sea: S, own: { wheat: NaN } })
    expect(junk.quotes.wheat!.source).toBe('faostat')
  })
  it('falls back to home when the sea matrix is missing', () => {
    const m = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'to', iso3: 'USA' }, crops: ['wheat'], sea: null, routes: 'loading' })
    expect(m.quotes.wheat!.market).toBe('DEU')
    expect(m.routes).toBe('loading')
  })
  it('an island with no price records still gets estimated quotes, and auto keeps home when nothing beats it', () => {
    const m = buildMarket({ origin: [158.15, 6.92], home: 'FSM', mode: { kind: 'auto' }, crops: ['maize'], sea: S })
    const q = m.quotes.maize!
    expect(q).toBeDefined()
    expect(Number.isFinite(q.netPerT)).toBe(true)
  })
  it('auto sells abroad only what the country really ships: Guinea imports its rice, so Guinean rice sells at home', () => {
    expect(exportsCrop('GIN', 'rice')).toBe(false)
    expect(exportsCrop('PRY', 'soybean')).toBe(true)
    const m = buildMarket({ origin: [-13.25, 10.25], home: 'GIN', mode: { kind: 'auto' }, crops: ['rice'], sea: S })
    expect(m.quotes.rice!.market).toBe('GIN')
  })
  it('auto ignores a neighbour whose price is out of reach of any trade (Kyrgyz rice at 5x the Kazakh price)', () => {
    const m = buildMarket({ origin: [65.75, 51.25], home: 'KAZ', mode: { kind: 'auto' }, crops: ['rice'], sea: S })
    expect(m.quotes.rice!.netPerT).toBeLessThanOrEqual(m.quotes.rice!.homeNetPerT * 1.3 + 1e-9)
  })
  it('an unknown destination reads as home', () => {
    const m = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'to', iso3: 'XXX' }, crops: ['wheat'], sea: S })
    expect(m.quotes.wheat!.market).toBe('DEU')
  })
})

describe('greenhouse prices at a market', () => {
  const all = ['tomato', 'cucumber', 'strawberry'] as const
  it('inside the EU the DG AGRI record is the market: level 1, no delivery cost at home', () => {
    const m = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'home' }, crops: [...all], sea: S })
    const g = ghMarketPrices(m, 51.5)
    expect(g.level.tomato).toBe(1)
    expect(g.perKg.tomato).toBe(0)
  })
  it('outside the EU the level follows that country’s price against the EU reference, and flying costs per kg', () => {
    const m = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'to', iso3: 'USA' }, crops: [...all], sea: S })
    const g = ghMarketPrices(m, 51.5)
    expect(g.level.tomato).toBeGreaterThan(0.3)
    expect(g.level.tomato).not.toBe(1)
    expect(g.perKg.strawberry).toBeGreaterThan(2) // air ≈ €2.5 per kg
    expect(g.label).toBe('USA')
  })
})

describe('where to ship one crop', () => {
  it('compares home, big neighbours and the world’s big importers, best first, home always included', () => {
    const list = shipOptions({ origin: torgau, home: 'DEU', crop: 'wheat', sea: S })
    expect(list.some((q) => q.market === 'DEU')).toBe(true)
    expect(list.length).toBeGreaterThan(4)
    for (let i = 1; i < list.length; i++) expect(list[i - 1].netPerT).toBeGreaterThanOrEqual(list[i].netPerT)
    expect(list.some((q) => q.market === 'EGY')).toBe(true) // the world's largest wheat importer
    expect(list.some((q) => q.market === 'RUS')).toBe(false) // embargo: not reachable, not listed
  })
  it('a country that grows almost none of what it imports pays the world price (import parity), not its tiny farm-gate market', () => {
    const idn = shipOptions({ origin: torgau, home: 'DEU', crop: 'wheat', sea: S }).find((q) => q.market === 'IDN')!
    expect(idn.price).toBeLessThanOrEqual(MARKETS.world.wheat!)
    expect(idn.source).toBe('import')
  })
})

describe('outlier prices abroad', () => {
  it('a buyer abroad is priced at most at the 90th percentile of the world’s farm-gate prices (Romanian dry peas were 3x the world)', () => {
    const p90 = worldP90('pea')!
    expect(p90).toBeGreaterThan(MARKETS.world.pea!)
    for (const q of shipOptions({ origin: torgau, home: 'DEU', crop: 'pea', sea: S })) {
      if (q.market !== 'DEU') expect(q.price).toBeLessThanOrEqual(p90 + 1e-9)
    }
  })
})
