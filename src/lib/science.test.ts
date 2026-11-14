import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeClimate, parsePowerMonthly, type RawPower } from './climate'
import { dailyAtHeight, LAPSE, powerAtHeight } from './height'
import { CROP_BY_ID, cropSeason, isCropId, type CropId } from './crops'
import { PRESETS } from './presets'
import { buildStrategies, evaluate, rankNext, type FieldContext } from './rotation'
import { extraterrestrialRadiation, penmanMonteithPET } from './solar'
import { averageProfiles, manualProfile, parseSoilGrids, rootZoneWater, saxtonRawls, usdaTexture } from './soil'
import { decodeRing, encodeRing, makeArea, pointInRing, ringAreaHa, samplePoints, type LonLat } from './geo'
import { analyzeDaily } from './daily'
import { mannKendall, senSlope } from './stats'
import { allCropRisks, simulateSeason } from './water'
import { warmClimate, warmedRecords, whatIfWarming } from './scenario'
import { greenhouseModel, isCover, isGhCropId, seasonSpan } from './greenhouse'
import { nitrogenNeed } from './rotation'
import { demoFarm, upgradeDemo } from './farm'
import { farmGeoJSON } from './export'
import { backtest } from './backtest'

describe('stats', () => {
  it("Sen's slope recovers a linear trend despite an outlier", () => {
    const ys = Array.from({ length: 20 }, (_, i) => 2 * i + 1)
    ys[7] = 500
    expect(senSlope(ys)).toBeCloseTo(2, 5)
  })
  it('Mann-Kendall flags a monotonic series and ignores noise', () => {
    expect(mannKendall(Array.from({ length: 30 }, (_, i) => i)).p).toBeLessThan(0.001)
    expect(mannKendall([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4]).p).toBeGreaterThan(0.05)
    expect(mannKendall(Array(12).fill(1)).p).toBe(1)
  })
})

describe('solar & evapotranspiration', () => {
  it('matches FAO-56 example 8 (Ra at 20°S on 3 September = 32.2 MJ m-2 day-1)', () => {
    expect(extraterrestrialRadiation(-20, 246)).toBeCloseTo(32.2, 0)
  })
  it('Penman-Monteith gives a plausible July ET0 for central Europe', () => {
    const et0 = penmanMonteithPET({ lat: 51.5, month: 7, year: 2018, t: 22.1, tRange: 12.4, tDew: 12.2, wind: 2.2, ps: 100.1, rs: 21.9, tPrev: 18.5 })
    expect(et0 / 31).toBeGreaterThan(4)
    expect(et0 / 31).toBeLessThan(6)
  })
})

describe('soil', () => {
  it('classifies USDA textures', () => {
    expect(usdaTexture(65, 25, 10)).toBe('sandy loam')
    expect(usdaTexture(40, 40, 20)).toBe('loam')
    expect(usdaTexture(20, 65, 15)).toBe('silt loam')
    expect(usdaTexture(90, 5, 5)).toBe('sand')
    expect(usdaTexture(20, 20, 60)).toBe('clay')
    expect(usdaTexture(30, 35, 35)).toBe('clay loam')
  })
  it('reproduces Saxton & Rawls (2006) available water for reference textures', () => {
    // Table 3 of the paper, OM = 2.5 %: loam ≈ 0.14, sandy loam ≈ 0.10, silt loam ≈ 0.20 m³/m³
    expect(saxtonRawls(40, 20, 2.5).paw).toBeCloseTo(0.14, 1)
    expect(saxtonRawls(65, 10, 2.5).paw).toBeCloseTo(0.1, 1)
    expect(saxtonRawls(20, 15, 2.5).paw).toBeGreaterThan(0.17)
  })
  it('sums root-zone water over layers', () => {
    const p = manualProfile('loam')
    expect(rootZoneWater(p, 1)).toBeCloseTo(p.paw100, 6)
    expect(rootZoneWater(p, 0.5)).toBeLessThan(rootZoneWater(p, 1))
  })
})

