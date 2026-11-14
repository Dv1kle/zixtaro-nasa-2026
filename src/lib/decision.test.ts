// Tests for the decision layer: irrigation budget, uncertainty, explanations, soil carbon and cover.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeClimate, parsePowerMonthly } from './climate'
import { calendarShift, CROPS, CROP_BY_ID, cropSeason, DISEASE_INFO, localMonth, rainySeason, type CropId } from './crops'
import { analyzeDaily } from './daily'
import { PRESETS } from './presets'
import { rankNext, type FieldContext } from './rotation'
import { averageProfiles, parseSoilGrids } from './soil'
import { allCropRisks, cropRisk, formOf, simulateSeason } from './water'
import { pickConfidence, sensitivity } from './robust'
import { compare, scoreOf, shapley } from './explain'
import { canopyCover, carbonInputs, coverCycle, coverFigures, decompFactor, humified, H_AG, icbmDifference, K_OLD, K_YOUNG, socStock30 } from './soilcarbon'
import { planReport } from './planMetrics'
import { backtest } from './backtest'
import { scaleNote } from './scale'
import { cleanLab, fuseLab } from './soil'
import { decodeLab, encodeLab } from './urlState'
import { cropExtremes, withDailyExtremes } from './extremes'
import { burnsFraction, leaching, winterDrainage } from './nitrate'
import { checkBucket } from './bucketCheck'
import { co2Effect } from './scenario'
import { shiftedCrop, sowingAdvice } from './sowing'
import { protect } from './protect'
import { CROP_FAO, FAO33_KY, FAO56, PYFAO56_KEY } from './fao-tables'
import { PY_T12, PY_T22 } from './fao56-pyfao56'
import { PARAMS, SOURCES } from './evidence'
import { traceNasa } from './causal'
import { warmClimate } from './scenario'
import { makeArea, type LonLat } from './geo'
import { buildMarket } from './marketProfit'
import seaJson from '../../public/data/markets/sea.json'
import type { SeaMatrix } from './logistics'
import { load, monsoonClimate, syntheticClimate } from './testkit'
export { load, monsoonClimate }
import { erodibleFraction, fieldErodibility, kFactor, lsFactor, rFactor, SLOPE_UNKNOWN_PCT } from './erosion'
import { deepNitrate, evaluate, N_PRICE, precropCredit } from './rotation'
import { LEY_BREAK_N, N_RESIDUAL } from './nitrate'
import { RESIDUE } from './soilcarbon'
import { T_CRIT } from './extremes'
import { defaultExcludeFor } from './presets'
import { cropValidity, FAILURE_MODES, fieldValidity } from './validity'
import { calibrateSite, reliability, type CalibrationRow } from './calibration'
import { lookup, parseGrid } from './localCrops'
import { bestCultivar, GAEZ_CROP, heatNeeds, phCurve, phOptimum, phRating, soilSuitability, textureRating } from './gaez'
import { GAEZ_HEAT, GAEZ_PH, GAEZ_TEXTURE } from './gaez-tables'
import { analyzeClimate as analyze, type MonthRec } from './climate'


describe('irrigation budget (Torgau and Kansas, every crop and season)', () => {
  for (const id of ['torgau', 'kansas']) {
    const { climate, risks } = load(id)
    it(`${id}: more water never means more stress, and never more water than the budget`, () => {
      const budgets = [0, 20, 60, 120, 250, 1000]
      for (const crop of CROPS) {
        for (const y of climate.years.map((x) => x.year)) {
          let prev = Infinity
          for (const b of budgets) {
            const s = simulateSeason(crop, climate, risks[crop.id].taw, y, b)
            if (!s) continue
            expect(s.stress).toBeLessThanOrEqual(prev + 1e-9)
            expect(s.irrigation).toBeLessThanOrEqual(b + 1e-9)
            prev = s.stress
          }
        }
      }
    })
  }
  it('a big enough budget removes water stress; a green fallow is never irrigated', () => {
    const { climate, risks } = load('kansas')
    const s = simulateSeason(CROP_BY_ID.maize, climate, risks.maize.taw, 2012, 2000)!
    expect(s.loss).toBeLessThan(0.02)
    expect(simulateSeason(CROP_BY_ID.cover, climate, risks.cover.taw, 2012, 500)!.irrigation).toBe(0)
  })
  it('zero budget reproduces the rainfed model exactly', () => {
    const { climate, soil, risks } = load('torgau')
    const again = allCropRisks(climate, soil, 0)
    expect(again.maize.recent.loss).toBe(risks.maize.recent.loss)
    expect(again.maize.recent.irrigation).toBe(0)
  })
})

describe('uncertainty & sensitivity (seeded Monte Carlo)', () => {
  const { p, climate, soil, ctx } = load('torgau')
  const ex = new Set(p.exclude)
  it('is deterministic and its shares add up to one', () => {
    const a = pickConfidence(p.history, ctx, p.priorities, ex, climate, 80)!
    const b = pickConfidence(p.history, ctx, p.priorities, ex, climate, 80)!
    expect(a).toEqual(b)
    expect(a.shares.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 9)
    expect(a.ranks[0].r1 + a.ranks[0].r2 + a.ranks[0].r3).toBeLessThanOrEqual(1 + 1e-9)
  })
  it('the nominal pick is among the most frequent winners on the demo field (within the Monte Carlo noise)', () => {
    // Torgau is a close call since drought is counted once: sunflower 58.1, soybean 58.0, rapeseed 57.3
    // nominally, and about a third of the runs each - the app shows it as a close call
    const c = pickConfidence(p.history, ctx, p.priorities, ex, climate, 120)!
    const nominal = rankNext(p.history, ctx, p.priorities, ex)[0].crop.id
    const share = (id: string) => c.shares.find((s) => s.id === id)?.share ?? 0
    expect(share(nominal)).toBeGreaterThanOrEqual(share(c.top) - 0.05)
  })
  it('the irrigation ladder starts at the rainfed pick and never uses more than its budget', () => {
    const s = sensitivity(p.history, ctx, p.priorities, ex, climate, soil)!
    expect(s.ladder[0].budget).toBe(0)
    expect(s.ladder[0].top).toBe(s.pick)
    for (const step of s.ladder) expect(step.used).toBeLessThanOrEqual(step.budget + 1e-9)
    expect(s.tipping[0]).toEqual({ id: s.pick, budget: 0 })
  })
})

describe('explanations (Shapley attribution of the score gap)', () => {
  const { p, ctx } = load('torgau')
  const ranked = rankNext(p.history, ctx, p.priorities, new Set(p.exclude))
  it('the closed-form score reproduces evaluate()', () => {
    for (const e of ranked) expect(scoreOf(e.sub, p.priorities)).toBeCloseTo(e.score, 9)
  })
  it('shares add up exactly to the gap, are antisymmetric and zero for equal factors', () => {
    const [a, b, c] = ranked
    for (const [x, y] of [[a, b], [a, c], [c, b]]) {
      const phi = shapley(x.sub, y.sub, p.priorities)
      const sum = Object.values(phi).reduce((s, v) => s + v, 0)
      expect(sum).toBeCloseTo(x.score - y.score, 9)
      const back = shapley(y.sub, x.sub, p.priorities)
      for (const k of Object.keys(phi) as (keyof typeof phi)[]) expect(back[k]).toBeCloseTo(-phi[k], 9)
    }
    const same = shapley({ ...a.sub }, { ...a.sub, water: b.sub.water }, p.priorities)
    expect(same.rotation).toBe(0)
    expect(same.profit).toBe(0)
  })
  it('compare() orders factors by size and explains with notes', () => {
    const cmp = compare(ranked[0], ranked[1], p.priorities)
    for (let i = 1; i < cmp.parts.length; i++) expect(Math.abs(cmp.parts[i - 1].points)).toBeGreaterThanOrEqual(Math.abs(cmp.parts[i].points))
    expect(cmp.parts.reduce((s, x) => s + x.points, 0)).toBeCloseTo(cmp.gap, 9)
  })
})

