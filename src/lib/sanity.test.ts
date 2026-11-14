// Physical sanity tests: monotonicity (one input perturbed at a time) and adversarial synthetic sites.
// Tests that reveal a real violation are kept as `it.fails` with a `// VIOLATION:` comment so the suite stays green.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeClimate, parsePowerMonthly, type MonthRec } from './climate'
import { CROP_BY_ID, CROPS, type Crop, type CropId } from './crops'
import { analyzeDaily } from './daily'
import type { Daily } from './dailyFormat'
import { withDailyExtremes, T_CRIT } from './extremes'
import { phRating } from './gaez'
import { MOSTLY_IRRIGATED } from './irrigation'
import { PRESETS } from './presets'
import { evaluate, IRRIGATION_COST, N_PRICE, nothingPays, precropCredit, rankNext, type Evaluation, type FieldContext, type Priorities } from './rotation'
import { averageProfiles, manualProfile, parseSoilGrids, type SoilProfile } from './soil'
import { syntheticClimate } from './testkit'
import { allCropRisks } from './water'
import { EXTRA_IDS, EXTRA_OPT_IN } from './cropsExtra'

const EPS = 1e-9
const W: Priorities = { soil: 50, water: 50, profit: 50 }
const SITES = ['torgau', 'kansas', 'pergamino']

type Site = { id: string; lat: number; lon: number; recs: MonthRec[]; soil: SoilProfile; daily: Daily; history: (CropId | null)[]; w: Priorities }
const sites = new Map<string, Site>()
function site(id: string): Site {
  let s = sites.get(id)
  if (!s) {
    const p = PRESETS.find((x) => x.id === id)!
    const b = JSON.parse(readFileSync(`public/data/presets/${p.bundle ?? p.id}.json`, 'utf8'))
    const recs = parsePowerMonthly(b.power, p.field.lat)
    const soil = averageProfiles(b.soil.map(parseSoilGrids), b.samples)
    s = { id, lat: p.field.lat, lon: p.field.lon, recs, soil, daily: analyzeDaily(b.daily, p.field.lat)!.raw, history: p.history, w: p.priorities }
    sites.set(id, s)
  }
  return s
}

type Opts = { rain?: number; soil?: SoilProfile; daily?: Daily; budget?: number; irrigated?: boolean; recs?: MonthRec[] }
/** Same construction as testkit.load(): climate → risks → FieldContext, with optional perturbations. */
function build(s: Site, o: Opts = {}) {
  const recs = o.recs ?? (o.rain === undefined ? s.recs : s.recs.map((r) => ({ ...r, p: r.p * o.rain! })))
  const climate = analyzeClimate(recs, s.lat, s.lon)
  const soil = o.soil ?? s.soil
  let risks = allCropRisks(climate, soil, o.budget ?? 0)
  if (o.daily) risks = withDailyExtremes(risks, o.daily, climate)
  const ctx: FieldContext = {
    risks, soil, stressYear: null, irrigated: o.irrigated ?? false, budget: o.budget, drying: climate.signal.drying, slopePct: 0.5,
    recentLabel: `${climate.recent.from}-${climate.recent.to}`, baselineLabel: `${climate.baseline.from}-${climate.baseline.to}`,
  }
  return { climate, soil, risks, ctx }
}
const evalAll = (history: (CropId | null)[], ctx: FieldContext, w = W) => Object.fromEntries(CROPS.map((c) => [c.id, evaluate(c, history, ctx, w)])) as Record<CropId, Evaluation>

const shiftDaily = (d: Daily, tmax: number, tmin: number): Daily => ({
  ...d, tmax: d.tmax.map((v) => (v == null ? v : v + tmax)), tmin: d.tmin.map((v) => (v == null ? v : v + tmin)),
})
const fmt = (x: number) => x.toFixed(4)
/** set SANITY_LOG=1 to print the numbers behind each test */
const log = (...a: unknown[]) => { if (process.env.SANITY_LOG) process.stderr.write(a.join(' ') + '\n') }

/** Evaluate every crop at each level of one perturbation; flag a crop whenever `pick` moves the wrong way between consecutive levels. */
function sweep(
  label: string, levels: number[], make: (site: Site, level: number) => { ctx: FieldContext; history?: (CropId | null)[] },
  pick: (e: Evaluation) => number, dir: 1 | -1, siteIds = SITES,
): string[] {
  const bad: string[] = []
  for (const id of siteIds) {
    const s = site(id)
    const runs = levels.map((l) => { const m = make(s, l); return evalAll(m.history ?? s.history, m.ctx, s.w) })
    for (const c of CROPS) {
      for (let i = 1; i < levels.length; i++) {
        const a = pick(runs[i - 1][c.id])
        const b = pick(runs[i][c.id])
        if (dir * (b - a) < -EPS) bad.push(`${label} ${id}/${c.id}: ${fmt(a)} (level ${levels[i - 1]}) -> ${fmt(b)} (level ${levels[i]})`)
      }
    }
  }
  return bad
}
const report = (v: string[]) => { if (v.length) log(v.slice(0, 12).join('\n') + (v.length > 12 ? `\n... ${v.length} in total` : '')) }