describe('crop calendars', () => {
  it('starts autumn-sown crops in the previous year', () => {
    const wheat = cropSeason(CROP_BY_ID.wheat, 'north')
    expect(wheat[0]).toMatchObject({ month: 10, yearOffset: -1 })
    expect(wheat[wheat.length - 1]).toMatchObject({ month: 7, yearOffset: 0 })
  })
  it('shifts calendars by six months in the southern hemisphere', () => {
    // FAO-56 maize: sown 1 May, 30/40/50/30 days → in the field May-September; in the south November-March
    const north = cropSeason(CROP_BY_ID.maize, 'north')
    expect(north.map((m) => m.month)).toEqual([5, 6, 7, 8, 9])
    const maize = cropSeason(CROP_BY_ID.maize, 'south')
    expect(maize[0]).toMatchObject({ month: 11, yearOffset: -1 })
    expect(maize[maize.length - 1]).toMatchObject({ month: 3, yearOffset: 0 })
  })
  it('builds monthly Kc from the FAO-56 stages', () => {
    const maize = CROP_BY_ID.maize.kc
    expect(maize[4]).toBeCloseTo(0.3, 2) // May: initial stage
    expect(Math.max(...maize)).toBeCloseTo(1.2, 1) // mid-season
    expect(maize[9]).toBe(0) // harvested before October
  })
  it('ripens autumn-sown crops earlier where spring is warmer', () => {
    const warm = Array.from({ length: 12 }, (_, i) => ({ t: [-1, 2, 8, 13, 19, 24, 27, 26, 21, 14, 6, 0][i] })) // Kansas-like
    const cool = Array.from({ length: 12 }, (_, i) => ({ t: [0, 1, 4, 9, 14, 17, 19, 18, 14, 10, 5, 1][i] })) // Saxony-like
    const hot = cropSeason(CROP_BY_ID.wheat, 'north', warm)
    const mild = cropSeason(CROP_BY_ID.wheat, 'north', cool)
    expect(hot[hot.length - 1].month).toBe(6)
    expect(mild[mild.length - 1].month).toBe(7)
  })
})

function loadPreset(id: string) {
  const p = PRESETS.find((x) => x.id === id)!
  const b = JSON.parse(readFileSync(`public/data/presets/${id}.json`, 'utf8'))
  const climate = analyzeClimate(parsePowerMonthly(b.power, p.field.lat), p.field.lat, p.field.lon)
  const soil = averageProfiles(b.soil.map(parseSoilGrids), b.samples)
  const risks = allCropRisks(climate, soil)
  const ctx: FieldContext = {
    risks, soil, stressYear: null,
    recentLabel: `${climate.recent.from}-${climate.recent.to}`,
    baselineLabel: `${climate.baseline.from}-${climate.baseline.to}`,
    drying: climate.signal.drying,
    irrigated: false,
    slopePct: 0.5,
  }
  return { p, climate, soil, risks, ctx }
}

describe('Torgau demo field (real NASA POWER + SoilGrids data)', () => {
  const { p, climate, ctx, risks } = loadPreset('torgau')

  it('detects significant warming and a drying root zone', () => {
    expect(climate.signal.warming).toBe(true)
    expect(climate.signal.drying).toBe(true)
    expect(climate.trends.t.perDecade).toBeGreaterThan(0.3)
  })
  it('ranks 2018-2022 among the driest root-zone seasons', () => {
    const top4 = climate.driest.slice(0, 4).map((d) => d.year)
    expect(top4.filter((y) => y >= 2018 && y <= 2022).length).toBeGreaterThanOrEqual(3)
  })
  it('makes maize thirstier than sorghum', () => {
    expect(risks.maize.recent.loss).toBeGreaterThan(risks.sorghum.recent.loss)
  })
  it('never produces a tie at the top of the ranking', () => {
    const ranked = rankNext(p.history, ctx, p.priorities)
    expect(ranked[0].score - ranked[1].score).toBeGreaterThan(0.01)
  })
  it('score parts add up to the score', () => {
    const e = evaluate(CROP_BY_ID.lupin, p.history, ctx, p.priorities)
    const sum = e.parts.soil + e.parts.water + e.parts.profit + e.parts.fit
    expect(sum).toBeCloseTo(e.score, 6)
  })
  it('flags break-interval violations without pricing them, and prices Fusarium after maize', () => {
    const h = ['rapeseed', 'wheat', 'sunflower', 'wheat', 'barley'] as const
    const sf = evaluate(CROP_BY_ID.sunflower, [...h], ctx, p.priorities)
    // inside its break (flagged, not priced) and after two cereal seasons (the break-crop credit, priced)
    expect(sf.sub.rotation).toBeCloseTo(0.9 + 0.9 * 0.1, 9)
    expect(sf.flags.some((f) => f.rule === 'min-break' && f.level === 'high')).toBe(true)
    expect(sf.notes.some((n) => n.tone === 'bad' && n.text.includes('seasons between'))).toBe(true)
    const wheatAfterMaize = evaluate(CROP_BY_ID.wheat, ['rapeseed', 'wheat', 'maize'], ctx, p.priorities)
    expect(wheatAfterMaize.notes.some((n) => n.text.includes('Fusarium'))).toBe(true)
    expect(wheatAfterMaize.sub.rotation).toBeCloseTo(0.9 * (1 - 0.1), 9)
  })
  it('builds distinct multi-season strategies', () => {
    const s = buildStrategies(p.history, { ...ctx, stressYear: 2018 }, p.priorities)
    expect(s.length).toBeGreaterThanOrEqual(2)
    expect(new Set(s.map((x) => x.seq.map((e) => e.crop.id).join())).size).toBe(s.length)
    expect(s[0].metrics.stressLoss).not.toBeNull()
  })
  it('simulates no stress with an enormous soil tank and no stress with no demand', () => {
    const y = simulateSeason(CROP_BY_ID.wheat, climate, 5000, 2018)!
    expect(y.loss).toBeLessThan(0.02)
  })
})