describe('soil carbon (ICBM + IPCC residues) and soil cover', () => {
  const { p, climate, ctx, daily, soil } = load('torgau')
  it('ICBM: no change for identical rotations, more carbon for more input, saturating toward steady state', () => {
    const a = [{ ag: 2, bg: 1 }]
    expect(icbmDifference(a, a, 1.2, 20).every((v) => v === 0)).toBe(true)
    const more = icbmDifference([{ ag: 3, bg: 1 }], a, 1.2, 200)
    expect(more[19]).toBeGreaterThan(0)
    // steady-state gain of the old pool = h·Δi/(kO·re), young pool = Δi·e^(−kY re)/(1 − e^(−kY re))
    const re = 1.2
    const young = Math.exp(-K_YOUNG * re) / (1 - Math.exp(-K_YOUNG * re))
    const expected = (H_AG * 1) / (K_OLD * re) + young
    const gainAt = (t: number) => more[t - 1]
    expect(gainAt(200) / expected).toBeGreaterThan(0.6) // still approaching (kO is slow)
    expect(gainAt(200)).toBeLessThan(expected)
  })
  it('warmer, wetter sites decompose faster than Ultuna; the factor is in a sane range', () => {
    const re = decompFactor(climate.monthly.recent)
    expect(re).toBeGreaterThan(0.8)
    expect(re).toBeLessThan(3)
  })
  it('cereals with straw return more carbon than grain legumes; baling straw lowers it', () => {
    const w = CROP_BY_ID.wheat
    expect(humified(carbonInputs(w, 0.8))).toBeGreaterThan(humified(carbonInputs(CROP_BY_ID.lentil, 0.8)))
    expect(humified(carbonInputs(w, 0.8, true))).toBeLessThan(humified(carbonInputs(w, 0.8)))
    expect(socStock30(soil)).toBeGreaterThan(20)
  })
  it('FAO-56 canopy cover spans 0…1 and catch crops shorten bare months', () => {
    expect(canopyCover(0)).toBe(0)
    expect(canopyCover(1.2)).toBeCloseTo(1, 9)
    const seq = ['barley', 'maize', 'wheat', 'sunflower'] as const
    const plain = coverFigures(coverCycle([...seq], 'north', climate.monthly.recent, false), daily.erosivityByMonth.recent)
    const catchy = coverFigures(coverCycle([...seq], 'north', climate.monthly.recent, true), daily.erosivityByMonth.recent)
    expect(catchy.bareMonths).toBeLessThan(plain.bareMonths)
    expect(catchy.exposed).toBeLessThanOrEqual(plain.exposed)
    expect(plain.exposed).toBeGreaterThan(0)
    expect(plain.exposed).toBeLessThanOrEqual(1)
  })
  it('summer storms dominate erosive rain in central Europe', () => {
    const e = daily.erosivityByMonth.recent
    expect(e[5] + e[6] + e[7]).toBeGreaterThan(e[0] + e[1] + e[2])
  })
  it('plan report: the reference rotation against itself changes nothing', () => {
    const seq = ['wheat', 'rapeseed', 'wheat', 'barley'] as const
    const r = planReport([...seq], p.history, ctx, p.priorities, { climate, erosivity: daily.erosivityByMonth.recent, strawRemoved: false, catchCrops: false }, [...seq])
    expect(r.carbon.delta.every((v) => Math.abs(v) < 1e-9)).toBe(true)
    expect(r.kgPerM3).toBeGreaterThan(0.3)
    expect(r.kgPerM3).toBeLessThan(3)
  })
})

describe('backtest has no look-ahead', () => {
  const { p, climate, soil } = load('torgau')
  it('rewriting every later year never changes an earlier pick', () => {
    const last = climate.lastYear + 1
    const real = backtest(climate, soil, p.history, last, p.priorities, new Set(p.exclude), false)
    const cut = climate.lastYear - 3 // everything after this year becomes a desert
    const recs = [...climate.byMonth.values()].map((r) => (r.year > cut ? { ...r, p: 0, w: 0.05, t: r.t + 6 } : r))
    const fake = analyzeClimate(recs, climate.lat, climate.lon)
    const bt = backtest(fake, soil, p.history, last, p.priorities, new Set(p.exclude), false)
    const judged = real.rows.filter((r) => r.dataTo <= cut)
    expect(judged.length).toBeGreaterThan(0)
    for (const r of judged) expect(bt.rows.find((x) => x.year === r.year)?.pick).toBe(r.pick)
    // …while the outcomes of the rewritten seasons do change: the test would notice a leak
    const later = real.rows.filter((r) => r.year > cut)
    expect(later.some((r) => bt.rows.find((x) => x.year === r.year)?.pickValue !== r.pickValue)).toBe(true)
  })
  it('each pick only sees complete years up to two before harvest', () => {
    const bt = backtest(climate, soil, p.history, climate.lastYear + 1, p.priorities, new Set(p.exclude), false)
    for (const r of bt.rows) expect(r.dataTo).toBe(r.year - 2)
  })
})

describe('field / farm / region guardrails', () => {
  const ring = (km: number): LonLat[] => {
    const d = km / 111 / 2
    return [[13 - d, 51 - d], [13 + d, 51 - d], [13 + d, 51 + d], [13 - d, 51 + d]]
  }
  it('calls a paddock a field, a big outline a farm and a district a landscape', () => {
    expect(scaleNote(makeArea(ring(0.5)), null).scale).toBe('field')
    expect(scaleNote(makeArea(ring(2.5)), null).scale).toBe('farm')
    const big = scaleNote(makeArea(ring(15)), null)
    expect(big.scale).toBe('region')
    expect(big.tone).toBe('bad')
    expect(scaleNote({ kind: 'point', lat: 51, lon: 13 }, null).scale).toBe('point')
  })
})

describe('lab soil test fused with SoilGrids', () => {
  const { soil } = load('torgau')
  it('overrides only what was measured, in the plough layer only', () => {
    const f = fuseLab(soil, { ph: 5.4 })
    expect(f.top.ph).toBeCloseTo(5.4, 6)
    expect(f.top.sand).toBeCloseTo(soil.top.sand, 6)
    expect(f.layers.at(-1)!.ph).toBe(soil.layers.at(-1)!.ph)
    expect(f.lab).toEqual(['ph'])
  })
  it('recomputes water holding from measured texture and carbon', () => {
    const clayey = fuseLab(soil, { sand: 20, clay: 30, soc: 25 })
    expect(clayey.texture).not.toBe(soil.texture)
    expect(clayey.paw100).not.toBeCloseTo(soil.paw100, 0)
    const richer = fuseLab(soil, { soc: soil.top.soc * 2 })
    expect(richer.paw100).toBeGreaterThan(soil.paw100)
  })
  it('rejects impossible values and keeps sand + clay within 100 %', () => {
    expect(cleanLab({ ph: 14, sand: 80, clay: 40, bd: 1.4 })).toEqual({ bd: 1.4 })
    const f = fuseLab(soil, { sand: 95 })
    for (const l of f.layers) expect(l.sand + l.silt + l.clay).toBeCloseTo(100, 6)
    expect(fuseLab(soil, {})).toBe(soil)
  })
})

describe('shareable URL carries the lab test and the water budget', () => {
  it('round-trips lab values', () => {
    const lab = { ph: 5.8, sand: 42, soc: 14.5, bd: 1.38 }
    expect(decodeLab(encodeLab(lab))).toEqual(lab)
    expect(decodeLab('p99_zfoo_s')).toEqual({})
  })
})

describe('heat at flowering and frost after emergence, from NASA POWER daily', () => {
  const { climate, risks, daily } = load('torgau')
  it('catches the June heat-wave signal in wheat that the monthly mean hides', () => {
    const x = cropExtremes('wheat', daily.raw, climate)!
    expect(x.heat.recent).toBeGreaterThan(x.heat.baseline)
    expect(x.heat.days.recent).toBeGreaterThan(x.heat.days.baseline)
    expect(x.frost).toBeNull() // winter wheat is not frost-tender after emergence in autumn
  })
  it('warming never lowers the heat risk, and only tender spring crops get a frost risk', () => {
    for (const id of ['wheat', 'maize', 'soybean', 'pea'] as const) {
      const a = cropExtremes(id, daily.raw, climate)!
      const b = cropExtremes(id, daily.raw, climate, 2)!
      expect(b.heat.days.recent).toBeGreaterThanOrEqual(a.heat.days.recent)
      expect(b.heat.days.baseline).toBe(a.heat.days.baseline) // the baseline stays observed
    }
    expect(cropExtremes('maize', daily.raw, climate)!.frost).not.toBeNull()
    expect(cropExtremes('rapeseed', daily.raw, climate)!.frost).toBeNull()
  })
  it('replaces the monthly proxy only where daily data has a reading', () => {
    const x = withDailyExtremes(risks, daily.raw, climate)
    expect(x.wheat.heatDaily?.tCrit).toBe(31)
    expect(x.cover.heatDaily).toBeUndefined()
    expect(x.cover.heat).toEqual(risks.cover.heat)
  })
})

