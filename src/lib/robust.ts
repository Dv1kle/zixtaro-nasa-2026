// How sure is the pick, and what would change it?
//
// 1. Monte Carlo. Every input behind a recommendation is known only roughly, so the ranking is re-run many times
//    with each of them varied within a plausible range:
//      · the soil's plant-available water ±20 % (SoilGrids is itself a model, with wide error bars),
//      · which seasons "the last decade" happens to contain (resampled with replacement),
//      · how hard each crop's yield reacts to water stress (FAO-33 Ky ±15 %; ±25 % where Ky is not tabulated),
//      · reference crop prices ±20 %, independently per crop,
//      · the farmer's own priority weights ±15 points (nobody means exactly "60").
//    Each crop's share of first places is its confidence; its spread of ranks shows how close the field is.
//    A fixed seed keeps the numbers from jittering between renders - same inputs, same answer, always.
// 2. One factor at a time. Each input pushed to the end of its range with everything else as observed: which of
//    them, alone, hands first place to another crop?
// 3. Irrigation ladder. The ranking re-run for seasonal irrigation budgets from 0 to 300 mm: the water it takes
//    for another crop to take over is the "tipping point".

import type { ClimateAnalysis } from './climate'
import { CROP_BY_ID, type CropId } from './crops'
import { rankNext, type FieldContext, type Priorities } from './rotation'
import type { SoilProfile } from './soil'
import { clamp } from './stats'
import { allCropRisks, bareSoil, paddyFor, riskAfter, simulateSeason, type CropRisk, type WaterFigures } from './water'

export type Confidence = {
  runs: number
  /** share of runs each crop ranked first, highest first */
  shares: { id: CropId; share: number }[]
  top: CropId
  topShare: number
  /** for the most frequent contenders: share of runs at rank 1, 2, 3 and lower */
  ranks: { id: CropId; r1: number; r2: number; r3: number; median: number }[]
  /** what was varied, for the explanation */
  varied: string[]
}

export const SOIL_FACTORS = [0.8, 0.9, 1, 1.1, 1.2]
export const SEED = 20_261_115

/** mulberry32 - tiny, fast, good enough for resampling */
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Season = { stress: number; deficit: number; irrigation: number; eta: number }
const figures = (xs: Season[], ky: number): WaterFigures => {
  const loss = xs.map((x) => clamp(ky * x.stress))
  const worst = [...loss].sort((a, b) => b - a).slice(0, Math.max(1, Math.round(xs.length * 0.3)))
  const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
  return {
    loss: avg(loss),
    deficit: avg(xs.map((x) => x.deficit)),
    stress: avg(xs.map((x) => x.stress)),
    bad: avg(worst),
    irrigation: avg(xs.map((x) => x.irrigation)),
    eta: avg(xs.map((x) => x.eta)),
  }
}

const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/** Every crop × soil factor × season simulated once; the runs only recombine these. `afterFallow` (the last season
 *  was a bare fallow): each season is also simulated after the fallow year, as the score reads it (water.ts riskAfter). */