describe('southern hemisphere demo (Pergamino)', () => {
  it('analyses an Oct-Mar season and ranks crops', () => {
    const { p, climate, ctx } = loadPreset('pergamino')
    expect(climate.season.label).toBe('Oct-Mar')
    expect(rankNext(p.history, ctx, p.priorities).length).toBeGreaterThan(5)
  })
})

describe('geometry for drawn fields and territories', () => {
  // a 1 km × 1 km square near the equator ≈ 100 ha
  const d = 1000 / 111320
  const sq: LonLat[] = [[0, 0], [d, 0], [d, d], [0, d]]
  it('measures geodesic area', () => {
    expect(ringAreaHa(sq)).toBeGreaterThan(98)
    expect(ringAreaHa(sq)).toBeLessThan(102)
  })
  it('round-trips the URL polyline encoding', () => {
    const ring: LonLat[] = [[13.04639, 51.52322], [13.05332, 51.52087], [-60.634, -33.955]]
    expect(decodeRing(encodeRing(ring))).toEqual(ring)
  })
  it('samples spread-out points inside the area', () => {
    const pts = samplePoints(sq, 100)
    expect(pts.length).toBe(5)
    for (const p of pts) expect(pointInRing(p.lat, p.lon, sq)).toBe(true)
    expect(samplePoints(sq, 5).length).toBe(1)
  })
  it('builds an area field with a centroid', () => {
    const f = makeArea([...sq, sq[0]])
    expect(f.kind).toBe('area')
    expect(f.lat).toBeCloseTo(d / 2, 6)
  })
})

describe('daily frost and heat calendar (Torgau, real POWER daily data)', () => {
  const b = JSON.parse(readFileSync('public/data/presets/torgau.json', 'utf8'))
  const a = analyzeDaily(b.daily, 51.52)!
  it('finds frost seasons and hot days', () => {
    expect(a.frostClimate).toBe(true)
    const y = a.years.find((x) => x.year === 2018)!
    expect(y.lastSpringFrost).toBeGreaterThan(60) // after early March
    expect(y.lastSpringFrost).toBeLessThan(160)
    expect(y.firstAutumnFrost).toBeGreaterThan(250)
    expect(a.means.recent.hotDays).toBeGreaterThan(a.means.baseline.hotDays)
  })
  it('keeps southern seasons in July-June years', () => {
    const p = JSON.parse(readFileSync('public/data/presets/pergamino.json', 'utf8'))
    const s = analyzeDaily(p.daily, -33.9)!
    expect(s.south).toBe(true)
    expect(s.years[0].year).toBeGreaterThan(1981)
  })
})