describe('nitrate leaching over winter (Burns 1974 on NASA POWER drainage)', () => {
  it('drains through sandy Torgau in winter, not through semi-arid Kansas', () => {
    const t = load('torgau')
    const k = load('kansas')
    expect(winterDrainage(t.climate, t.soil).bare).toBeGreaterThan(80)
    expect(winterDrainage(k.climate, k.soil).bare).toBeLessThan(winterDrainage(t.climate, t.soil).bare)
  })
  it('the Burns fraction rises with drainage and stays within 0…1', () => {
    expect(burnsFraction(0, 0.25)).toBe(0)
    expect(burnsFraction(100, 0.25)).toBeLessThan(burnsFraction(300, 0.25))
    expect(burnsFraction(3000, 0.25)).toBeLessThanOrEqual(1)
  })
  it('catch crops and fewer leaky crops lower the loss', () => {
    const { climate, soil } = load('torgau')
    const d = winterDrainage(climate, soil)
    const leaky = leaching(['pea', 'potato', 'wheat', 'maize'], d, soil, false)
    const held = leaching(['pea', 'potato', 'wheat', 'maize'], d, soil, true)
    const cereals = leaching(['wheat', 'barley', 'rye', 'wheat'], d, soil, false)
    expect(held.kgN).toBeLessThan(leaky.kgN)
    expect(cereals.kgN).toBeLessThan(leaky.kgN)
    expect(leaky.mgNO3).toBeGreaterThan(0)
  })
})

describe('the water bucket against NASA MERRA-2 GWETROOT', () => {
  for (const id of ['torgau', 'iowa', 'pergamino']) {
    it(`${id}: anomalies agree and the interval excludes zero`, () => {
      const { climate, soil } = load(id)
      const c = checkBucket(climate, soil, 120)!
      expect(c.months.rho).toBeGreaterThan(0.4)
      expect(c.months.lo).toBeGreaterThan(0)
      expect(c.months.lo).toBeLessThanOrEqual(c.months.rho)
      expect(c.months.hi).toBeGreaterThanOrEqual(c.months.rho)
      expect(c.seasons.rho).toBeGreaterThan(0.4)
    })
  }
})

describe('CO₂ in the 2050s scenarios', () => {
  const { climate, soil } = load('torgau')
  it('only projections carry CO₂, and C3 gains while C4 does not', () => {
    expect(co2Effect(2)).toBeNull()
    expect(co2Effect('ssp585', false)).toBeNull()
    const e = co2Effect('ssp585')!
    expect(e.delta).toBeGreaterThan(100)
    expect(e.transpiration).toBeLessThan(1)
    expect(e.gain('maize', 'poaceae')).toBe(1)
    expect(e.gain('wheat', 'poaceae')).toBeGreaterThan(1)
    expect(e.gain('soybean', 'fabaceae')).toBeGreaterThan(e.gain('wheat', 'poaceae'))
  })
  it('lower transpiration eases water stress in the scenario decade only', () => {
    const e = co2Effect('ssp585')!
    const a = allCropRisks(climate, soil)
    const b = allCropRisks(climate, soil, 0, e.transpiration)
    expect(b.maize.recent.loss).toBeLessThanOrEqual(a.maize.recent.loss)
    expect(b.maize.baseline.loss).toBe(a.maize.baseline.loss)
  })
})

describe('sow earlier or later', () => {
  const { climate, soil, daily } = load('torgau')
  it('moves the whole FAO-56 season and keeps its length', () => {
    const m = CROP_BY_ID.maize
    const later = shiftedCrop(m, 21)!
    expect(later.fao!.sow).toEqual([5, 22])
    expect(later.kc.filter((k) => k > 0).length).toBeGreaterThanOrEqual(m.kc.filter((k) => k > 0).length - 1)
    expect(shiftedCrop(CROP_BY_ID.wheat, 21)).toBeNull() // no FAO-56 calendar: not moved
  })
  it('rules out cold seed beds and frost-tender crops still in the field at the first frost', () => {
    const a = sowingAdvice(['maize'], climate, soil, daily.raw)[0]
    expect(a.options.find((o) => o.shift === -42)!.ok).toBe(false)
    expect(a.options.find((o) => o.shift === 42)!.ok).toBe(false)
    expect(a.best.ok).toBe(true)
    expect(a.best.index).toBeGreaterThanOrEqual(a.now.ok ? a.now.index : 0)
  })
})

describe('names are never machine-translated', () => {
  it('masks the brand and data sets and restores them', () => {
    const g = protect('Zixtaro reads NASA POWER and SoilGrids with FAO-56.')
    expect(g.masked).toBe('[0] reads [1] and [2] with [3].')
    expect(g.restore('[0] читает [1] и [ 2 ] по [3].')).toBe('Zixtaro читает NASA POWER и SoilGrids по FAO-56.')
    expect(g.restore('Зикстаро читает данные')).toBeNull() // a lost name: keep English instead
  })
  it('leaves ordinary words alone', () => {
    expect(protect('Grassland facets').masked).toBe('Grassland facets')
  })
})

describe('crop parameters match the FAO tables they cite', () => {
  const mid = (v: number | [number, number]): [number, number] => (Array.isArray(v) ? v : [v, v])
  for (const crop of CROPS) {
    const ref = CROP_FAO[crop.id]
    it(`${crop.id}: ${ref.fao56 ?? 'no FAO-56 row'} / Ky ${ref.ky ?? 'assumed'}`, () => {
      expect(ref).toBeDefined()
      if (ref.fao56) {
        const row = FAO56[ref.fao56]
        expect(row, ref.fao56).toBeDefined()
        // rooting depth: the table's upper value (FAO-56 advice for rainfed stress modelling)
        expect(crop.rootDepth).toBe(row.zr[1])
        expect(Math.abs(crop.p - row.p)).toBeLessThanOrEqual(0.05)
        const [lo, hi] = mid(row.kc[1])
        const kcMid = crop.fao ? crop.fao.kc[1] : Math.max(...crop.kc)
        expect(kcMid).toBeGreaterThanOrEqual(lo - 0.1)
        expect(kcMid).toBeLessThanOrEqual(hi + 1e-9)
      } else {
        expect(ref.note).toBeTruthy()
      }
      if (ref.ky) {
        expect(crop.ky).toBe(FAO33_KY[ref.ky])
        expect(crop.kyAssumed ?? false).toBe(false)
      } else if (crop.ky > 0) {
        expect(crop.kyAssumed).toBe(true)
      }
    })
  }
})

describe('evidence registry', () => {
  it('every parameter names known sources, and literature is never unsourced', () => {
    for (const p of PARAMS) {
      for (const s of p.sources) expect(SOURCES[s], `${p.id} → ${s}`).toBeDefined()
      if (p.kind === 'literature' || p.kind === 'observed' || p.kind === 'modeled' || p.kind === 'projection') expect(p.sources.length, p.id).toBeGreaterThan(0)
      if (p.checked === 'cited') expect(p.sources.length, p.id).toBeGreaterThan(0)
    }
    expect(new Set(PARAMS.map((p) => p.id)).size).toBe(PARAMS.length)
  })
  it('assumptions and heuristics are labelled as such, not dressed as science', () => {
    for (const id of ['prices', 'irrcost', 'nmin', 'penalties', 'rainloss']) {
      expect(['assumption', 'heuristic']).toContain(PARAMS.find((p) => p.id === id)!.kind)
    }
  })
})

describe('NASA causal tracing (counterfactual without the climate shift)', () => {
  const { p, climate, soil, ctx, daily } = load('torgau')
  const c = traceNasa(p.history, ctx, p.priorities, new Set(p.exclude), climate, soil, daily.raw)!
  it('removes exactly the observed monthly shift', () => {
    const cf = warmClimate(climate, { dT: c.shift.dT.map((x) => -x), rain: c.shift.rain })
    for (let m = 1; m <= 12; m++) {
      const a = cf.monthly.recent.find((x) => x.month === m)!
      const b = climate.monthly.baseline.find((x) => x.month === m)!
      expect(a.t).toBeCloseTo(b.t, 6)
      expect(a.p).toBeCloseTo(b.p, 6)
    }
  })
  it('leaves the baseline years untouched and reports three runs and the movers', () => {
    expect(c.runs.map((r) => r.key)).toEqual(['no-warming', 'no-rain-shift', 'no-shift'])
    expect(c.movers.length).toBeGreaterThan(0)
    expect(c.verdict.length).toBeGreaterThan(20)
  })
})