export function simulateAll(ctx: FieldContext, climate: ClimateAnalysis, ids: CropId[], afterFallow = false) {
  const recentYears = span(climate.recent.from, climate.recent.to)
  const baseYears = span(climate.baseline.from, climate.baseline.to)
  const sims = new Map<string, Season>()
  const base = new Map<string, Season[]>()
  const fig = (s: Season): Season => ({ stress: s.stress, deficit: s.deficit, irrigation: s.irrigation, eta: s.eta })
  // one form of a crop, under key `tag`: the form this field grows (spring wheat on the Prairies, silage maize in
  // Denmark), and near a switch the other form too (water.ts formsOf) - as the score simulates them
  const simulate = (r: CropRisk, tag: string) => {
    const crop = r.crop ?? CROP_BY_ID[r.id]
    const bare = afterFallow && r.afterFallow ? bareSoil(ctx.soil) : undefined
    const paddy = paddyFor(crop, ctx.soil) // rice is drawn in its paddy, as it is scored
    SOIL_FACTORS.forEach((f, k) => {
      for (const y of recentYears) {
        const s = simulateSeason(crop, climate, r.taw * f, y, ctx.budget ?? 0, ctx.co2?.transpiration ?? 1, paddy)
        if (s) sims.set(`${tag}|${k}|${y}`, fig(s))
        const a = bare ? simulateSeason(crop, climate, r.taw * f, y, ctx.budget ?? 0, ctx.co2?.transpiration ?? 1, paddy, bare) : null
        if (a) sims.set(`${tag}|${k}|${y}|f`, fig(a))
      }
      const b = baseYears.map((y) => simulateSeason(crop, climate, r.taw * f, y, ctx.budget ?? 0, 1, paddy)).filter((s) => s !== null)
      base.set(`${tag}|${k}`, b.map(fig))
      if (bare) base.set(`${tag}|${k}|f`, baseYears.map((y) => simulateSeason(crop, climate, r.taw * f, y, ctx.budget ?? 0, 1, paddy, bare)).filter((s) => s !== null).map(fig))
    })
  }
  for (const id of ids) {
    // every variant near a line, as the score mixes them (water.ts formsOf)
    for (let r: CropRisk | undefined = ctx.risks[id], tag = id as string; r; r = r.alt?.risk, tag += '|alt') simulate(r, tag)
  }
  return { sims, base, recentYears }
}

export type Draw = { soil: number; seasons: number[]; ky: Partial<Record<CropId, number>>; price: Partial<Record<CropId, number>>; w: Priorities }

export function contextFor(ctx: FieldContext, ids: CropId[], sim: ReturnType<typeof simulateAll>, d: Draw): FieldContext {
  // one form's figures under the draw (simulateAll's key `tag`); null where it has no season
  const drawn = (r: CropRisk, tag: string): CropRisk | null => {
    const ky = (r.crop ?? CROP_BY_ID[r.id]).ky * (d.ky[r.id] ?? 1)
    const figs = d.seasons.map((y) => sim.sims.get(`${tag}|${d.soil}|${y}`)).filter((x): x is Season => x !== undefined)
    if (!figs.length) return null
    const b = sim.base.get(`${tag}|${d.soil}`) ?? []
    const out: CropRisk = { ...r, taw: r.taw * SOIL_FACTORS[d.soil], recent: figures(figs, ky), baseline: b.length ? figures(b, ky) : r.baseline }
    // the same draw after the fallow year, where the score reads that (simulateAll afterFallow)
    const ffigs = d.seasons.map((y) => sim.sims.get(`${tag}|${d.soil}|${y}|f`)).filter((x): x is Season => x !== undefined)
    const fb = sim.base.get(`${tag}|${d.soil}|f`) ?? []
    if (r.afterFallow && ffigs.length) out.afterFallow = { ...r.afterFallow, recent: figures(ffigs, ky), baseline: fb.length ? figures(fb, ky) : r.afterFallow.baseline }
    return out
  }
  const risks = { ...ctx.risks }
  for (const id of ids) {
    // near a line every other variant is drawn the same way (the score mixes them)
    const all = (r: CropRisk, tag: string): CropRisk | null => {
      const risk = drawn(r, tag)
      if (!risk || !r.alt) return risk
      const alt = all(r.alt.risk, `${tag}|alt`)
      return { ...risk, alt: alt ? { ...r.alt, risk: alt } : r.alt }
    }
    const risk = all(ctx.risks[id], id)
    if (risk) risks[id] = risk
  }
  return { ...ctx, risks, priceFactor: d.price }
}

/** Which inputs a Monte Carlo varies - all of them in the app; the calibration also runs the weather alone. */
export type Vary = { soil: boolean; seasons: boolean; ky: boolean; prices: boolean; priorities: boolean }
export const VARY_ALL: Vary = { soil: true, seasons: true, ky: true, prices: true, priorities: true }