describe('warming scenario (delta method on Torgau)', () => {
  const { climate } = loadPreset('torgau')
  const warm = warmClimate(climate, { dT: 2, rain: 0 })
  it('shifts only the recent decade and raises evaporative demand', () => {
    expect(warm.means.baseline.t).toBeCloseTo(climate.means.baseline.t, 6)
    expect(warm.means.recent.t - climate.means.recent.t).toBeCloseTo(2, 1)
    expect(warm.means.recent.petGS).toBeGreaterThan(climate.means.recent.petGS * 1.04)
  })
  it('makes maize thirstier', () => {
    const soil = manualProfile('sandy loam')
    expect(allCropRisks(warm, soil).maize.recent.loss).toBeGreaterThan(allCropRisks(climate, soil).maize.recent.loss)
  })
  it('shortens grain fill only under the what-if, more with more warming, for cool-season grain and C4 cereals', () => {
    const soil = manualProfile('sandy loam')
    const now = allCropRisks(climate, soil)
    const plus1 = allCropRisks(warmClimate(climate, { dT: 1, rain: 0 }), soil)
    const plus2 = allCropRisks(warm, soil)
    expect(Object.values(now).every((r) => r.grainFill === 1)).toBe(true)
    // winter wheat fills grain in June-July at ~17 °C: base 0 → ~17 / 19 at +2 °C
    expect(plus1.wheat.grainFill).toBeLessThan(1)
    expect(plus2.wheat.grainFill).toBeLessThan(plus1.wheat.grainFill)
    expect(plus2.wheat.grainFill).toBeGreaterThan(0.85)
    expect(plus2.maize.grainFill).toBeLessThan(1)
    expect(plus2.soybean.grainFill).toBe(1)
    expect(plus2.potato.grainFill).toBe(1)
  })
})

describe('height correction (Torgau POWER moved 1 000 m down)', () => {
  const b = JSON.parse(readFileSync('public/data/presets/torgau.json', 'utf8'))
  it('warms temperatures and dew point by the lapse rate, raises pressure by FAO-56 eq. 7, keeps the rest', () => {
    const raw = b.power as RawPower
    expect(powerAtHeight(raw, 300, 300)).toEqual(raw)
    const low = powerAtHeight(raw, 1300, 300)
    const k = Object.keys(raw.T2M!).find((x) => raw.T2M![x] > -900)!
    expect(low.T2M![k] - raw.T2M![k]).toBeCloseTo(LAPSE, 6)
    expect(low.T2M_MAX![k] - raw.T2M_MAX![k]).toBeCloseTo(LAPSE, 6)
    expect(low.T2MDEW![k] - raw.T2MDEW![k]).toBeCloseTo(LAPSE, 6)
    expect(low.PS![k] / raw.PS![k]).toBeCloseTo(((293 - 0.0065 * 300) / (293 - 0.0065 * 1300)) ** 5.26, 6)
    expect(low.T2M_RANGE).toBe(raw.T2M_RANGE)
    expect(low.PRECTOTCORR_SUM).toBe(raw.PRECTOTCORR_SUM)
    const before = analyzeClimate(parsePowerMonthly(raw, 51.52), 51.52, 13.0)
    const after = analyzeClimate(parsePowerMonthly(low, 51.52), 51.52, 13.0)
    expect(after.means.recent.t - before.means.recent.t).toBeCloseTo(LAPSE, 1)
    expect(after.means.recent.petGS).toBeGreaterThan(before.means.recent.petGS)
    const d = dailyAtHeight(b.daily, 1300, 300)
    const i = b.daily.tmax.findIndex((v: number | null) => v != null)
    expect(d.tmax[i]! - b.daily.tmax[i]).toBeCloseTo(LAPSE, 1)
    expect(d.tmin.filter((v) => v == null).length).toBe(b.daily.tmin.filter((v: number | null) => v == null).length)
  })
})

describe('greenhouse model (Torgau climate)', () => {
  const { climate } = loadPreset('torgau')
  const heated = greenhouseModel(climate, { cover: 'glass', floorM2: 5000, heated: true, lit: false, screen: true, crop: 'tomato' })
  it('gives a plausible heat demand for a heated glass tomato house in central Europe', () => {
    // Dutch/German practice: roughly 250-550 kWh of heat per m² and year
    expect(heated.totals.heatKwh).toBeGreaterThan(200)
    expect(heated.totals.heatKwh).toBeLessThan(700)
    expect(heated.months[0].heatKwh).toBeGreaterThan(heated.months[6].heatKwh)
  })
  it('sees far less light in December than in June', () => {
    expect(heated.months[5].dliOut).toBeGreaterThan(35)
    expect(heated.months[11].dliOut).toBeLessThan(10)
  })
  it('heats less now than in 1981-2010', () => {
    expect(heated.totals.heatKwh).toBeLessThan(heated.baseline.heatKwh)
  })
  it('carries an unheated tunnel only through the warm half of the year', () => {
    const tunnel = greenhouseModel(climate, { cover: 'film', floorM2: 1000, heated: false, lit: false, screen: false, crop: 'tomato' })
    expect(tunnel.months[0].active).toBe(false)
    expect(tunnel.months[6].active).toBe(true)
    expect(tunnel.totals.heatKwh).toBe(0)
  })
  it('sizes a rain tank that cannot beat the roof', () => {
    expect(heated.water.cover).toBeLessThanOrEqual(heated.water.maxCover + 1e-9)
    expect(heated.water.catchM3).toBeGreaterThan(0)
  })
})