describe('heuristic audit: erosion, nitrogen and roots', () => {
  const normal = (p: number[]) => p.map((x, i) => ({ month: i + 1, p: x, pet: 60, t: 10, tMax: 15, w: 0.5 }))
  it('K from texture and carbon matches the EPIC equation worked by hand (SI units)', () => {
    // silt loam 10/70/20, 1.2 % OC: 0.339 × 0.927 × 0.875 × 1.000 = 0.275 (US) → 0.0362
    expect(kFactor(10, 70, 20, 1.2)).toBeCloseTo(0.0362, 3)
    // sand 85/10/5, 1 % OC: 0.200 × 0.885 × 0.921 × 0.619 = 0.101 (US) → 0.0133
    expect(kFactor(85, 10, 5, 1)).toBeCloseTo(0.0133, 3)
    // silty soils erode most, sands and clays less
    expect(kFactor(10, 70, 20, 1.2)).toBeGreaterThan(kFactor(20, 30, 50, 2))
    expect(kFactor(10, 70, 20, 1.2)).toBeGreaterThan(kFactor(85, 10, 5, 1))
    // more organic carbon never makes a soil more erodible
    expect(kFactor(30, 50, 20, 3)).toBeLessThan(kFactor(30, 50, 20, 1))
  })
  it('LS follows McCool: 0.03 on the flat, ≈ 1.04 on a 5 % slope of 100 m, rising with slope', () => {
    expect(lsFactor(0)).toBeCloseTo(0.03, 6)
    expect(lsFactor(5)).toBeCloseTo(1.042, 2)
    let prev = 0
    for (const s of [0, 0.5, 1, 2, 4, 8, 9, 12, 20]) {
      const ls = lsFactor(s)
      expect(ls).toBeGreaterThan(prev)
      prev = ls
    }
    expect(lsFactor(5, 200)).toBeGreaterThan(lsFactor(5, 100))
  })
  it('R from the modified Fournier index: 50 mm every month → F = 50, R ≈ 1017; the same rain in storms scores higher', () => {
    expect(rFactor(normal(new Array(12).fill(50)))).toBeCloseTo(0.7397 * 50 ** 1.847, 6)
    expect(rFactor(normal(new Array(12).fill(50)))).toBeCloseTo(1017, -1)
    expect(rFactor(normal([10, 10, 10, 30, 80, 120, 150, 110, 40, 20, 10, 10]))).toBeGreaterThan(rFactor(normal(new Array(12).fill(50))))
  })
  it('the wind-erodible fraction follows Fryrear et al. (1994): sand ≈ 0.58, heavier soils less', () => {
    expect(erodibleFraction(85, 10, 5, 1)).toBeCloseTo(0.583, 2)
    expect(erodibleFraction(20, 30, 50, 2)).toBeLessThan(erodibleFraction(85, 10, 5, 1))
  })
  it('field erodibility grows with slope, and an unknown slope is an explicit assumption', () => {
    const { soil, climate } = load('torgau')
    const r = rFactor(climate.monthly.recent)
    const flat = fieldErodibility(soil, 0.5, r)
    const steep = fieldErodibility(soil, 6, r)
    expect(steep.potential).toBeGreaterThan(flat.potential)
    expect(steep.either).toBeGreaterThanOrEqual(flat.either)
    const unknown = fieldErodibility(soil, null, null)
    expect(unknown.slopeKnown).toBe(false)
    expect(unknown.slopePct).toBe(SLOPE_UNKNOWN_PCT)
    expect(unknown.rFrom).toBe('europe-mean')
  })
  it('crop cover is ordered like published C-factors (HLNUG: winter wheat 0.12 < maize 0.35)', () => {
    const g = (id: keyof typeof CROP_BY_ID) => CROP_BY_ID[id].coverGap
    expect(g('wheat') / g('maize')).toBeGreaterThan(0.15)
    expect(g('wheat') / g('maize')).toBeLessThan(0.5)
    for (const winter of ['wheat', 'barley', 'rye', 'triticale', 'rapeseed'] as const) {
      for (const row of ['maize', 'sorghum', 'sunflower', 'soybean', 'sugarbeet', 'potato'] as const) expect(g(winter)).toBeLessThan(g(row))
    }
    expect(g('clover')).toBe(0)
    expect(g('cover')).toBe(0)
  })
  it('deep roots only earn credit for nitrate below the last crop’s roots (Burns profile)', () => {
    const { ctx, soil, climate } = load('torgau')
    const c = { ...ctx, winterDrain: winterDrainage(climate, soil) }
    const deep = deepNitrate(CROP_BY_ID.potato, CROP_BY_ID.rye, c)
    expect(deep).toBeGreaterThan(0)
    expect(deep).toBeLessThan(N_RESIDUAL.potato)
    // shallower or equal roots: nothing new within reach
    expect(deepNitrate(CROP_BY_ID.rye, CROP_BY_ID.potato, c)).toBe(0)
    expect(deepNitrate(CROP_BY_ID.wheat, CROP_BY_ID.wheat, c)).toBe(0)
    // no drainage figure, no claim
    expect(deepNitrate(CROP_BY_ID.potato, CROP_BY_ID.rye, ctx)).toBe(0)
  })
  it('regression: a crop no longer scores better on soil for having shallower roots than the last one', () => {
    const { ctx, soil, climate } = load('torgau')
    const c = { ...ctx, winterDrain: winterDrainage(climate, soil) }
    const h = ['wheat', 'maize', 'rye'] as const
    const w = { soil: 60, water: 75, profit: 45 }
    const shallow = evaluate({ ...CROP_BY_ID.rapeseed, rootDepth: 1.0 }, [...h], c, w)
    const deeper = evaluate({ ...CROP_BY_ID.rapeseed, rootDepth: 1.5 }, [...h], c, w)
    expect(shallow.sub.soil).toBeLessThanOrEqual(deeper.sub.soil + 1e-12)
  })
  it('the nitrogen a legume or ley leaves is credited kg for kg, and saves fertiliser in the margin', () => {
    const { ctx } = load('torgau')
    const w = { soil: 50, water: 50, profit: 50 }
    const afterPea = evaluate(CROP_BY_ID.wheat, ['maize', 'pea'], ctx, w)
    const afterBarley = evaluate(CROP_BY_ID.wheat, ['maize', 'barley'], ctx, w)
    expect(afterPea.margin - afterBarley.margin).toBeCloseTo(N_PRICE * Math.min(CROP_BY_ID.pea.nFix, CROP_BY_ID.wheat.nDemand), 6)
    // counted once, as money: the credit lowers the successor's costs and does not raise its soil sub-score again
    // (the soil axis once scored the N balance too - accuracy plan H12)
    expect(afterPea.sub.soil).toBeCloseTo(afterBarley.sub.soil, 9)
    expect(precropCredit(CROP_BY_ID.clover, CROP_BY_ID.wheat)).toBe(LEY_BREAK_N)
    expect(precropCredit(null, CROP_BY_ID.wheat)).toBe(0)
    // a legume's own soil score counts the nitrogen it fixes and leaves - the soil gains it - within the 0..1 axis
    const pea = evaluate(CROP_BY_ID.pea, ['maize', 'wheat'], ctx, w)
    const form = ctx.risks.pea.crop ?? CROP_BY_ID.pea
    const noFix = evaluate(CROP_BY_ID.pea, ['maize', 'wheat'], { ...ctx, risks: { ...ctx.risks, pea: { ...ctx.risks.pea, crop: { ...form, nFix: 0 } } } }, w)
    expect(pea.sub.soil).toBeLessThan(1)
    expect(pea.sub.soil - noFix.sub.soil).toBeCloseTo((0.3 * CROP_BY_ID.pea.nFix) / 400, 9)
  })
})

describe('rotation breaks follow the cited extension guidance', () => {
  it('disease breaks: clubroot 4 (AHDB), pulses 4 (PGRO), potato cyst nematode 5 → 6 years apart (BSPP), take-all and rootworm 1', () => {
    expect(DISEASE_INFO.clubroot.gap).toBe(4)
    expect(DISEASE_INFO['pea-rots'].gap).toBe(4)
    expect(DISEASE_INFO['potato-cyst'].gap).toBe(5)
    expect(DISEASE_INFO['take-all'].gap).toBe(1)
    expect(DISEASE_INFO.rootworm.gap).toBe(1)
    // PGRO counts every pulse against every other: all carry the same root-rot bridge
    for (const id of ['pea', 'faba', 'lupin', 'lentil', 'chickpea'] as const) expect(CROP_BY_ID[id].diseases).toContain('pea-rots')
  })
  it('a pulse within four seasons of another pulse is a high flag (legume root rots), not priced; after five it is not flagged', () => {
    const { ctx } = load('torgau')
    const w = { soil: 50, water: 50, profit: 50 }
    const soon = evaluate(CROP_BY_ID.pea, ['faba', 'wheat', 'barley', 'wheat'], ctx, w)
    const later = evaluate(CROP_BY_ID.pea, ['faba', 'wheat', 'barley', 'wheat', 'rye'], ctx, w)
    expect(soon.flags.some((f) => f.cause === 'pea-rots' && f.level === 'high')).toBe(true)
    expect(later.flags.some((f) => f.cause === 'pea-rots')).toBe(false)
    expect(soon.sub.rotation).toBeCloseTo(later.sub.rotation, 9)
  })
  it('the same crop past its usual break but inside the disease break is a moderate flag, not priced', () => {
    const { ctx } = load('torgau')
    const w = { soil: 50, water: 50, profit: 50 }
    const k5 = evaluate(CROP_BY_ID.potato, ['potato', 'wheat', 'barley', 'wheat', 'rye'], ctx, w) // potato 5 seasons ago
    const k6 = evaluate(CROP_BY_ID.potato, ['potato', 'wheat', 'barley', 'wheat', 'rye', 'oats'], ctx, w)
    expect(k5.flags).toEqual([expect.objectContaining({ rule: 'disease-self', level: 'moderate', cause: 'potato-cyst' })])
    expect(k6.flags).toEqual([])
    expect(k6.sub.rotation).toBeCloseTo(k5.sub.rotation, 9)
    expect(k5.notes.some((n) => n.text.includes('potato cyst nematode'))).toBe(true)
  })
})