export function pickConfidence(
  history: (CropId | null)[], ctx: FieldContext, w: Priorities, exclude: Set<CropId>, climate: ClimateAnalysis, runs = 240, vary: Vary = VARY_ALL,
): Confidence | null {
  if (ctx.stressYear) return null // a replay is one season by definition
  const ids = (Object.keys(ctx.risks) as CropId[]).filter((id) => !exclude.has(id))
  if (!ids.length) return null
  const sim = simulateAll(ctx, climate, ids, history[history.length - 1] === 'fallow')
  const rand = rng(SEED)
  const u = (lo: number, hi: number) => lo + (hi - lo) * rand()
  const first = new Map<CropId, number>()
  const rankTally = new Map<CropId, number[]>()
  for (let r = 0; r < runs; r++) {
    // every draw consumes the same random numbers whatever is varied, so switching one input off leaves the others' draws as they were
    const soilDraw = Math.floor(rand() * SOIL_FACTORS.length)
    const seasonDraw = sim.recentYears.map(() => sim.recentYears[Math.floor(rand() * sim.recentYears.length)])
    const d: Draw = {
      soil: vary.soil ? soilDraw : SOIL_FACTORS.indexOf(1),
      seasons: vary.seasons ? seasonDraw : sim.recentYears,
      ky: {},
      price: {},
      w: { soil: 0, water: 0, profit: 0 },
    }
    for (const id of ids) {
      const wide = CROP_BY_ID[id].kyAssumed ? 0.25 : 0.15
      const k = u(1 - wide, 1 + wide)
      const pr = u(0.8, 1.2)
      d.ky[id] = vary.ky ? k : 1
      d.price[id] = vary.prices ? pr : 1
    }
    const dw = { soil: u(-15, 15), water: u(-15, 15), profit: u(-15, 15) }
    d.w = vary.priorities ? { soil: clamp(w.soil + dw.soil, 0, 100), water: clamp(w.water + dw.water, 0, 100), profit: clamp(w.profit + dw.profit, 0, 100) } : w
    const ranked = rankNext(history, contextFor(ctx, ids, sim, d), d.w, exclude)
    if (!ranked[0]) continue
    first.set(ranked[0].crop.id, (first.get(ranked[0].crop.id) ?? 0) + 1)
    ranked.forEach((e, i) => {
      const t = rankTally.get(e.crop.id) ?? []
      t.push(i + 1)
      rankTally.set(e.crop.id, t)
    })
  }
  const shares = [...first.entries()].map(([id, n]) => ({ id, share: n / runs })).sort((a, b) => b.share - a.share)
  if (!shares.length) return null
  const contenders = [...rankTally.entries()]
    .map(([id, rs]) => {
      const sorted = [...rs].sort((a, b) => a - b)
      const share = (k: number) => rs.filter((x) => x === k).length / rs.length
      return { id, r1: share(1), r2: share(2), r3: share(3), median: sorted[Math.floor(sorted.length / 2)] }
    })
    .sort((a, b) => a.median - b.median || b.r1 - a.r1)
    .slice(0, 5)
  return {
    runs,
    shares,
    top: shares[0].id,
    topShare: shares[0].share,
    ranks: contenders,
    varied: ['soil water ±20 %', 'which recent seasons', 'crop drought response (Ky) ±15-25 %', 'crop prices ±20 %', 'your priorities ±15'],
  }
}

// ---------- 2 + 3: what flips the pick ----------

export type Flip = {
  key: string
  label: string // what was changed, in words
  source: 'SoilGrids' | 'NASA POWER' | 'FAO-33' | 'prices' | 'your priorities'
  top: CropId // the pick with this change
}

export type LadderStep = { budget: number; top: CropId; loss: number; used: number }

export type Sensitivity = {
  pick: CropId
  flips: Flip[]
  ladder: LadderStep[]
  /** the smallest budget at which each crop takes first place (only crops that ever do) */
  tipping: { id: CropId; budget: number }[]
}

export const LADDER = [0, 25, 50, 75, 100, 150, 200, 250, 300]