describe('monotonicity on preset fields (torgau, kansas, pergamino)', () => {
  // VIOLATION: kansas/chickpea water 0.1778 (rain x1.25) -> 0.1673 (x1.6) although water loss falls 0.369 -> 0.267: the extra rain raises the foliar-disease
  // share `wet` 0.1 -> 0.5, which cuts `harvest` by (1 - 0.35 wet), and the drought-year margin of the water axis is built from that harvest
  // (src/lib/rotation.ts:402 feeds :449-451), so disease is charged to the drought axis.
  it('more rain never lowers a crop\'s water score', () => {
    const v = sweep('water', [0.6, 0.8, 1, 1.25, 1.6], (s, l) => build(s, { rain: l }), (e) => e.sub.water, 1)
    report(v)
    expect(v).toEqual([])
  }, 30_000) // the first rain sweep reads each field's rainy seasons afresh (crops.ts rainsRuns); later ones hit the memo
  it('more rain never raises a crop\'s water loss', () => {
    const v = sweep('loss', [0.6, 0.8, 1, 1.25, 1.6], (s, l) => build(s, { rain: l }), (e) => e.loss, -1)
    report(v)
    expect(v).toEqual([])
  })

  const paw = (soil: SoilProfile, k: number): SoilProfile => ({
    ...soil, paw100: soil.paw100 * k, layers: soil.layers.map((l) => ({ ...l, paw: l.paw * k })),
  })
  const wh = (id: 'soil' | 'water', pick: (e: Evaluation) => number) => sweep(id, [0.7, 1, 1.3], (s, l) => build(s, { soil: paw(s.soil, l) }), pick, 1)
  // VIOLATION: kansas/wheat soil sub-score 0.3991 (PAW x0.7) -> 0.3978 (x1.0); kansas/oats 0.4820 -> 0.4800 -> 0.4788 (x1.3). 38 water+soil cases in all, all tiny (<0.011).
  // Root cause is the bucket, see the water-loss test below; the soil axis inherits it through yieldShare -> carbon inputs (rotation.ts:402, :470).
  it.fails('higher water-holding capacity never lowers the soil score', () => {
    const v = wh('soil', (e) => e.sub.soil)
    report(v)
    expect(v).toEqual([])
  })
  // VIOLATION: kansas/sunflower water 0.0591 (x0.7) -> 0.0540 (x1.0) -> 0.0525 (x1.3); kansas/lentil 0.0524 -> 0.0418 -> 0.0325; pergamino/rye 0.1330 -> 0.1245 -> 0.1199.
  it.fails('higher water-holding capacity never lowers the water score', () => {
    const v = wh('water', (e) => e.sub.water)
    report(v)
    expect(v).toEqual([])
  })
  // VIOLATION: kansas/sunflower water loss 0.4839 (TAW 150 mm) -> 0.4887 (215) -> 0.4899 (279 mm); kansas/wheat 0.6894 -> 0.6927 (then 0.6913). A bigger root-zone tank gives MORE stress.
  // FAO-56 Ks = (TAW - Dr) / ((1 - p) TAW) (src/lib/water.ts:131) falls with TAW for the same absolute storage once the bucket is below RAW; the extra
  // start-of-season storage (0.5 TAW, water.ts:100) does not make up for it in dry climates.
  it.fails('higher water-holding capacity never raises the water loss', () => {
    const v = sweep('loss', [0.7, 1, 1.3], (s, l) => build(s, { soil: paw(s.soil, l) }), (e) => e.loss, -1)
    report(v)
    expect(v).toEqual([])
  })

  /** pH moved from far below/above the crop's optimum towards it: three levels per crop, so this is per crop. */
  it('pH moving toward the crop optimum never lowers the soil, fit or total score', () => {
    const bad: string[] = []
    for (const id of SITES) {
      const s = site(id)
      const at = (ph: number): SoilProfile => ({ ...s.soil, top: { ...s.soil.top, ph }, layers: s.soil.layers.map((l) => ({ ...l, ph })) })
      const PH = [4, 5, 5.8, 6.5, 7.2, 8.5]
      // one field context per pH level, shared by every crop (it holds all crops' risks: building it per crop was quadratic)
      const ctxAt = PH.map((ph) => build(s, { soil: at(ph) }).ctx)
      for (const c of CROPS) {
        // phRating is 1 on the optimum plateau and falls away from it; walk the acid side 4.0 -> 5.0 -> 5.8 -> 6.5 and flag any step where the rating rose but the score fell
        const steps = PH.map((ph) => ({ ph, r: phRating(c.id, ph) }))
        const evals = steps.map((_, i) => evaluate(c, s.history, ctxAt[i], s.w))
        for (let i = 1; i < steps.length; i++) {
          if (steps[i].r <= steps[i - 1].r + EPS) continue // only steps that move towards the optimum
          for (const [k, f] of [['soil', (e: Evaluation) => e.sub.soil], ['fit', (e: Evaluation) => e.sub.fit], ['score', (e: Evaluation) => e.score]] as const) {
            if (f(evals[i]) < f(evals[i - 1]) - EPS) bad.push(`${k} ${id}/${c.id}: pH ${steps[i - 1].ph} (rating ${fmt(steps[i - 1].r)}) ${fmt(f(evals[i - 1]))} -> pH ${steps[i].ph} (rating ${fmt(steps[i].r)}) ${fmt(f(evals[i]))}`)
          }
        }
      }
    }
    report(bad)
    expect(bad).toEqual([])
  })

  const withCrop = (ctx: FieldContext, id: CropId, patch: (c: Crop) => Crop): FieldContext => {
    const r = ctx.risks[id]
    const base = r.crop ?? CROPS.find((c) => c.id === id)!
    return { ...ctx, risks: { ...ctx.risks, [id]: { ...r, crop: patch(base) } } }
  }
  const econSweep = (label: string, levels: number[], patch: (c: Crop, l: number) => Crop, dir: 1 | -1, pick: (e: Evaluation) => number) => {
    const bad: string[] = []
    for (const id of SITES) {
      const s = site(id)
      const { ctx } = build(s)
      for (const c of CROPS) {
        const vals = levels.map((l) => pick(evaluate(c, s.history, withCrop(ctx, c.id, (x) => patch(x, l)), s.w)))
        for (let i = 1; i < vals.length; i++) if (dir * (vals[i] - vals[i - 1]) < -EPS) bad.push(`${label} ${id}/${c.id}: ${fmt(vals[i - 1])} (x${levels[i - 1]}) -> ${fmt(vals[i])} (x${levels[i]})`)
      }
    }
    return bad
  }
  it('higher reference yield never lowers profit (sub-score and margin)', () => {
    const a = econSweep('profit', [0.7, 1, 1.4], (c, l) => ({ ...c, econ: { ...c.econ, yield: c.econ.yield * l } }), 1, (e) => e.sub.profit)
    const b = econSweep('margin', [0.7, 1, 1.4], (c, l) => ({ ...c, econ: { ...c.econ, yield: c.econ.yield * l } }), 1, (e) => e.margin)
    report([...a, ...b])
    expect([...a, ...b]).toEqual([])
  })
  // A higher national yield means a more intensive package (seed and passes follow it) and a bigger harvest. For a crop
  // that pays its way the margin grows with it; for one that loses on its own and shows a margin only thanks to the
  // previous crop's nitrogen credit (a fixed saving) it does not - scaling up a losing crop loses more (quinoa after
  // soybean at Pergamino: 27 -> 25 -> 23 EUR/ha, all of it the credit). The property is checked on the margin
  // the crop earns on its own.
  it('higher observed country yield (yieldRef) never lowers profit', () => {
    const bad: string[] = []
    for (const id of SITES) {
      const s = site(id)
      const { ctx } = build(s)
      const lastId = s.history[s.history.length - 1]
      for (const c of CROPS.filter((x) => x.econ.yield > 0)) {
        const credit = N_PRICE * Math.min(precropCredit(lastId ? CROP_BY_ID[lastId] : null, c), c.nDemand)
        const vals = [0.5, 0.8, 1, 1.3].map((l) => {
          const c2: FieldContext = { ...ctx, yieldRef: { [c.id]: { t: c.econ.yield * 0.8 * l, source: 'country' } } }
          const e = evaluate(c, s.history, c2, s.w)
          return { p: e.sub.profit, m: e.margin, own: e.margin - credit }
        })
        for (let i = 1; i < vals.length; i++) {
          if (vals[i - 1].own > 0 && vals[i].p < vals[i - 1].p - EPS) bad.push(`yieldRef ${id}/${c.id}: profit ${fmt(vals[i - 1].p)} -> ${fmt(vals[i].p)} (margin ${vals[i - 1].m.toFixed(1)} -> ${vals[i].m.toFixed(1)})`)
        }
      }
    }
    report(bad)
    expect(bad).toEqual([])
  })
  it('higher price never lowers profit', () => {
    const bad: string[] = []
    for (const id of SITES) {
      const s = site(id)
      const { ctx } = build(s)
      for (const c of CROPS) {
        const vals = [0.6, 1, 1.5].map((f) => evaluate(c, s.history, { ...ctx, priceFactor: { [c.id]: f } }, s.w).sub.profit)
        for (let i = 1; i < vals.length; i++) if (vals[i] < vals[i - 1] - EPS) bad.push(`price ${id}/${c.id}: ${fmt(vals[i - 1])} -> ${fmt(vals[i])}`)
      }
    }
    report(bad)
    expect(bad).toEqual([])
  })
  it('lower cost never lowers profit', () => {
    const a = econSweep('profit', [1.5, 1, 0.6], (c, l) => ({ ...c, econ: { ...c.econ, cost: c.econ.cost * l } }), 1, (e) => e.sub.profit)
    const b = econSweep('margin', [1.5, 1, 0.6], (c, l) => ({ ...c, econ: { ...c.econ, cost: c.econ.cost * l } }), 1, (e) => e.margin)
    report([...a, ...b])
    expect([...a, ...b]).toEqual([])
  })

  it('harsher drought (less rain) never raises the total score', () => {
    const v = sweep('score', [1, 0.8, 0.6, 0.4], (s, l) => build(s, { rain: l }), (e) => e.score, -1)
    report(v)
    expect(v).toEqual([])
  })
  it('more hot days at flowering (daily Tmax +2/+4/+6 C) never raise the total score', () => {
    const v = sweep('score', [0, 2, 4, 6], (s, l) => build(s, { daily: shiftDaily(s.daily, l, 0) }), (e) => e.score, -1)
    report(v)
    expect(v).toEqual([])
  })
  it('colder frost (daily Tmin -2/-4/-6 C) never raises the total score', () => {
    const v = sweep('score', [0, -2, -4, -6], (s, l) => build(s, { daily: shiftDaily(s.daily, 0, l) }), (e) => e.score, -1)
    report(v)
    expect(v).toEqual([])
  })

  // VIOLATION: kansas/sorghum water 0.0602 (budget 0) -> 0.0275 (50 mm) -> 0.0000 (150 mm); torgau/rye 0.2202 -> 0.1692 (150 mm); pergamino/soybean 0.2893 -> 0.2786 -> 0.2690. 54 cases.
  // A budget is a ceiling, but the greedy simulator spends it whenever the crop is stressed (water.ts:112-118) and the dry-year margin then charges
  // IRRIGATION_COST x the mean mm applied (rotation.ts:450) whether or not the water paid for itself, so a bigger budget can only cost.
  it('more irrigation budget never lowers the water score (rainfed field with a limited budget)', () => {
    const v = sweep('water', [0, 50, 150, 400], (s, l) => build(s, { budget: l }), (e) => e.sub.water, 1)
    report(v)
    expect(v).toEqual([])
  })
  // VIOLATION: cover (green fallow, ky = 0) water 0.7395 (budget 0) -> 0.7334 (50) -> 0.6942 (400) on torgau; 0.4522 -> 0.2165 on kansas; 0.3741 -> 0.0506 on pergamino. Other crops are fine.
  // The irrigated water axis of a crop with no harvest is 1 - deficit / (1.2 maxDeficit) and maxDeficit is the thirstiest OTHER crop's deficit (rotation.ts:126-131),
  // which shrinks as the budget grows, so the fallow's score depends on what the budget does to its competitors.
  it.fails('more irrigation budget never lowers the water score (irrigated field)', () => {
    const v = sweep('water', [0, 50, 150, 400], (s, l) => build(s, { budget: l, irrigated: true }), (e) => e.sub.water, 1)
    report(v)
    expect(v).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Adversarial synthetic sites
// ---------------------------------------------------------------------------------------------------------------------
const loam = () => manualProfile('loam', 6.5)
function synth(o: { lat: number; lon: number; t: number[]; p: number[]; pet: number[]; tRange?: number }, extra: { soil?: SoilProfile; irrigated?: boolean; tmax?: number[]; tmin?: number[] } = {}) {
  const climate = syntheticClimate(o)
  const soil = extra.soil ?? loam()
  let risks = allCropRisks(climate, soil)
  if (extra.tmax) {
    const days: Daily = { start: '1981-01-01', tmax: [], tmin: [], prcp: [] }
    for (let t = Date.UTC(1981, 0, 1); t <= Date.UTC(2025, 11, 31); t += 86_400_000) {
      const m = new Date(t).getUTCMonth()
      days.tmax.push(extra.tmax[m]); days.tmin.push(extra.tmin![m]); days.prcp.push(0)
    }
    risks = withDailyExtremes(risks, days, climate)
  }
  const ctx: FieldContext = {
    risks, soil, stressYear: null, irrigated: extra.irrigated ?? false, drying: climate.signal.drying, slopePct: 0.5,
    recentLabel: `${climate.recent.from}-${climate.recent.to}`, baselineLabel: `${climate.baseline.from}-${climate.baseline.to}`,
  }
  // ranked as the app does by default: no green or bare fallow or forage ley, and none of the opt-in crops (forage,
  // vegetables) the app never switches on by itself; `by` still holds every crop
  const ranked = rankNext([], ctx, W, new Set<CropId>(['clover', 'cover', 'fallow', ...EXTRA_OPT_IN]))
  const by = Object.fromEntries(CROPS.map((c) => [c.id, { e: evaluate(c, [], ctx, W), rank: ranked.findIndex((e) => e.crop.id === c.id) + 1 }])) as Record<CropId, { e: Evaluation; rank: number }>
  return { climate, soil, risks, ctx, ranked, by }
}
const summary = (r: ReturnType<typeof synth>, ids: CropId[]) =>
  ids.map((id) => `${id}#${r.by[id].rank}/${r.ranked.length} score ${r.by[id].e.score.toFixed(1)} water ${r.by[id].e.sub.water.toFixed(2)} loss ${r.by[id].e.loss.toFixed(2)} share ${r.by[id].e.yieldShare.toFixed(2)}`).join('; ')

describe('adversarial synthetic sites', () => {
  const desert = () => synth({
    lat: 30.25, lon: 31.25, t: [14, 15, 18, 22, 26, 29, 30, 30, 28, 25, 20, 16], p: [14, 12, 10, 6, 2, 0, 0, 0, 1, 6, 12, 16],
    pet: [60, 80, 125, 170, 215, 240, 250, 230, 185, 135, 85, 60],
  })
  for (const id of ['maize'] as CropId[]) {
    it(`desert (79 mm/yr): rainfed ${id} is in the bottom half`, () => {
      const r = desert()
      log('desert:', summary(r, ['rice', 'maize', 'soybean']), '| top:', r.ranked.slice(0, 5).map((e) => `${e.crop.id} ${e.score.toFixed(1)} margin ${e.margin.toFixed(0)}`).join(','))
      // among the crops warm enough and not too hot to grow there at all (GAEZ heat units, both limits): crops ruled out by temperature rank below everything and say nothing about water
      const growable = r.ranked.filter((e) => r.risks[e.crop.id].thermal.recent >= 0.5)
      expect(growable.findIndex((e) => e.crop.id === id) + 1, `${id} rank among ${growable.length} growable`).toBeGreaterThan(growable.length / 2)
    })
  }
  // VIOLATION: desert (79 mm/yr, PET 1700 mm), 28 eligible crops, every crop loses money (margin -35..-2070 EUR/ha), profit and water sub-scores are 0 for all,
  // yet rice ranks 9th (score 31.4, loss 0.85, margin -352) and soybean 2nd (score 32.4, loss 0.84, margin -90). Scores are compressed into 27-33 and the order is
  // set by the soil axis (nitrogen fixers first). There is no viability gate on yield or margin: rotation.ts:497-501 (gate = rotation x local proof only).
  // Ranked among the 30 crops the violation was recorded on: with the all-crops plan's field crops bambara,
  // fonio, safflower and castor lead the desert and push soybean to #21 of 40 - past half by dilution, the cause unchanged.
  it.fails('desert (79 mm/yr): rainfed rice and soybean are in the bottom half', () => {
    const r = desert()
    const older = r.ranked.filter((e) => !(EXTRA_IDS as readonly string[]).includes(e.crop.id)).map((e) => e.crop.id)
    for (const id of ['rice', 'soybean'] as CropId[]) expect(older.indexOf(id) + 1, `${id} rank`).toBeGreaterThan(older.length / 2)
  })
  // Was a VIOLATION (groundnut -290, soybean -90, lupin -170 EUR/ha on top). Every crop loses money here, so no order of
  // them is a recommendation: the engine reports it (nothingPays) and the page's decision card says so.
  it('desert (79 mm/yr): the engine reports that no crop pays, and a temperate field is not flagged', () => {
    const r = desert()
    expect(nothingPays(r.ranked)).not.toBeNull()
    expect(nothingPays(r.ranked)!).toBeLessThan(0)
    const t = site('torgau')
    expect(nothingPays(rankNext(t.history, build(t, {}).ctx, t.w))).toBeNull()
  })

  const tropWet = () => synth({
    lat: 5.25, lon: 10.25, tRange: 9, t: [26, 27, 27, 26, 26, 25, 24, 24, 25, 25, 26, 26], p: [60, 90, 200, 280, 320, 330, 360, 380, 360, 300, 150, 70],
    pet: [120, 120, 130, 120, 115, 105, 100, 100, 105, 110, 110, 115],
  })
  // The water axis is drought risk: with no dry seasons it is near its maximum for every crop, as it should
  // be. That high rain does not make every crop optimal has to show in the harvest (foliar disease in wet seasons) and
  // the total; waterlogging itself is NOT modelled (no drainage layer) - a known gap, docs/audit/LINEAGE.md.
  it('tropical wet (3000 mm): high rain does not make every crop optimal - wet-season disease cuts harvests, totals spread', () => {
    const r = tropWet()
    const ws = r.ranked.filter((e) => e.crop.ky > 0).map((e) => e.sub.water)
    log('tropical wet: water sub-scores min/max', Math.min(...ws).toFixed(3), Math.max(...ws).toFixed(3), '| rice:', summary(r, ['rice']))
    const cut = r.ranked.filter((e) => r.risks[e.crop.id].wet.recent > 0.5)
    expect(cut.length).toBeGreaterThan(0)
    for (const e of cut) expect(e.yieldShare, e.crop.id).toBeLessThan(0.9)
    const scores = r.ranked.map((e) => e.score)
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(10) // a floor for "not all equal" (19 points)
  })
  it('tropical wet (3000 mm): rice does not lose on water (at least the median of the water-using crops)', () => {
    const r = tropWet()
    const ws = r.ranked.filter((e) => e.crop.ky > 0).map((e) => e.sub.water).sort((a, b) => a - b)
    const median = ws[Math.floor(ws.length / 2)]
    expect(r.by.rice.e.sub.water).toBeGreaterThanOrEqual(median - EPS)
  })

  const arctic = () => synth({
    lat: 66.25, lon: 25.25, tRange: 10, t: [-22, -20, -14, -6, 2, 8, 10, 8, 3, -5, -14, -20], p: [35, 30, 30, 30, 35, 55, 70, 70, 55, 55, 45, 40],
    pet: [0, 2, 8, 20, 50, 85, 95, 65, 25, 8, 1, 0],
  })
  it('arctic short season (July 10 C): cassava, cotton, rice, sorghum, groundnut are non-viable', () => {
    const r = arctic()
    const ids: CropId[] = ['cassava', 'cotton', 'rice', 'sorghum', 'groundnut']
    log('arctic:', summary(r, ids), '| thermal:', ids.map((id) => `${id} ${r.risks[id].thermal.recent.toFixed(2)}`).join(', '), '| top:', r.ranked.slice(0, 5).map((e) => `${e.crop.id} ${e.score.toFixed(1)}`).join(','))
    for (const id of ids) {
      expect(r.by[id].e.yieldShare, `${id} yield share`).toBeLessThan(0.15)
      expect(r.by[id].e.margin, `${id} margin`).toBeLessThan(0)
    }
  })

  // Fixed (lupin, faba, lentil take GAEZ dry pea's heat need, gaez.ts). Was a VIOLATION: arctic (66.25 N, July 10 C, Jan -22 C): lentil, faba bean and blue lupin rank 1-3 (scores 60.8 / 58.9 / 53.8) with thermal fit 1.00, yield share 1.00 and
  // margins of +785 / +648 / +480 EUR/ha - full yield where the season barely exceeds 5 C. Crops with gddNeed 0 and no FAO calendar (lupin crops.ts:227-229,
  // faba :283-285, lentil :291-293) are "never limiting": thermalFit returns 1 (src/lib/water.ts:185).
  it('arctic short season: the top three picks are not full-yield crops (yield share < 0.5)', () => {
    const r = arctic()
    for (const e of r.ranked.slice(0, 3)) expect(e.yieldShare, e.crop.id).toBeLessThan(0.5)
  })

  const cold = () => synth({
    lat: 52.25, lon: 65.25, t: [-15, -13, -6, 4, 12, 17, 20, 18, 12, 4, -4, -11], p: [30, 25, 28, 30, 40, 50, 55, 45, 35, 38, 36, 32],
    pet: [2, 4, 18, 62, 112, 138, 150, 125, 80, 38, 12, 4],
  })
  it('continental cold (Jan -15, Jul 20): wheat and barley are grown as spring forms, are viable, and winter frost does not kill them', () => {
    const r = cold()
    log('continental:', summary(r, ['wheat', 'barley', 'oats']), '| forms:', ['wheat', 'barley'].map((id) => `${id}=${r.risks[id as CropId].crop?.form}`).join(','), '| cold kill:', ['wheat', 'barley'].map((id) => r.risks[id as CropId].cold.recent.toFixed(2)).join(','), '| top:', r.ranked.slice(0, 6).map((e) => `${e.crop.id} ${e.score.toFixed(1)}`).join(','))
    for (const id of ['wheat', 'barley'] as CropId[]) {
      expect(r.risks[id].crop?.form, `${id} form`).toBe('spring')
      expect(r.risks[id].cold.recent, `${id} winter kill`).toBe(0)
      expect(r.by[id].e.yieldShare, `${id} yield share`).toBeGreaterThan(0.4)
      expect(r.by[id].e.margin, `${id} margin`).toBeGreaterThan(0)
      expect(r.by[id].e.sub.rotation, `${id} rotation`).toBeGreaterThan(0.8)
    }
  })

  // identical monthly climate (T 28 C, range 13 C); only the daily Tmax/Tmin differ, so heat and frost are the only things that change
  const heatSite = (tmax: number, tmin: number) => {
    const flat = (v: number) => Array<number>(12).fill(v)
    return synth(
      { lat: 12.25, lon: 8.25, tRange: 13, t: flat(28), p: [0, 0, 5, 15, 60, 130, 220, 260, 150, 25, 0, 0], pet: [190, 190, 190, 190, 190, 140, 140, 140, 140, 190, 190, 190] },
      { tmax: flat(tmax), tmin: flat(tmin) },
    )
  }
  it('tropical heat (Tmax 41 C all year): heat-sensitive crops are hit and score below the same site at Tmax 26 C', () => {
    const hot = heatSite(41, 25)
    const mild = heatSite(26, 20)
    // a crop the 28 C season mean already rules out (GAEZ's upper heat units - wheat, barley) has no yield left to lose
    const sensitive = (Object.keys(T_CRIT) as CropId[]).filter((id) => T_CRIT[id]! <= 36 && hot.risks[id].heatDaily && mild.by[id].e.yieldShare > 0)
    const lines = sensitive.map((id) => `${id} heat ${mild.risks[id].heat.recent.toFixed(2)}->${hot.risks[id].heat.recent.toFixed(2)} share ${mild.by[id].e.yieldShare.toFixed(2)}->${hot.by[id].e.yieldShare.toFixed(2)} score ${mild.by[id].e.score.toFixed(1)}->${hot.by[id].e.score.toFixed(1)}`)
    log('tropical heat:\n' + lines.join('\n'))
    expect(sensitive.length).toBeGreaterThan(5)
    for (const id of sensitive) {
      expect(hot.risks[id].heat.recent, `${id} heat share`).toBeGreaterThan(mild.risks[id].heat.recent)
      expect(hot.by[id].e.yieldShare, `${id} yield share`).toBeLessThan(mild.by[id].e.yieldShare)
    }
  })

  it('irrigated desert: some crops are viable, and the irrigation shows up in the margin at IRRIGATION_COST per mm', () => {
    const r = synth({
      lat: 30.25, lon: 31.25, t: [14, 15, 18, 22, 26, 29, 30, 30, 28, 25, 20, 16], p: [14, 12, 10, 6, 2, 0, 0, 0, 1, 6, 12, 16],
      pet: [60, 80, 125, 170, 215, 240, 250, 230, 185, 135, 85, 60],
    }, { irrigated: true })
    const viable = r.ranked.filter((e) => e.margin > 0)
    log('irrigated desert: viable', viable.length, 'of', r.ranked.length, '| top:', r.ranked.slice(0, 5).map((e) => `${e.crop.id} score ${e.score.toFixed(1)} margin ${e.margin.toFixed(0)} deficit ${e.deficit.toFixed(0)}`).join('; '))
    expect(viable.length).toBeGreaterThanOrEqual(3)
    for (const id of ['wheat', 'maize', 'cotton', 'sorghum'] as CropId[]) {
      const e = r.by[id].e
      expect(e.deficit, `${id} deficit`).toBeGreaterThan(100)
      // free-water counterfactual: same field with the irrigation demand removed
      const free: FieldContext = { ...r.ctx, risks: { ...r.ctx.risks, [id]: { ...r.ctx.risks[id], recent: { ...r.ctx.risks[id].recent, deficit: 0 } } } }
      const e0 = evaluate(CROPS.find((c) => c.id === id)!, [], free, W)
      expect(e0.margin - e.margin, `${id} irrigation cost in margin`).toBeCloseTo(IRRIGATION_COST * e.deficit, 6)
      expect(e0.sub.profit, `${id} profit sub`).toBeGreaterThanOrEqual(e.sub.profit)
    }
  })

  it('poor soil (soil C 1 g/kg, pH 4.5): crops that GAEZ rates pH-sensitive drop, and no crop gains', () => {
    const base = loam()
    const poor: SoilProfile = { ...base, top: { ...base.top, ph: 4.5, soc: 1 }, layers: base.layers.map((l) => ({ ...l, ph: 4.5, soc: 1 })) }
    const climate = { lat: 51.25, lon: 13.25, t: [0, 1, 5, 9, 14, 17, 19, 18, 14, 9, 4, 1], p: [45, 35, 40, 38, 55, 68, 70, 62, 45, 38, 45, 48], pet: [5, 12, 35, 65, 100, 120, 125, 105, 65, 32, 10, 5] }
    const good = synth(climate, { soil: base })
    const bad = synth(climate, { soil: poor })
    const sensitive = CROPS.filter((c) => phRating(c.id, 4.5) < 0.8)
    const lines = sensitive.map((c) => `${c.id} phRating ${phRating(c.id, 4.5).toFixed(2)} score ${good.by[c.id].e.score.toFixed(1)}->${bad.by[c.id].e.score.toFixed(1)} fit ${good.by[c.id].e.sub.fit.toFixed(2)}->${bad.by[c.id].e.sub.fit.toFixed(2)}`)
    const gainers = CROPS.filter((c) => bad.by[c.id].e.score > good.by[c.id].e.score + EPS).map((c) => `${c.id} ${good.by[c.id].e.score.toFixed(1)}->${bad.by[c.id].e.score.toFixed(1)}`)
    log('poor soil sensitive:\n' + lines.join('\n'), '\ngainers:', gainers.join(', ') || 'none')
    expect(sensitive.length).toBeGreaterThan(0)
    for (const c of sensitive) expect(bad.by[c.id].e.score, c.id).toBeLessThan(good.by[c.id].e.score)
    expect(gainers).toEqual([])
  })

  it('poor soil: low soil carbon alone never raises a crop\'s soil sub-score', () => {
    const base = loam()
    const poor: SoilProfile = { ...base, top: { ...base.top, soc: 1 }, layers: base.layers.map((l) => ({ ...l, soc: 1 })) }
    const climate = { lat: 51.25, lon: 13.25, t: [0, 1, 5, 9, 14, 17, 19, 18, 14, 9, 4, 1], p: [45, 35, 40, 38, 55, 68, 70, 62, 45, 38, 45, 48], pet: [5, 12, 35, 65, 100, 120, 125, 105, 65, 32, 10, 5] }
    const good = synth(climate, { soil: base })
    const bad = synth(climate, { soil: poor })
    const rose = CROPS.filter((c) => bad.by[c.id].e.sub.soil > good.by[c.id].e.sub.soil + EPS)
    log('soc 1 g/kg: soil sub-score changed for', CROPS.filter((c) => Math.abs(bad.by[c.id].e.sub.soil - good.by[c.id].e.sub.soil) > EPS).length, 'of', CROPS.length, 'crops; e.g. wheat', good.by.wheat.e.sub.soil.toFixed(3), '->', bad.by.wheat.e.sub.soil.toFixed(3))
    expect(rose.map((c) => c.id)).toEqual([])
  })
})

describe('irrigation share (FAO GMIA) while the farmer has not chosen', () => {
  // The page used to set `irrigated = share >= MOSTLY_IRRIGATED`: a step of up to 37 points per crop between 0.49 and 0.50.
  // Now the context carries the share (irrigationPrior) and every crop is the expectation over irrigated and rainfed.
  const at = (s: ReturnType<typeof site>, share: number) => rankNext(s.history, { ...build(s, {}).ctx, irrigationPrior: share }, s.w)
  it('a 0.01 change in irrigated share moves no crop\'s score by more than 1 point, at the old threshold and anywhere else', () => {
    for (const id of SITES) {
      const s = site(id)
      for (const share of [0.05, MOSTLY_IRRIGATED - 0.01, 0.9]) {
        const a = at(s, share)
        const b = at(s, share + 0.01)
        for (const e of b) expect(Math.abs(e.score - a.find((x) => x.crop.id === e.crop.id)!.score), `${id} ${e.crop.id} at ${share}`).toBeLessThanOrEqual(1)
      }
    }
  })
  it('share 0 and 1 are exactly the rainfed and the irrigated field', () => {
    const s = site('kansas')
    const dry = rankNext(s.history, build(s, { irrigated: false }).ctx, s.w)
    const wet = rankNext(s.history, build(s, { irrigated: true }).ctx, s.w)
    for (const e of at(s, 0)) expect(e.score).toBeCloseTo(dry.find((x) => x.crop.id === e.crop.id)!.score, 9)
    for (const e of at(s, 1)) expect(e.score).toBeCloseTo(wet.find((x) => x.crop.id === e.crop.id)!.score, 9)
  })
})