describe('validity: where the model holds on a field', () => {
  const { climate, soil, daily } = load('torgau')
  it('every flag points into the failure-mode register, whose ids are unique', () => {
    const ids = FAILURE_MODES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of fieldValidity({ climate, soil, daily })) expect(ids).toContain(f.id)
  })
  it('the German demo field sits inside the model: temperate calendar, mineral soil, nothing outside', () => {
    const flags = fieldValidity({ climate, soil, daily })
    expect(flags.filter((f) => f.level === 'out')).toEqual([])
    expect(flags.find((f) => f.id === 'tropics')?.level).toBe('ok')
    expect(flags.find((f) => f.id === 'organic')?.level).toBe('ok')
  })
  it('a tropical field is flagged for its calendar and for double cropping', () => {
    const tropical = { ...climate, lat: 5, season: { ...climate.season, hemisphere: 'tropics' as const } }
    const flags = fieldValidity({ climate: tropical, soil, daily })
    expect(flags.find((f) => f.id === 'tropics')?.level).toBe('stretch')
    expect(flags.some((f) => f.id === 'double')).toBe(true)
  })
  it('a peat soil is outside the water model; a warm winter puts winter crops at their edge, not spring ones', () => {
    const peat = { ...soil, top: { ...soil.top, soc: 150 } }
    expect(fieldValidity({ climate, soil: peat, daily }).find((f) => f.id === 'organic')?.level).toBe('out')
    const warm = { ...climate, monthly: { ...climate.monthly, recent: climate.monthly.recent.map((m) => ({ ...m, t: m.t + 15 })) } }
    expect(fieldValidity({ climate: warm, soil, daily }).some((f) => f.id === 'vernal')).toBe(true)
    expect(cropValidity(CROP_BY_ID.wheat, warm).level).not.toBe('ok')
    expect(cropValidity(CROP_BY_ID.maize, warm).level).toBe('ok')
  })
  it('the Argentine demo field is flagged for its shifted calendar', () => {
    const arg = load('pergamino')
    expect(fieldValidity({ climate: arg.climate, soil: arg.soil, daily: arg.daily }).find((f) => f.id === 'southern')?.level).toBe('stretch')
  })
})

describe('confidence calibration (out of sample)', () => {
  it('a record cut short keeps its baseline clear of its own last decade', () => {
    const { climate } = load('torgau')
    const cut = analyze([...climate.byMonth.values()].filter((r) => r.year <= 2015), climate.lat, climate.lon)
    expect(cut.recent).toEqual({ from: 2006, to: 2015 })
    expect(cut.baseline.to).toBeLessThan(cut.recent.from)
  })
  it('decides on data up to D − 2 and verifies on exactly D … D + 9', () => {
    const { p, climate, soil } = load('torgau')
    const rows = calibrateSite('torgau', climate, soil, p.history, p.priorities, new Set(p.exclude), { from: 2014, runs: 24 })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.dataTo).toBe(r.decided - 2)
      expect(r.decided + 9).toBeLessThanOrEqual(climate.lastYear)
      expect(r.share).toBeGreaterThanOrEqual(0)
      expect(r.share).toBeLessThanOrEqual(1)
    }
  })
  it('reliability bins and the Brier score add up', () => {
    const mk = (share: number, hit: boolean): CalibrationRow => ({ site: 'x', decided: 2000, dataTo: 1998, pick: 'wheat', share, shareWeather: share, truth: hit ? 'wheat' : 'rye', hit, top2: true })
    const rel = reliability([mk(0.95, true), mk(0.95, true), mk(0.6, false), mk(0.6, true)], 'share')
    expect(rel.n).toBe(4)
    expect(rel.hitRate).toBeCloseTo(0.75, 9)
    expect(rel.brier).toBeCloseTo((0.05 ** 2 * 2 + 0.6 ** 2 + 0.4 ** 2) / 4, 9)
    expect(rel.bins.find((b) => b.from === 0.9)!.hitRate).toBe(1)
    expect(rel.bins.find((b) => b.from === 0.5)!.hitRate).toBe(0.5)
  })
})

describe('FAO GAEZ v4 soil ratings (pH and texture)', () => {
  it('the tables match the GAEZ v4 appendix (spot checks against GAEZ4_Appendices.xlsx)', () => {
    expect(GAEZ_PH.Wheat).toEqual({ acid: [6, 5.6, 5.2, 4.68, 4.48, 3.9], alk: [7.5, 8.2, 8.3, 8.5, 8.6] })
    expect(GAEZ_PH.Maize.alk).toEqual([7, 7.8, 8.2, 8.5, 8.6])
    expect(GAEZ_PH['White Potato'].acid[0]).toBe(5.6)
    expect(GAEZ_TEXTURE.Wheat.retention.slice(-3)).toEqual([90, 70, 30]) // sandy loam, loamy sand, sand
    expect(GAEZ_TEXTURE['White Potato'].rooting[0]).toBe(70) // heavy clay
    expect(GAEZ_TEXTURE.Wheat.workability[0]).toBe(50)
  })
  it('every crop has a monotone pH curve; overrides and gaps say where they come from', () => {
    for (const c of CROPS) {
      const k = phCurve(c.id)
      expect(k.acid).toHaveLength(6)
      expect(k.alk).toHaveLength(5)
      for (let i = 1; i < k.acid.length; i++) expect(k.acid[i]).toBeLessThan(k.acid[i - 1])
      for (let i = 1; i < k.alk.length; i++) expect(k.alk[i]).toBeGreaterThan(k.alk[i - 1])
      if (k.source !== 'gaez' || !GAEZ_CROP[c.id]) expect(k.note, c.id).toBeTruthy()
    }
    expect(phCurve('sugarbeet').source).toBe('gaez+bbro')
    expect(phCurve('lupin').source).toBe('heuristic')
  })
  it('ratings interpolate GAEZ’s points: 1 in the optimum, 0.9 at the 90 % pH, never below 0.1', () => {
    expect(phRating('wheat', 6.8)).toBe(1)
    expect(phRating('wheat', 5.6)).toBeCloseTo(0.9, 9)
    expect(phRating('wheat', 5.8)).toBeCloseTo(0.95, 9)
    expect(phRating('wheat', 8.2)).toBeCloseTo(0.9, 9)
    expect(phRating('wheat', 3)).toBe(0.1)
    expect(phRating('wheat', 10)).toBe(0.1)
    // BBRO: about 15 % less sugar at pH 6 than at pH 7
    expect(phRating('sugarbeet', 7)).toBe(1)
    expect(phRating('sugarbeet', 6)).toBeCloseTo(0.85, 2)
    expect(phOptimum('potato')).toEqual([5.6, 6.5])
  })
  it('texture: the lowest of rooting, workability and nutrient retention', () => {
    const { soil } = load('torgau')
    const as = (texture: string, clay = 10) => ({ ...soil, texture, top: { ...soil.top, clay } })
    expect(textureRating('wheat', as('loam')).rating).toBe(1)
    expect(textureRating('wheat', as('sandy loam'))).toMatchObject({ rating: 0.9, limit: 'retention' })
    expect(textureRating('wheat', as('sand')).rating).toBeCloseTo(0.3, 9)
    expect(textureRating('wheat', as('clay', 65))).toMatchObject({ rating: 0.5, limit: 'workability', klass: 'clay (heavy)' })
    expect(textureRating('wheat', as('clay', 45)).klass).toBe('clay (light)')
    const s = soilSuitability('potato', { ...as('loam'), top: { ...soil.top, ph: 7.5 } })
    expect(s.limiting).toBe('ph')
    expect(s.rating).toBeCloseTo(0.8, 9) // potato: 90 % at 7.0, 70 % at 8.0
  })
})