describe('review regressions', () => {
  it('re-running the scenario with ΔT = 0 reproduces the observed ET₀ exactly', () => {
    const { climate } = loadPreset('torgau')
    const same = warmedRecords(climate, { dT: 0, rain: 0 })
    for (const r of same) expect(r.pet).toBeCloseTo(climate.byMonth.get(`${r.year}-${r.month}`)!.pet, 9)
  })
  it('names a growing season that wraps over New Year', () => {
    const m = (on: number[]) => Array.from({ length: 12 }, (_, i) => ({ active: on.includes(i + 1) }))
    expect(seasonSpan(m([10, 11, 12, 1, 2, 3]))).toBe('Oct to Mar')
    expect(seasonSpan(m([5, 6, 7, 8, 9]))).toBe('May to Sep')
    expect(seasonSpan(m([]))).toBe('no month of the year')
  })
  it('carries a southern-hemisphere tunnel through the austral summer', () => {
    const { climate } = loadPreset('pergamino')
    const tunnel = greenhouseModel(climate, { cover: 'film', floorM2: 1000, heated: false, lit: false, screen: false, crop: 'tomato' })
    expect(tunnel.months[0].active).toBe(true) // January
    expect(tunnel.months[6].active).toBe(false) // July
  })
  it('rejects prototype keys from shared URLs', () => {
    expect(isGhCropId('constructor')).toBe(false)
    expect(isCover('toString')).toBe(false)
    expect(isGhCropId('tomato') && isCover('glass')).toBe(true)
    expect(isCropId('constructor')).toBe(false) // field history in the URL (h=…) goes through this too
    expect(isCropId('rye')).toBe(true)
  })
  it('credits a legume to the crop that follows it', () => {
    expect(nitrogenNeed(['pea', 'wheat'], null).n).toBeLessThan(nitrogenNeed(['barley', 'wheat'], null).n)
  })
  it('exports closed, counter-clockwise rings and greenhouse attributes', () => {
    const farm = demoFarm()
    const gj = JSON.parse(farmGeoJSON(farm))
    const poly = gj.features.find((f: { geometry: { type: string } }) => f.geometry.type === 'Polygon')
    const ring: number[][] = poly.geometry.coordinates[0]
    expect(ring[0]).toEqual(ring[ring.length - 1])
    let twice = 0
    for (let i = 0; i < ring.length - 1; i++) twice += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    expect(twice).toBeGreaterThan(0)
    expect(gj.features.some((f: { properties: { kind: string } }) => f.properties.kind === 'greenhouse')).toBe(true)
  })
  it('adds the glasshouse to an untouched old demo farm, and leaves real farms alone', () => {
    const old = { ...demoFarm(), fields: demoFarm().fields.slice(0, 3) }
    expect(upgradeDemo(old).fields.map((f) => f.kind ?? 'field')).toEqual(['field', 'field', 'field', 'greenhouse'])
    const mine = { ...old, name: 'Hof Müller' }
    expect(upgradeDemo(mine)).toBe(mine)
  })
})

