// The greenhouse model held to published benchmarks, and its uncertainty analysis to its own promises.
import { describe, expect, it } from 'vitest'
import { BOILER_EFFICIENCY, COVERS, cropPrices, GAS_CO2, GAS_KWH_PER_M3, greenhouseModel, GH_CROP_BY_ID, LOW_TECH, marginFor, normalsFor, NO_TWEAK, rankGreenhouseCrops, SCREEN, type GreenhouseSpec } from './greenhouse'
import { ghConfidence, ghRankUnder, ghThenNow, ghTipping, ghValidity, GH_FAILURE_MODES } from './ghTrust'
import { PARAMS } from './evidence'
import { chpFor, energyFor, GH_DATA } from './ghMarket'
import { load } from './testkit'

const glass: GreenhouseSpec = { cover: 'glass', floorM2: 5000, heated: true, lit: false, screen: true, crop: 'tomato' }
const tunnel: GreenhouseSpec = { cover: 'film', floorM2: 1000, heated: false, lit: false, screen: false, crop: 'tomato' }
const prices = { heat: 0.05, power: 0.18 }

describe('greenhouse model against published benchmarks', () => {
  const { climate } = load('torgau')
  const r = greenhouseModel(climate, glass, prices)
  it('heats a one-screen glass tomato house with more than measured Dutch practice and less than an unscreened house', () => {
    // m³ a.e. of heat a year: 38.9 measured over unlit tomatoes with one screen in the milder Dutch climate (WPR-779,
    // 2016-17); 63.6 for the Dutch single-glass reference house without a screen (De Zwart 1996)
    const m3 = r.totals.heatKwh / GAS_KWH_PER_M3
    expect(m3).toBeGreaterThan(38.9)
    expect(m3).toBeLessThan(63.6)
    // a condensing boiler: 30.6 m³ of gas per GJ of heat (WEcR protocol)
    expect(1000 / BOILER_EFFICIENCY / 31.65).toBeCloseTo(30.6, 6)
  })
  it('yields tomatoes within the Dutch 47-73 kg per m² a year over a full Dutch-style season (sector average to KWIN 2019)', () => {
    const full = r.allYear! // planted once, harvested ten months - the season the Dutch benchmarks describe
    expect(full.yieldKg).toBeGreaterThanOrEqual(47)
    expect(full.yieldKg).toBeLessThanOrEqual(73.4)
  })
  it('charges labour, plants and pots for every month in crop and picking per kilo, and the calendar weighs them', () => {
    const t = GH_CROP_BY_ID.tomato
    expect(r.plan.months.length).toBeGreaterThan(0)
    expect(r.plan.otherCost).toBeCloseTo((t.other / 12) * r.plan.months.length + t.harvest * r.plan.yieldKg, 6)
    expect(r.plan.margin).toBeCloseTo(r.plan.revenue - r.plan.energyCost - r.plan.co2Cost - r.plan.otherCost, 6)
  })
  it('charges an unheated house the plastic-house costs fitted on Andalusia, not the heated farm accounts', () => {
    const t = GH_CROP_BY_ID.tomato
    const p = greenhouseModel(climate, tunnel, prices).plan
    expect(p.months.length).toBeGreaterThan(0)
    expect(p.otherCost).toBeCloseTo((t.lowBase!.other / 12) * LOW_TECH.fixed * p.months.length + t.lowBase!.harvest * LOW_TECH.harvest * p.yieldKg, 6)
  })
  it('loses heat under a closed screen at the rate measured over Dutch tomatoes, with a Venlo house’s leakage (WPR-779, GTB-1366)', () => {
    const g = COVERS.glass
    expect(g.ach).toBe(0.5)
    const k = g.u * g.ratio * SCREEN + g.ach * g.height * 0.33 // W per m² of floor and K, the leakage at 0.33 Wh m⁻³ K⁻¹
    expect(k).toBeGreaterThanOrEqual(3.8)
    expect(k).toBeLessThanOrEqual(4.4)
  })
  it('charges a heated tomato house the Flemish farm accounts’ plants, materials and labour (LMN 2014-2018: ≈ €21 per m² at 56.4 kg)', () => {
    const t = GH_CROP_BY_ID.tomato
    expect(t.other + t.harvest * 56.4).toBeCloseTo(3.35 + 1.1 + 0.67 + 0.77 + 0.47 + 0.26 + 0.41 + 13.97, 0)
  })
  it('uses the Flemish heated-glass strawberry price (2 045 € per 550 kg per are)', () => {
    expect(GH_CROP_BY_ID.strawberry.price).toBeCloseTo(2045 / 550, 1)
  })
  it('uses the IPCC 2006 emission factor for natural gas (56 100 kg CO₂ per TJ)', () => {
    expect(GAS_CO2).toBeCloseTo(0.202, 3)
  })
  it('names a source or says why not for every greenhouse parameter', () => {
    const gh = PARAMS.filter((p) => p.group === 'Greenhouse')
    expect(gh.length).toBeGreaterThanOrEqual(15)
    for (const p of gh) if (p.kind === 'literature') expect(p.sources.length, p.id).toBeGreaterThan(0)
  })
})