describe('what farms grow around here (CROPGRIDS 2020 grid)', () => {
  const index = JSON.parse(readFileSync('public/data/crops/grid.json', 'utf8'))
  const b = readFileSync('public/data/crops/grid.bin')
  const grid = parseGrid(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), index)
  it('parses every cell the index announces, with shares that fit in one cell', () => {
    expect(grid.size).toBe(index.cells)
    for (const rec of grid.values()) {
      expect(rec.crops.reduce((a, c) => a + c.share, 0)).toBeLessThanOrEqual(1.08) // rounding per crop
    }
  })
  it('finds the known farming systems: Iowa maize-soy, Hunan rice, the North China Plain wheat-maize', () => {
    // field crops only: the aggregate groups (orchards alone pool ~70 layers - Hebei's pear and
    // jujube orchards come second around Shijiazhuang) are not one crop
    const GROUPS = new Set(['trees', 'forage', 'otherannual', 'vegetables'])
    const top = (lat: number, lon: number) => lookup(grid, lat, lon)!.crops.filter((c) => !GROUPS.has(c.id)).slice(0, 2).map((c) => c.id)
    expect(top(42.03, -93.47).sort()).toEqual(['maize', 'soybean'])
    expect(top(27.9, 112.9)[0]).toBe('rice')
    expect(top(38.0, 114.5).sort()).toEqual(['maize', 'wheat'])
  })
  it('falls back to the nearest farmed cell and says so; the open ocean has none', () => {
    expect(lookup(grid, 0, -140)).toBeNull()
    const h = lookup(grid, 51.52, 13.05)!
    expect(h.offset).toBe(0)
  })
})

describe('our FAO-56 transcription agrees with pyfao56’s independent one (USDA-ARS)', () => {
  const within = (v: number, x: number | [number, number]) => (Array.isArray(x) ? v >= x[0] - 1e-9 && v <= x[1] + 1e-9 : Math.abs(v - x) < 1e-9)
  for (const [ours, theirs] of Object.entries(PYFAO56_KEY)) {
    it(`${ours} ↔ pyfao56 “${theirs}”`, () => {
      const row = FAO56[ours]
      const [ini, mid, end] = PY_T12[theirs]
      const [z1, z2, p] = PY_T22[theirs]
      expect(within(ini, row.kc[0]), `Kc ini ${ini} vs ${JSON.stringify(row.kc[0])}`).toBe(true)
      expect(within(mid, row.kc[1]), `Kc mid ${mid} vs ${JSON.stringify(row.kc[1])}`).toBe(true)
      expect(within(end, row.kc[2]), `Kc end ${end} vs ${JSON.stringify(row.kc[2])}`).toBe(true)
      expect(row.zr).toEqual([z1, z2])
      expect(row.p).toBe(p)
    })
  }
})


describe('tropical calendars follow the rains (FAO growing period: P ≥ ½ PET)', () => {
  const n = (p: number[], pet = 100) => p.map((x, i) => ({ month: i + 1, t: 25, p: x, pet }))
  it('finds the rainy season, also across the new year', () => {
    expect(rainySeason(n([0, 0, 0, 0, 20, 80, 150, 200, 90, 10, 0, 0]))).toEqual({ onset: 6, end: 9, months: 4 })
    expect(rainySeason(n([120, 100, 80, 20, 0, 0, 0, 0, 0, 10, 70, 110]))).toEqual({ onset: 11, end: 3, months: 5 })
    expect(rainySeason(n(new Array(12).fill(0)))).toBeNull()
    expect(rainySeason(n(new Array(12).fill(200)))!.months).toBe(12)
  })
  it('sows warm-season crops at the onset and cool-season crops after the rains (kharif / rabi)', () => {
    const monsoon = n([0, 0, 0, 0, 20, 80, 150, 200, 90, 10, 0, 0])
    const start = (id: keyof typeof CROP_BY_ID) => cropSeason(CROP_BY_ID[id], 'tropics', monsoon)[0].month
    expect(start('maize')).toBe(6)
    expect(start('sorghum')).toBe(6)
    expect(start('chickpea')).toBe(10)
    expect(start('wheat')).toBe(10)
    // beyond the tropics the same summer rains set the calendar where winters are mild - the monsoon belt...
    expect(calendarShift(CROP_BY_ID.maize, 'north', monsoon)).toBe(1)
    // ...but not where winters are cold: there warmth, not rain, decides and the temperate calendar stays
    const coldWinter = monsoon.map((m) => ({ ...m, t: m.month <= 2 || m.month === 12 ? -5 : 20 }))
    expect(calendarShift(CROP_BY_ID.maize, 'north', coldWinter)).toBe(0)
    // these rains fall in the southern winter - no monsoon there; the south shifts six months
    expect(calendarShift(CROP_BY_ID.maize, 'south', monsoon)).toBe(6)
    // no dry season: no reason to move
    expect(calendarShift(CROP_BY_ID.maize, 'tropics', n(new Array(12).fill(200)))).toBe(0)
  })
  it('on a monsoon field, sorghum grown in the rains is far less stressed than on the temperate calendar', () => {
    const climate = monsoonClimate()
    expect(climate.season.hemisphere).toBe('tropics')
    const soil = load('pergamino').soil
    const inRains = allCropRisks(climate, soil).sorghum.recent.loss
    // the same crop kept on its Central-European sowing date
    const temperate = cropRisk({ ...CROP_BY_ID.sorghum, fixedSow: true }, climate, soil).recent.loss
    expect(inRains).toBeLessThan(temperate)
  })
})

describe('warmth to ripen from GAEZ v4 heat units', () => {
  it('the heat table matches the GAEZ appendix (A4-6.1)', () => {
    expect(GAEZ_HEAT.Maize.find((r) => r.days === 120)).toEqual({ days: 120, tmin: 10, hu: [2000, 2100, 3600, 4200] })
    expect(GAEZ_HEAT.Cassava[0].hu[0]).toBe(6500)
    expect(GAEZ_HEAT['Dry pea'].map((r) => r.days)).toEqual([90, 105, 120])
  })
  it('the best cultivar decides; days below its minimum temperature add nothing', () => {
    const maize = heatNeeds('maize', false)
    expect(bestCultivar(new Array(200).fill(22), maize)!.fit).toBe(1)
    expect(bestCultivar(new Array(200).fill(9), maize)!.fit).toBe(0) // below 10 °C nothing counts
    // 90 days at 19.5 °C: 1755 units - just over the 90-day cultivar's lower limit, nowhere near its optimum
    const f = bestCultivar([...new Array(90).fill(19.5), ...new Array(110).fill(5)], maize)!
    expect(f.need.days).toBe(90)
    expect(f.fit).toBeCloseTo((1755 - 1750) / 50, 6)
    // tropical fields use GAEZ's tropical cultivars where it has them
    expect(heatNeeds('maize', true)[0].group).toBe('Maize tropical')
    // pulses GAEZ does not rate take dry pea's cultivars (they used to have no warmth need at all)
    for (const id of ['lupin', 'faba', 'lentil'] as const) expect(heatNeeds(id, false)[0].group).toBe('Dry pea')
  })
  it('on the German demo field the temperate crops can ripen', () => {
    const { risks } = load('torgau')
    for (const id of ['maize', 'sunflower', 'pea', 'potato', 'sugarbeet', 'oats', 'lupin', 'faba', 'lentil'] as const) expect(risks[id].thermal.recent, id).toBeGreaterThan(0.9)
  })
  it("spring wheat, barley and rapeseed use GAEZ's own cultivars (A4-6.1), not spring oat's", () => {
    expect(GAEZ_HEAT['Spring wheat'].map((r) => r.days)).toEqual([90, 105, 120, 135, 150])
    expect(GAEZ_HEAT['Spring wheat'].find((r) => r.days === 150)).toEqual({ days: 150, tmin: 5, hu: [1600, 1700, 2500, 2900] })
    expect(GAEZ_HEAT['Spring rape'].find((r) => r.days === 105)).toEqual({ days: 105, tmin: 5, hu: [1400, 1500, 2100, 2400] })
    expect(GAEZ_HEAT['Wheat tropical highland'].map((r) => r.days)).toEqual([100, 115, 130, 145, 160, 175, 190])
    expect(heatNeeds('wheat', false)[0].group).toBe('Spring wheat')
    expect(heatNeeds('barley', false)[0].group).toBe('Spring barley')
    expect(heatNeeds('rapeseed', false)[0].group).toBe('Spring rape')
    // tropical fields: GAEZ's tropical-highland wheat and barley, and its rabi (cool-season) rape
    expect(heatNeeds('wheat', true)[0].group).toBe('Wheat tropical highland')
    expect(heatNeeds('barley', true)[0].group).toBe('Barley tropical highland')
    expect(heatNeeds('rapeseed', true)[0].group).toBe('Rabi rape')
  })
  it('the autumn-sown form ripens on its own degree-days through a long cool winter (south-western Australia, check D)', () => {
    // -34.75, 117.75, NASA POWER 2016-2025 normals: wheat 43 %, barley 33 %, rapeseed 19 % of the cell; held-out check D
    // ranked wheat 25th because a 90-120-day summer cultivar collects too few heat units between May and September
    const climate = syntheticClimate({
      lat: -34.75, lon: 117.75, tRange: 11,
      t: [21, 21, 19, 16, 13, 11, 10, 10, 12, 14, 16, 19],
      p: [19, 16, 32, 45, 65, 86, 111, 104, 61, 44, 27, 15],
      pet: [216, 179, 147, 92, 66, 40, 38, 47, 69, 106, 144, 203],
    })
    const { soil } = load('torgau')
    for (const id of ['wheat', 'barley', 'rapeseed'] as const) {
      const crop = formOf(CROP_BY_ID[id], climate)
      expect(crop.form, id).toBe('mild')
      expect(cropRisk(crop, climate, soil).thermal.recent, id).toBe(1)
    }
  })
})