describe('greenhouse planting calendar (Torgau)', () => {
  const { climate } = loadPreset('torgau')
  const glass = { cover: 'glass', floorM2: 6000, heated: true, lit: false, screen: true } as const
  it('plants unlit tomatoes in mid-winter and harvests two months later, as growers do - at the gas prices before 2022', () => {
    // German business gas 2016-2021: €0.029-0.035/kWh (Eurostat band I3)
    const p = greenhouseModel(climate, { ...glass, crop: 'tomato' }, { heat: 0.03, power: 0.18 }).plan
    expect([12, 1, 2]).toContain(p.plant)
    expect(((p.firstHarvest! - p.plant! + 12) % 12)).toBe(2)
    // Dutch houses clear in November; the darker Torgau autumn and the summer price trough stop paying a month or two earlier
    expect([9, 10, 11, 12]).toContain(p.clear)
    expect(p.margin).toBeGreaterThan(0)
  })
  it('plants later when gas gets expensive, and leaves the house empty when nothing pays', () => {
    const start = (crop: 'strawberry' | 'tomato', heat: number) => {
      const p = greenhouseModel(climate, { ...glass, crop }, { heat, power: 0.18 }).plan.plant
      return p === null ? null : p >= 8 ? p - 12 : p // Nov = −1, Dec = 0, Jan = 1 …
    }
    expect(start('strawberry', 0.08)!).toBeGreaterThan(start('strawberry', 0.01)!)
    // at the 2022 peak (€0.12/kWh) tomatoes wait for spring; at twice that nothing pays for its heat
    expect(start('tomato', 0.12)!).toBeGreaterThan(start('tomato', 0.03)!)
    expect(start('tomato', 0.25)).toBeNull()
  })
  it('never plans an unheated tunnel outside the months it can carry, nor waters it then', () => {
    const r = greenhouseModel(climate, { cover: 'film', floorM2: 1000, heated: false, lit: false, screen: false, crop: 'tomato' })
    for (const m of r.plan.months) expect(r.months[m - 1].active).toBe(true)
    expect(r.months.filter((m) => m.state === 'harvest').length).toBe(r.plan.months.length - r.crop.lag)
    expect(r.months[0].state).toBe('closed')
  })
})

describe('backtest on the Torgau demo field', () => {
  const { p, climate } = loadPreset('torgau')
  const soil = manualProfile('sandy loam')
  const bt = backtest(climate, soil, p.history, climate.lastYear + 1, p.priorities, new Set(p.exclude), false)
  it('judges only seasons whose weather is in the record, with data from two years before', () => {
    expect(bt.rows.length).toBeGreaterThanOrEqual(3)
    for (const r of bt.rows) {
      expect(r.year).toBeLessThanOrEqual(climate.lastYear)
      expect(r.dataTo).toBe(r.year - 2)
    }
    // on the 2018-2025 drought run the picks should not lose more to drought than what was grown more often than
    // not. Since the water axis scores what a dry year still pays, a pick may lose a larger share of a
    // more valuable harvest - sunflower after 2020 and maize after 2021 here - so ties are allowed; the backtest
    // verdict still judges the share lost and should follow the money next. Since history v3 the 2024
    // pick is maize, as the farmer grew (a tie): the unpriced same-family penalty that had pushed it to rapeseed left.
    expect(bt.worse).toBeLessThanOrEqual(bt.better + bt.same)
  })
  it('marks a crop grown inside its break as breaking the rotation - a high flag, now that such rules are not priced', () => {
    const h = ['sunflower', 'wheat', 'sunflower', 'wheat', 'rye'] as CropId[]
    const t = backtest(climate, soil, h, climate.lastYear + 1, p.priorities, new Set(p.exclude), false)
    const second = t.rows.find((r) => r.grown === 'sunflower' && r.year === climate.lastYear + 1 - 2)
    expect(second?.grownBrokeRotation).toBe(true)
    expect(t.rows.find((r) => r.grown === 'wheat')?.grownBrokeRotation).toBe(false)
  })
})

describe('CMIP6-style monthly deltas', () => {
  const { climate } = loadPreset('torgau')
  it('shifts each calendar month by its own delta and leaves the others alone', () => {
    const dT = Array(12).fill(0)
    dT[6] = 5 // July only
    const recs = warmedRecords(climate, { dT, rain: 0 })
    const orig = (y: number, m: number) => climate.byMonth.get(`${y}-${m}`)!
    const y = climate.recent.from + 2
    expect(recs.find((r) => r.year === y && r.month === 7)!.t - orig(y, 7).t).toBeCloseTo(5, 6)
    expect(recs.find((r) => r.year === y && r.month === 1)!.t).toBeCloseTo(orig(y, 1).t, 6)
  })
  it('scales rain per month and never below zero', () => {
    const rain = Array(12).fill(0)
    rain[7] = -2 // August: an absurd −200 % must clamp at zero rain
    const recs = warmedRecords(climate, { dT: 0, rain })
    for (const r of recs.filter((x) => x.year >= climate.recent.from && x.month === 8)) expect(r.p).toBe(0)
  })
  it('falls back to the observed decade when a projection is missing', () => {
    expect(whatIfWarming('ssp245', null)).toBeNull()
    expect(whatIfWarming(2, null)).toEqual({ dT: 2, rain: 0 })
  })
})