describe('how sure the greenhouse pick is', () => {
  const { climate } = load('torgau')
  it('is deterministic and never shares out more than all the runs', () => {
    const a = ghConfidence(climate, glass, prices, 60)
    const b = ghConfidence(climate, glass, prices, 60)
    expect(a).toEqual(b)
    expect(a.shares.reduce((s, x) => s + x.share, 0)).toBeLessThanOrEqual(1 + 1e-9)
    expect(a.shares[0].share).toBeGreaterThanOrEqual(a.shares[1].share)
  })
  it('reports the price drop at which the pick really loses first place', () => {
    // a Kansas plastic tunnel: several crops pay and score close together, so a price drop can flip the pick
    const { climate: kansas } = load('kansas')
    const tip = ghTipping(kansas, tunnel, prices)
    expect(tip.ownPrice).not.toBeNull()
    const pick = ghRankUnder(kansas, tunnel, prices, () => NO_TWEAK)[0].id
    const top = (drop: number) => ghRankUnder(kansas, tunnel, prices, (id) => (id === pick ? { ...NO_TWEAK, price: 1 - drop } : NO_TWEAK))[0].id
    expect(top(tip.ownPrice!.drop - 0.02)).toBe(pick)
    expect(top(tip.ownPrice!.drop)).toBe(tip.ownPrice!.to)
  })
  it('flips the pick of a heated cucumber-or-tomato house when gas gets expensive enough, or says it never does', () => {
    const tip = ghTipping(climate, glass, prices)
    expect(tip.heat).not.toBeNull()
    if (tip.heat!.high !== null) expect(tip.heat!.high).toBeGreaterThan(prices.heat)
    if (tip.heat!.low !== null) expect(tip.heat!.low).toBeLessThan(prices.heat)
  })
  it('replans the same house on the 1981-2010 climate', () => {
    const tn = ghThenNow(climate, tunnel, prices)
    expect(tn.topNow).not.toBeNull()
    expect(tn.marginNow).toBeGreaterThan(0)
  })
})