describe('world crops (FAO-56 via pyfao56, GAEZ v4 soil and warmth)', () => {
  const WORLD = ['rice', 'cassava', 'sweetpotato', 'groundnut', 'cowpea', 'drybean', 'cotton', 'pearlmillet'] as const
  it('every crop has its residue, nitrogen, GAEZ and heat-stress entries', () => {
    for (const c of CROPS) {
      expect(RESIDUE[c.id], c.id).toBeDefined()
      expect(N_RESIDUAL[c.id], c.id).toBeDefined()
      expect(c.id in GAEZ_CROP, c.id).toBe(true)
      // the daily flowering-heat refinement needs a failure temperature - except where the harvest is not set at flowering:
      // roots, forage, and the leaf, stem, bulb and head crops (their monthly heat limit stays)
      if (c.heat && !['root', 'forage'].includes(c.group) && !['sugarcane', 'tobacco', 'jute', 'onion', 'cabbage'].includes(c.id)) expect(T_CRIT[c.id], c.id).toBeDefined() // grain and seed crops
    }
  })
  it('tropical crops cannot ripen on the German field; the warm-season ones can on a monsoon field', () => {
    const { risks } = load('torgau')
    for (const id of ['cassava', 'sweetpotato', 'groundnut', 'cotton'] as const) expect(risks[id].thermal.recent, id).toBeLessThan(0.2)
    const warm = allCropRisks(monsoonClimate(), load('pergamino').soil)
    for (const id of ['groundnut', 'cowpea', 'pearlmillet', 'sorghum', 'rice'] as const) expect(warm[id].thermal.recent, id).toBeGreaterThan(0.9)
  })
  it('contract crops start switched off unless the region grows them', () => {
    expect(defaultExcludeFor(null)).toEqual(expect.arrayContaining(['cotton', 'potato', 'sugarbeet', 'sweetpotato']))
    const cottonBelt = defaultExcludeFor({ crops: [{ id: 'cotton', share: 0.2 }, { id: 'maize', share: 0.3 }] })
    expect(cottonBelt).not.toContain('cotton')
    expect(cottonBelt).toContain('potato')
    for (const id of WORLD) if (!['cotton', 'sweetpotato'].includes(id)) expect(defaultExcludeFor(null)).not.toContain(id)
  })
})

describe('stored and shared data migrate across schema versions', () => {
  it('a farm saved before the world crops keeps them switched off', async () => {
    const { migrateFarm } = await import('./farm')
    const { WORLD_CROPS, SCHEMA } = await import('./version')
    const old = { name: 'x', guest: false, fields: [{ exclude: ['clover'] }] } as never
    const f = migrateFarm(old) as unknown as { fields: { exclude: string[] }[] }
    for (const id of WORLD_CROPS) expect(f.fields[0].exclude).toContain(id)
    const current = { name: 'x', guest: false, schema: SCHEMA, fields: [{ exclude: ['clover'] }] } as never
    expect(migrateFarm(current)).toBe(current)
  })
  it('a farm saved before the bare fallow keeps it switched off', async () => {
    const { migrateFarm } = await import('./farm')
    const f = migrateFarm({ name: 'x', guest: false, schema: 3, fields: [{ exclude: ['clover'] }] } as never) as unknown as { fields: { exclude: string[] }[] }
    expect(f.fields[0].exclude).toContain('fallow')
  })
})

describe('a bare fallow stores rain for the next crop (P2.8)', () => {
  it('stores a share of the fallow year’s rain in western Kansas, under what the trials measured', async () => {
    const { fallowEfficiency } = await import('./water')
    const { climate, soil } = load('kansas')
    // Garden City and Tribune stored 26-27 % by wheat sowing (Gwin et al. 1984); monthly rain makes the model store less
    const pse = fallowEfficiency(CROP_BY_ID.wheat, climate, soil)
    expect(pse).toBeGreaterThan(0.08)
    expect(pse).toBeLessThan(0.3)
  })
  it('lowers the water-stress loss of wheat after it where the soil does not refill, and barely where it does', () => {
    const dry = load('kansas').ctx.risks.wheat
    expect(dry.recent.loss - dry.afterFallow!.recent.loss).toBeGreaterThan(0.05)
    const humid = load('torgau').ctx.risks.wheat
    expect(humid.recent.loss - humid.afterFallow!.recent.loss).toBeLessThan(0.02)
  })
  it('the explanation and the Monte Carlo read the after-fallow water the score was given', async () => {
    const { chainFor } = await import('./explain')
    const { contextFor, simulateAll } = await import('./robust')
    const { p, climate, ctx } = load('kansas')
    const e = evaluate(CROP_BY_ID.wheat, [...p.history, 'fallow'], ctx, p.priorities)
    expect(e.afterFallow).toBe(true)
    expect(chainFor(e, ctx, climate).loss).toBeCloseTo(e.loss)
    // a draw of one season is that season after the fallow (the draws used to keep the nominal after-fallow decade)
    const { SOIL_FACTORS } = await import('./robust')
    const sim = simulateAll(ctx, climate, ['wheat'], true)
    const y = sim.recentYears[0]
    const one = contextFor(ctx, ['wheat'], sim, { soil: SOIL_FACTORS.indexOf(1), seasons: [y], ky: {}, price: {}, w: p.priorities })
    expect(one.risks.wheat.afterFallow!.recent.loss).toBeCloseTo(ctx.risks.wheat.afterFallow!.byYear.find((s) => s.year === y)!.loss)
  })
})

describe('remaining science: Sobol, daily water, insects, workability', () => {
  it('the Sobol estimator recovers the Ishigami function’s exact indices', async () => {
    const { sobolIndices } = await import('./sobol')
    const ish = (u: number[]) => {
      const [x1, x2, x3] = u.map((v) => -Math.PI + 2 * Math.PI * v)
      return Math.sin(x1) + 7 * Math.sin(x2) ** 2 + 0.1 * x3 ** 4 * Math.sin(x1)
    }
    const { S1, ST } = sobolIndices(ish, 3, 16384)
    const exactS1 = [0.3139, 0.4424, 0]
    const exactST = [0.5576, 0.4424, 0.2437]
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(S1[i] - exactS1[i]), `S1[${i}]`).toBeLessThan(0.04)
      expect(Math.abs(ST[i] - exactST[i]), `ST[${i}]`).toBeLessThan(0.04)
    }
  })
  it('the lead on the German field decomposes into bounded, reproducible indices', async () => {
    const { sobolGap } = await import('./sobol')
    const { p, climate, ctx } = load('torgau')
    const a = sobolGap(p.history, ctx, p.priorities, new Set(p.exclude), climate, 64)!
    const b = sobolGap(p.history, ctx, p.priorities, new Set(p.exclude), climate, 64)!
    expect(a).toEqual(b)
    expect(a.factors).toHaveLength(7)
    for (const f of a.factors) {
      expect(f.ST).toBeGreaterThanOrEqual(0)
      expect(f.ST).toBeLessThanOrEqual(1)
    }
  })
  it('FAO-56 example 8: extraterrestrial radiation at 20° S on 3 September is 32.2 MJ/m²/day', async () => {
    const { extraterrestrial } = await import('./dailyWater')
    expect(extraterrestrial(-20, 246)).toBeCloseTo(32.2, 1)
  })
  it('the daily re-run keeps the monthly model’s crop order on the demo fields', async () => {
    const { dailyCheck } = await import('./dailyWater')
    for (const id of ['torgau', 'kansas']) {
      const { climate, soil, daily, risks } = load(id)
      const c = dailyCheck(climate, soil, daily.raw, risks)!
      expect(c.n).toBeGreaterThanOrEqual(6)
      expect(c.rho, id).toBeGreaterThan(0.5)
    }
  })
  it('insect degree-days rose with the warming at Torgau', async () => {
    const { insectPressure } = await import('./pests')
    const x = insectPressure(load('torgau').climate)!
    expect(x.recent).toBeGreaterThan(x.baseline)
    expect(x.lossRise[1]).toBeGreaterThan(x.lossRise[0])
  })
  it('heavy harvests on wet clay are flagged; the same crop on sand is not', () => {
    const { climate, soil } = load('torgau')
    const wet = { ...climate, byMonth: new Map([...climate.byMonth].map(([k, r]) => [k, { ...r, p: r.pet * 1.5 }])) }
    const risks = allCropRisks(wet, soil)
    expect(risks.sugarbeet.workability!.harvest.recent).toBe(1)
    const clay = { ...soil, top: { ...soil.top, clay: 45 } }
    const w = { soil: 50, water: 50, profit: 50 }
    const onClay = evaluate(CROP_BY_ID.sugarbeet, ['wheat', 'barley'], { ...load('torgau').ctx, risks, soil: clay }, w)
    const onSand = evaluate(CROP_BY_ID.sugarbeet, ['wheat', 'barley'], { ...load('torgau').ctx, risks, soil }, w)
    expect(onClay.notes.some((n) => n.text.startsWith('Harvest traffic on wet clay'))).toBe(true)
    expect(onSand.notes.some((n) => n.text.startsWith('Harvest traffic on wet clay'))).toBe(false)
  })
})