export function sensitivity(
  history: (CropId | null)[], ctx: FieldContext, w: Priorities, exclude: Set<CropId>, climate: ClimateAnalysis, soil: SoilProfile,
): Sensitivity | null {
  if (ctx.stressYear) return null // flips are about typical seasons; a replay is one season by definition
  const ids = (Object.keys(ctx.risks) as CropId[]).filter((id) => !exclude.has(id))
  const nominal = rankNext(history, ctx, w, exclude)[0]
  if (!nominal) return null
  const pick = nominal.crop.id
  const runnerUp = rankNext(history, ctx, w, exclude)[1]?.crop.id
  const sim = simulateAll(ctx, climate, ids, history[history.length - 1] === 'fallow')
  const mid = SOIL_FACTORS.indexOf(1)
  const top = (d: Partial<Draw>, weights: Priorities = w) => {
    const draw: Draw = { soil: mid, seasons: sim.recentYears, ky: {}, price: {}, w: weights, ...d }
    return rankNext(history, contextFor(ctx, ids, sim, draw), weights, exclude)[0]?.crop.id ?? pick
  }
  // seasons ranked by how dry the root zone was, from the NASA record
  const byDryness = [...sim.recentYears].sort((a, b) => (climate.years.find((y) => y.year === a)?.wGS ?? 0) - (climate.years.find((y) => y.year === b)?.wGS ?? 0))
  const half = Math.ceil(byDryness.length / 2)
  const all = (f: number) => Object.fromEntries(ids.map((id) => [id, f])) as Partial<Record<CropId, number>>
  const flips: Flip[] = []
  const add = (key: string, label: string, source: Flip['source'], t: CropId) => flips.push({ key, label, source, top: t })
  add('soil-', 'Soil holds 20 % less water', 'SoilGrids', top({ soil: 0 }))
  add('soil+', 'Soil holds 20 % more water', 'SoilGrids', top({ soil: SOIL_FACTORS.length - 1 }))
  {
    add('dry', `Seasons like the ${half} driest of ${climate.recent.from}-${climate.recent.to}`, 'NASA POWER', top({ seasons: byDryness.slice(0, half) }))
    add('wet', `Seasons like the ${half} wettest of ${climate.recent.from}-${climate.recent.to}`, 'NASA POWER', top({ seasons: byDryness.slice(-half) }))
  }
  add('ky+', 'Crops 15 % more sensitive to drought', 'FAO-33', top({ ky: all(1.15) }))
  // named as the field grows them (spring wheat on the prairies)
  const nameOf = (id: CropId) => (ctx.risks[id]?.crop ?? CROP_BY_ID[id]).name
  add('price-', `${nameOf(pick)} price −20 %`, 'prices', top({ price: { [pick]: 0.8 } }))
  if (runnerUp) add('price+', `${nameOf(runnerUp)} price +20 %`, 'prices', top({ price: { [runnerUp]: 1.2 } }))
  const bump = (k: keyof Priorities) => ({ ...w, [k]: clamp(w[k] + 25, 0, 100) })
  add('w-soil', 'Soil health matters more (+25)', 'your priorities', top({}, bump('soil')))
  add('w-water', 'Saving water matters more (+25)', 'your priorities', top({}, bump('water')))
  add('w-profit', 'Profit matters more (+25)', 'your priorities', top({}, bump('profit')))

  // the irrigation ladder re-simulates every crop and season with each budget (unlimited mode left out)
  const ladder: LadderStep[] = LADDER.map((b) => {
    const fresh = allCropRisks(climate, soil, b, ctx.co2?.transpiration ?? 1)
    // water re-simulated with the budget; heat and frost (read from daily data when available) carry over - to the
    // other form near a switch too (water.ts formsOf), so the 0 mm step gives back the page's ranking
    const carry = (f: CropRisk, c: CropRisk): CropRisk => ({ ...f, heat: c.heat, heatDaily: c.heatDaily, frost: c.frost, alt: f.alt && c.alt ? { ...f.alt, risk: carry(f.alt.risk, c.alt.risk) } : f.alt })
    const risks = Object.fromEntries((Object.keys(fresh) as CropId[]).map((id) => {
      const f = fresh[id]
      const c = ctx.risks[id]
      return [id, carry(f, c)]
    })) as typeof fresh
    const c: FieldContext = { ...ctx, risks, irrigated: false, budget: b }
    const first = rankNext(history, c, w, exclude)[0]
    return { budget: b, top: first?.crop.id ?? pick, loss: first?.loss ?? 0, used: first ? riskAfter(risks[first.crop.id], first.afterFallow).recent.irrigation : 0 }
  })
  const tipping: { id: CropId; budget: number }[] = []
  for (const s of ladder) if (!tipping.some((t) => t.id === s.top)) tipping.push({ id: s.top, budget: s.budget })
  return { pick, flips, ladder, tipping }
}