describe('where the greenhouse model stops', () => {
  it('flags hot summers for cooling, a thin herb market, and a house no crop can pay for', () => {
    const { climate } = load('kansas')
    const film = greenhouseModel(climate, tunnel, prices)
    expect(ghValidity(climate, film, rankGreenhouseCrops(climate, tunnel, prices)).find((f) => f.id === 'cooling')!.level).not.toBe('ok')
    const big = { ...glass, floorM2: 10000 }
    const ranking = rankGreenhouseCrops(climate, big, prices)
    if (ranking[0].crop.id === 'basil') expect(ghValidity(climate, greenhouseModel(climate, big, prices), ranking).some((f) => f.id === 'market')).toBe(true)
    // a heated house can always fall back on a summer run that needs no heat, so "nothing pays" is rare: check the rule
    const r = greenhouseModel(climate, glass, prices)
    const none = rankGreenhouseCrops(climate, glass, prices).map((x) => ({ ...x, plan: { ...x.plan, margin: 0 } }))
    expect(ghValidity(climate, r, none).some((f) => f.id === 'nocrop' && f.level === 'out')).toBe(true)
  })
  it('lists every failure mode the site check can raise', () => {
    const ids = new Set(GH_FAILURE_MODES.map((m) => m.id))
    for (const id of ['cooling', 'tropics', 'darkwinter', 'market', 'nocrop', 'estimatedsun']) expect(ids.has(id), id).toBe(true)
  })
})

describe('greenhouse at a market', () => {
  const { climate } = load('torgau')
  // heated glass strawberries make money in Torgau at the test energy prices (≈ €10 per m² a year)
  const berries: GreenhouseSpec = { ...glass, crop: 'strawberry' }
  it('a dearer market raises the margin, the delivery cost lowers it', () => {
    const base = greenhouseModel(climate, berries, prices).plan.margin
    const dear = greenhouseModel(climate, berries, { ...prices, market: { level: { strawberry: 1.5 }, perKg: {}, label: 'X' } }).plan.margin
    const far = greenhouseModel(climate, berries, { ...prices, market: { level: { strawberry: 1 }, perKg: { strawberry: 0.5 }, label: 'X' } }).plan.margin
    expect(base).toBeGreaterThan(0)
    expect(dear).toBeGreaterThan(base)
    expect(far).toBeLessThan(base)
  })
  it('the grower’s own price still wins over any market', () => {
    const own = cropPrices(GH_CROP_BY_ID.tomato, 51.5, { ...prices, own: { tomato: 3 }, market: { level: { tomato: 9 }, perKg: { tomato: 1 }, label: 'X' } })
    expect(own.every((v) => v === 3)).toBe(true)
  })
})

describe('what a Dutch glasshouse pays for gas, and combined heat and power', () => {
  it('prices Dutch boiler gas at the glasshouse tariff: above the price before taxes, below the general band I3 price', () => {
    // 2019: €6.07/GJ before taxes for users of 10-100 TJ (CBS 81309NED) = €0.0219/kWh; Eurostat band I3 with the general tax €0.0337
    const nl = energyFor('NL', 2019)!.heat
    expect(nl).toBeGreaterThan(6.07 / 277.78)
    expect(nl).toBeLessThan(GH_DATA.gas.NL['2019'])
    expect(energyFor('DE', 2019)!.heat).toBe(GH_DATA.gas.DE['2019']) // elsewhere the Eurostat price stays
  })
  it('runs the engine only in months it beats the boiler, sells power then, and counts all the gas it burns', () => {
    const { climate } = load('torgau')
    const p = { ...prices, chp: chpFor('DE', 2022)! }
    const boiler = greenhouseModel(climate, glass, p)
    const engine = greenhouseModel(climate, { ...glass, chp: true }, p)
    engine.months.forEach((m, i) => {
      expect(m.energyCost).toBeLessThanOrEqual(boiler.months[i].energyCost + 1e-9)
      expect(m.carbonKg).toBeGreaterThanOrEqual(boiler.months[i].carbonKg - 1e-9) // unlit: no grid power to displace
    })
    expect(engine.months.some((m) => m.chpSales > 0)).toBe(true) // 2022's power prices pay
    expect(greenhouseModel(climate, { ...tunnel, chp: true }, p).months.every((m) => m.chpSales === 0)).toBe(true) // unheated: no engine
    expect(chpFor('ES', 2022)).toBeNull() // no power prices kept: the toggle is not offered
  })
})