describe('market prices in the ranking', () => {
  const base = load('torgau').ctx
  const w = { soil: 60, water: 60, profit: 60 }
  const crops = CROPS.map((c) => c.id)
  const torgau: [number, number] = [13.05, 51.52]
  it('without a market the ranking is unchanged (reference prices)', () => {
    expect(rankNext([], { ...base, market: null }, w).map((e) => e.crop.id)).toEqual(rankNext([], base, w).map((e) => e.crop.id))
  })
  it('the grower’s higher price raises that crop’s margin, and the market is named', () => {
    const home = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'home' }, crops, sea: seaJson as SeaMatrix })
    const e = rankNext([], { ...base, market: home }, w).find((x) => x.crop.id === 'wheat')!
    expect(e.money?.market).toBe('DEU')
    const own = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'home' }, crops, sea: seaJson as SeaMatrix, own: { wheat: 1000 } })
    const e2 = rankNext([], { ...base, market: own }, w).find((x) => x.crop.id === 'wheat')!
    expect(e2.margin).toBeGreaterThan(e.margin)
    expect(e2.money?.source).toBe('yours')
  })
  it('a far market lowers the margin by the freight and duty', () => {
    const home = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'home' }, crops, sea: seaJson as SeaMatrix })
    const usa = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'to', iso3: 'USA' }, crops, sea: seaJson as SeaMatrix })
    const at = (m: typeof home) => rankNext([], { ...base, market: m }, w).find((x) => x.crop.id === 'rapeseed')!
    expect(at(usa).money?.netPerT).toBeLessThan(usa.quotes.rapeseed!.price)
    expect(at(usa).money?.mode).toBe('sea')
    expect(at(home).money?.mode).toBe('local')
  })
  it('selling at home keeps the reference economics: country price levels alone do not reorder crops', () => {
    // the reference prices and costs are one consistent set; absolute farm-gate prices without matching local costs
    // made the ranking worse against what regions grow (docs/SCIENCE.md §6), so a market only moves money relative to home
    const home = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'home' }, crops, sea: seaJson as SeaMatrix })
    const none = rankNext([], { ...base, market: null }, w)
    const withHome = rankNext([], { ...base, market: home }, w)
    for (const id of ['wheat', 'maize', 'rapeseed', 'barley'] as const) {
      const a = withHome.find((e) => e.crop.id === id)!
      const b = none.find((e) => e.crop.id === id)!
      // only the country cost index (Germany ≈ 1.04) separates them
      expect(Math.abs(a.margin - b.margin)).toBeLessThan(0.15 * CROP_BY_ID[id].econ.cost)
    }
  })
  it('the demand bonus never moves profit by more than 10 %', () => {
    const m = buildMarket({ origin: torgau, home: 'DEU', mode: { kind: 'auto' }, crops, sea: seaJson as SeaMatrix })
    for (const e of rankNext([], { ...base, market: m }, w)) expect(Math.abs(e.money?.demand ?? 0)).toBeLessThanOrEqual(0.1)
  })
})

describe('observed yields in the ranking', () => {
  const base = load('torgau').ctx
  const w = { soil: 60, water: 60, profit: 60 }
  const maize = (ctx: typeof base) => rankNext([], ctx, w).find((e) => e.crop.id === 'maize')!
  it('a country that harvests more makes the crop earn more, one that harvests less, less', () => {
    const hi = maize({ ...base, yieldRef: { maize: { t: 14, source: 'country' } } })
    const lo = maize({ ...base, yieldRef: { maize: { t: 5, source: 'country' } } })
    expect(hi.margin).toBeGreaterThan(lo.margin)
    expect(hi.harvest).toBeGreaterThan(lo.harvest)
  })
  it('the site still moves the yield: the model’s share here scales the country record, within 0.3-1.25×', () => {
    const e = maize({ ...base, yieldRef: { maize: { t: 10, source: 'country' } } })
    expect(e.harvest).toBeCloseTo(10 * Math.min(1.25, Math.max(0.3, e.yieldShare / 0.8)), 6)
  })
  it('a crop nobody in the region grows loses standing in mode C (national practice), not in the science alone', () => {
    const at = (source: 'country' | 'region' | 'world', nationalProof: boolean) => maize({ ...base, nationalProof, yieldRef: { maize: { t: 9, source } } })
    expect(at('world', true).score).toBeLessThan(at('region', true).score)
    expect(at('region', true).score).toBeLessThan(at('country', true).score)
    expect(at('world', true).proof).toBeLessThan(at('country', true).proof)
    // mode A: the proof is reported, never applied
    expect(at('world', false).proof).toBe(at('world', true).proof)
    expect(at('world', false).sub.viability).toBe(1)
    expect(at('world', false).score).toBeCloseTo(at('world', true).science, 9)
  })
  it('says so when nobody in the country grows the crop at scale', () => {
    const e = maize({ ...base, yieldRef: { maize: { t: 6, source: 'region' } } })
    expect(e.notes.some((n) => /not grown at scale/i.test(n.text))).toBe(true)
  })
  it("a glasshouse country's tomato and pepper yields do not lift an open field (FAOSTAT: Netherlands 460 and 272 t/ha)", () => {
    const veg = (id: 'tomato' | 'chilli', t: number) =>
      rankNext([], { ...base, yieldRef: { [id]: { t, source: 'country' } } }, w, new Set<CropId>()).find((e) => e.crop.id === id)!
    for (const [id, t] of [['tomato', 460], ['chilli', 272]] as const) {
      const e = veg(id, t)
      expect(e.harvest, id).toBeLessThanOrEqual(CROP_BY_ID[id].econ.yield * e.yieldShare + 1e-9)
    }
    // an open-field country's record still anchors the harvest (Kenya, tomato 23 t/ha)
    const kenya = veg('tomato', 23)
    expect(kenya.harvest).toBeCloseTo(23 * Math.min(1.25, Math.max(0.3, kenya.yieldShare / 0.8)), 6)
  })
})

describe('winter crops follow thermal time, not a German calendar', () => {
  const season = (id: string) => {
    const { climate } = load(id)
    return { s: cropSeason(CROP_BY_ID.wheat, 'north', climate.monthly.recent), heat: localMonth(CROP_BY_ID.wheat.heat!.month, CROP_BY_ID.wheat, 'north', climate.monthly.recent) }
  }
  it('Torgau: flowering in June, harvest in July, as before', () => {
    const { s, heat } = season('torgau')
    expect(s.at(-1)!.month).toBe(7)
    expect(heat).toBe(6)
  })
  it('Kansas (38° N): the degree-days arrive a month earlier - flowering in May, harvest in June', () => {
    const { s, heat } = season('kansas')
    expect(s.at(-1)!.month).toBe(6)
    expect(heat).toBe(5)
    expect(s[0].month).toBe(10) // still sown in October
    expect(s.at(-1)!.kc).toBeLessThan(0.7) // June is ripening, not peak water use
    expect(s.find((m) => m.month === 5)!.kc).toBeGreaterThan(1)
  })
})
