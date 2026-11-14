// Crop water model: a FAO-56 style root-zone bucket driven by NASA POWER rain and Hargreaves ET,
// sized by SoilGrids plant-available water, turned into yield loss with the FAO-33 Ky factor.
// Run for every season since 1981, it shows how the climate shift re-ranks crops on one field.

import { monthKey, type ClimateAnalysis, type MonthRec } from './climate'
import { calendarShift, CROPS, cropSeason, flowerMonth, rainSet, rainsRuns, sowingSpan, kcFor, MILD_WINTER_T, mildWinterOf, silageOf, springOf, summerRainsShare, warmthDelay, warmthWait, type Crop, type CropId, type SeasonMonthKc } from './crops'
import { bestCultivar, CYCLE_WAIT, heatNeeds, warmestSeason } from './gaez'
import { grainFill } from './scenario'
import { rootZoneWater, type SoilProfile } from './soil'
import { clamp, mean } from './stats'

export type CropYearWater = {
  year: number // harvest year
  etc: number // crop water demand, mm
  eta: number // water actually used, mm
  deficit: number // unmet demand ≈ irrigation needed to avoid stress, mm
  stress: number // 1 − ETa/ETc
  loss: number // relative yield loss from water stress, 0..1
  irrigation: number // water applied from the season's budget, mm (0 when rainfed)
  /** after a bare fallow: the soil water the fallow year gained, and the rain that fell in it, mm */
  fallow?: { gain: number; rain: number }
}

/** Means over a window of seasons; `bad` = mean loss of its driest 30 % - the drought-year tail. */
export type WaterFigures = { loss: number; deficit: number; stress: number; bad: number; irrigation: number; eta: number }

export type CropRisk = {
  id: CropId
  /** the crop as this field grows it - the spring form of a winter crop where winters kill the winter form (formOf) */
  crop?: Crop
  taw: number // total available water in the root zone, mm
  byYear: CropYearWater[]
  baseline: WaterFigures
  recent: WaterFigures
  /** heat at flowering: the mean loss share of a season, 0..1 (a full hit costs DEFAULT_TUNING.heat of the yield);
   *  `seasons`: the share of seasons over the crop's heat limit, as the page reports it */
  heat: { baseline: number; recent: number; seasons?: { baseline: number; recent: number } }
  /** when NASA POWER daily data is in: days at or above the critical temperature in the flowering month */
  heatDaily?: { days: { baseline: number; recent: number }; tCrit: number; month: number }
  /** frost-tender spring crops: share of seasons with a killing frost in the month after emergence (daily data) */
  frost?: { baseline: number; recent: number }
  /** what-if only: the share of today's grain a shorter grain fill leaves (scenario.ts grainFill); 1 for the observed climate */
  grainFill: number
  /** 0..1 - is the season warm enough to mature, and not too warm (GAEZ heat units, both limits)? `hot`: the share of
   *  recent seasons held back by too much warmth (or too mild a winter to vernalise) rather than too little */
  thermal: { baseline: number; recent: number; hot?: number }
  /** late-summer sowings only: share of seasons sown into dry soil (rain < half of reference ET) */
  establish: { month: number; baseline: number; recent: number } | null
  /** the water figures of a season that follows a bare fallow (absent for crops that hold the field all year) */
  afterFallow?: { byYear: CropYearWater[]; baseline: WaterFigures; recent: WaterFigures; stored: number }
  /** near a line (formsOf): the other variants - their risk (itself with an alt where more than one) and their weight;
   *  the score mixes the two (weighed) */
  alt?: { risk: CropRisk; w: number; kind: MixKind; sides?: Sides }
  /** winter crops: the mean kill share of a winter, 0..1 (a ramp around the hardiness, winterKill); `seasons`: the share of
   *  winters whose coldest month averaged a night colder than the crop's hardiness, as the page reports it */
  cold: { baseline: number; recent: number; seasons?: { baseline: number; recent: number } }
  /** share of seasons with more in-season rain than the crop's foliar-disease limit */
  /** foliar-disease weather: the mean hit of a season (a ramp ±10 % around the crop's rain limit, wetSeason); `seasons`:
   *  the share of seasons over the limit, as the page reports it */
  wet: { baseline: number; recent: number; seasons?: { baseline: number; recent: number } }
  /** share of seasons whose harvest / sowing month is wet (rain ≥ reference ET: soil at field capacity, low bearing capacity) */
  workability?: { harvest: { baseline: number; recent: number }; sowing: { baseline: number; recent: number } }
}

/** A figure of a crop's risk as the score weighs it: near a line every variant (formsOf), mixed by its weight. */
export const weighed = (r: CropRisk, g: (x: CropRisk) => number): number => (r.alt ? (1 - r.alt.w) * g(r) + r.alt.w * weighed(r.alt.risk, g) : g(r))

/** A crop's water figures for the season it is scored in: after a bare fallow it starts on the rain the fallow stored,
 *  and near a line they mix every variant as the score does (formsOf). Every reader of a scored season's water
 *  goes through here, so the score, the plan and the explanations agree. */
export function riskAfter(risk: CropRisk, afterFallow: boolean): CropRisk {
  const own = afterFallow && risk.afterFallow ? { ...risk, byYear: risk.afterFallow.byYear, baseline: risk.afterFallow.baseline, recent: risk.afterFallow.recent } : risk
  if (!risk.alt) return own
  const other = riskAfter(risk.alt.risk, afterFallow)
  const w = risk.alt.w
  const mix = <T extends object>(a: T, b: T, keep: string[] = []): T =>
    Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === 'number' && !keep.includes(k) ? (1 - w) * v + w * ((b as Record<string, number>)[k] ?? v) : v])) as T
  const byYear = own.byYear.map((y) => {
    const o = other.byYear.find((x) => x.year === y.year)
    return o ? mix(y, o, ['year']) : y
  })
  return { ...own, byYear, recent: mix(own.recent, other.recent), baseline: mix(own.baseline, other.baseline) }
}

const SUBSTEPS = 3
const RAIN_LOSS = 0.1 // interception + runoff
const PRE_SEASON_MONTHS = 6
const PRE_SEASON_KC = 0.6 // previous crop / stubble before sowing

type Step = { rec: MonthRec; kc: number; inSeason: boolean; bare?: boolean }

/** Months a bare fallow holds the field before the next sowing: the year a cropped season would have taken. */
export const FALLOW_MONTHS = 12
/**
 * Evaporation from bare soil, FAO-56 ch. 7 (eq. 71-77): the surface layer (Ze = 0.10 m) holds TEW = 1000 (θFC − ½ θWP)
 * Ze of evaporable water (eq. 73); the first REW of it evaporates at the full rate Ke ≈ 1.0 × ET₀, the rest ever more
 * slowly (eq. 74), and the water below it does not evaporate - so the rain that soaks deeper is kept. REW 8 mm: FAO-56
 * Table 19, sandy loam to clay. A month is three steps of its mean rain and ET₀: a summer storm is spread over the
 * month and soaks below the surface layer less often than it does - the model stores less than fallow trials measure
 * (15 % of the fallow year's rain at Garden City, Kansas, against 27 % by wheat sowing in 1979-82, Gwin et al. 1984).
 * NASA POWER's daily rain does not mend it:
 * a ≈ 50 km cell mean, it brings 1 mm or more on 74 days a year there, 6.6 mm each - smaller wettings than the three steps.
 */
export type BareSoil = { tew: number; rew: number }
export const bareSoil = (soil: SoilProfile): BareSoil => {
  const top = soil.layers[0]
  const tew = top ? Math.max(8, 1000 * (top.fc - 0.5 * top.wp) * 0.1) : 20
  return { tew, rew: Math.min(8, 0.6 * tew) }
}

function seasonSteps(climate: ClimateAnalysis, season: SeasonMonthKc[], harvestYear: number, fallow = false): Step[] | null {
  const first = season[0]
  const steps: Step[] = []
  // Walk back from sowing to warm up the soil-water bucket; after a bare fallow, through the fallow year first.
  const bare = fallow ? FALLOW_MONTHS : 0
  for (let k = PRE_SEASON_MONTHS + bare; k >= 1; k--) {
    const idx = first.month - 1 - k
    const year = harvestYear + first.yearOffset + Math.floor(idx / 12)
    const month = ((idx % 12) + 12) % 12 + 1
    const rec = climate.byMonth.get(monthKey(year, month))
    if (!rec) return null
    steps.push({ rec, kc: PRE_SEASON_KC, inSeason: false, bare: k <= bare })
  }
  for (const s of season) {
    const rec = climate.byMonth.get(monthKey(harvestYear + s.yearOffset, s.month))
    if (!rec) return null
    steps.push({ rec, kc: s.kc, inSeason: true })
  }
  return steps
}

/**
 * One season of the root-zone bucket. `budget` is the irrigation water available for the season (mm, net at the
 * roots): whenever the crop would start to stress (depletion past the FAO-56 readily available water) the bucket is
 * refilled to field capacity until the budget runs out. The rule is greedy and only ever adds water, so more budget
 * never means more stress - the model is monotonic by construction (checked in the tests).
 */
/** A bunded rice paddy: standing water the bunds hold (mm) and how fast it seeps below the roots (mm/day). */
export type Paddy = { pond: number; perc: number }
/** Bund-held standing water, mm (FAO-56 ch. 7: paddies are kept at 50-100 mm). */
export const PADDY_POND = 100
/** Deep percolation from a puddled paddy, mm/day: ~2 on clay to ~8 on sand (FAO-56 ch. 7 gives 1-10). */
export const percolation = (soil: SoilProfile) => clamp(1 + 0.09 * soil.top.sand, 1.5, 8)
/** Lowland rice is grown in a bunded paddy. Every simulator of a season (the score, the Monte Carlo, the backtest)
 *  takes it from here, so none of them treats rice as a field crop the score does not. */
export const paddyFor = (crop: Crop, soil: SoilProfile): Paddy | undefined =>
  crop.group === 'rice' ? { pond: PADDY_POND, perc: percolation(soil) } : undefined

/**
 * One season of the root-zone bucket. `budget` is the irrigation water available for the season (mm, net at the
 * roots): whenever the crop would start to stress (depletion past the FAO-56 readily available water) the bucket is
 * refilled to field capacity until the budget runs out. The rule is greedy and only ever adds water, so more budget
 * never means more stress - the model is monotonic by construction (checked in the tests).
 * A `paddy` keeps rain above field capacity as standing water while the crop is in the field, losing it to
 * percolation; it starts flooded, and its deficit also counts the seepage an irrigator replaces to keep it flooded.
 */
export function simulateSeason(crop: Crop, climate: ClimateAnalysis, taw: number, harvestYear: number, budget = 0, transpiration = 1, paddy?: Paddy, fallow?: BareSoil): CropYearWater | null {
  // A sowing between two whole months (a warm-season wait for warmth, the day the rains start, a cool-season sowing
  // near its seed-bed minimum: crops.ts sowingSpan) runs the season on both calendars and weighs the results, so a
  // weight near 0 or 1 gives that calendar's own result. Earlier, the two calendars' crop coefficients were
  // blended into one season that started with the earlier month: a sliver of weight on it added a month in which the
  // field neither grew a crop nor evaporated like bare soil (Saskatchewan lentils, water loss 0.58 -> 0.50 for a 2 %
  // weight).
  const hemi = climate.season.hemisphere
  const normals = climate.monthly.recent
  const run = (season: SeasonMonthKc[]) => {
    const steps = seasonSteps(climate, season, harvestYear, !!fallow)
    return steps ? bucket(crop, steps, taw, harvestYear, budget, transpiration, paddy, fallow) : null
  }
  const span = sowingSpan(crop, hemi, normals)
  if (!span) return run(cropSeason(crop, hemi, normals))
  const [a, b] = [span.f < 1 ? run(cropSeason(crop, hemi, normals, span.lo)) : null, span.f > 0 ? run(cropSeason(crop, hemi, normals, span.hi)) : null]
  return a && b ? mixYears(a, b, span.f) : (a ?? b)
}

/** Two seasons' water, the second weighted f. */
function mixYears(a: CropYearWater, b: CropYearWater, f: number): CropYearWater {
  const m = (x: number, y: number) => (1 - f) * x + f * y
  const fallow = a.fallow && b.fallow ? { gain: m(a.fallow.gain, b.fallow.gain), rain: m(a.fallow.rain, b.fallow.rain) } : (a.fallow ?? b.fallow)
  return { year: a.year, etc: m(a.etc, b.etc), eta: m(a.eta, b.eta), deficit: m(a.deficit, b.deficit), stress: m(a.stress, b.stress), loss: m(a.loss, b.loss), irrigation: m(a.irrigation, b.irrigation), fallow }
}

function bucket(crop: Crop, steps: Step[], taw: number, harvestYear: number, budget: number, transpiration: number, paddy?: Paddy, fallow?: BareSoil): CropYearWater {
  let storage = 0.5 * taw
  let dried = fallow?.tew ?? 0 // depletion of the bare surface layer: dry when the fallow starts, after a harvest
  let atFallowStart = NaN
  let fallowRain = 0
  let fallowSeen: { gain: number; rain: number } | undefined
  let etc = 0
  let eta = 0
  let flood = 0 // seepage while the paddy stood dry: water to keep it flooded
  let transplanted = false
  let left = crop.ky > 0 ? Math.max(0, budget) : 0 // nobody irrigates a crop without a harvest
  for (const { rec, kc, inSeason, bare } of steps) {
    const days = new Date(Date.UTC(rec.year, rec.month, 0)).getUTCDate()
    const rain = (rec.p * (1 - RAIN_LOSS)) / SUBSTEPS
    if (bare && fallow) {
      if (Number.isNaN(atFallowStart)) atFallowStart = storage
      fallowRain += rec.p
      for (let s = 0; s < SUBSTEPS; s++) {
        storage = Math.min(taw, storage + rain)
        dried = Math.max(0, dried - rain)
        const kr = dried <= fallow.rew ? 1 : Math.max(0, (fallow.tew - dried) / (fallow.tew - fallow.rew))
        const e = Math.min(kr * (rec.pet / SUBSTEPS), fallow.tew - dried, storage)
        storage -= e
        dried += e
      }
      continue
    }
    if (fallow && !Number.isNaN(atFallowStart) && !fallowSeen) {
      fallowSeen = { gain: storage - atFallowStart, rain: fallowRain }
    }
    const demand = (kc * transpiration * rec.pet) / SUBSTEPS
    // FAO-56: plants hit stress sooner when daily demand is high.
    const pAdj = clamp(crop.p + 0.04 * (5 - (kc * rec.pet) / days), 0.1, 0.8)
    const ponded = inSeason && paddy
    for (let s = 0; s < SUBSTEPS; s++) {
      storage = Math.min(taw + (ponded ? paddy.pond : 0), storage + rain) // excess drains below the roots, or over the bunds
      // rice is transplanted into a puddled, flooded field - rainfed farmers wait for the rains to flood it (the
      // calendar starts it in the first month with rain ≥ PET), so the land-preparation water is not counted as a need
      if (ponded && !transplanted) storage = taw + paddy.pond
      if (ponded) transplanted = true
      if (ponded) {
        const seep = (paddy.perc * days) / SUBSTEPS
        if (storage > taw) storage = Math.max(taw, storage - seep)
        else flood += seep
      }
      const raw = pAdj * taw
      if (inSeason && left > 0 && taw - storage > raw) {
        const give = Math.min(taw - storage, left)
        storage += give
        left -= give
      }
      const depletion = Math.max(0, taw - storage)
      const ks = depletion <= raw ? 1 : Math.max(0, (taw - depletion) / ((1 - pAdj) * taw))
      const used = Math.min(ks * demand, storage)
      storage -= used
      if (inSeason) {
        etc += demand
        eta += used
      }
    }
  }
  // a bare fallow has no crop to stress or water: its Kc is the bare soil's evaporation, which simply stops as it dries
  const bare = crop.id === 'fallow'
  const stress = etc > 0 && !bare ? clamp(1 - eta / etc) : 0
  return { year: harvestYear, etc, eta, deficit: bare ? 0 : Math.max(0, etc - eta) + flood, stress, loss: clamp(crop.ky * stress), irrigation: (crop.ky > 0 ? Math.max(0, budget) : 0) - left, fallow: fallowSeen }
}

/**
 * Precipitation storage efficiency of a bare fallow before this crop: the soil water the fallow year gained over the
 * rain that fell in it, mean of the recent seasons - the figure dryland trials report (26-27 % by wheat sowing after
 * 11 months of fallow at Garden City and Tribune, Kansas, 1979-82: Gwin, Norwood & Lamm 1984).
 */
export function fallowEfficiency(crop: Crop, climate: ClimateAnalysis, soil: SoilProfile): number {
  const taw = rootZoneWater(soil, crop.rootDepth)
  const bare = bareSoil(soil)
  const xs: number[] = []
  for (let y = climate.recent.from; y <= climate.recent.to; y++) {
    const f = simulateSeason(crop, climate, taw, y, 0, 1, undefined, bare)?.fallow
    if (f && f.rain > 0) xs.push(f.gain / f.rain)
  }
  return xs.length ? mean(xs) : NaN
}

/**
 * Heat at the sensitive stage from monthly means, where no daily record is in: how far the month's mean daily maximum
 * runs past the crop's limit - a full hit 1 °C above it, none 1 °C below (a ramp, so a warmer scenario raises the
 * loss smoothly; `over` says whether the mean itself is past the limit). NASA POWER daily replaces it (extremes.ts).
 */
function heatExceeded(crop: Crop, climate: ClimateAnalysis, harvestYear: number): { hit: number; over: boolean } | null {
  if (!crop.heat) return { hit: 0, over: false }
  const hemi = climate.season.hemisphere
  const month = flowerMonth(crop, hemi, climate.monthly.recent)!
  const entry = cropSeason(crop, hemi, climate.monthly.recent).find((m) => m.month === month)
  const rec = climate.byMonth.get(monthKey(harvestYear + (entry?.yearOffset ?? 0), month))
  if (!rec) return null
  const tMax = rec.t + rec.tRange / 2
  return { hit: clamp((tMax - crop.heat.tMax + 1) / 2), over: tMax > crop.heat.tMax }
}

/** Mean daily temperature over the months the crop stands in the field (Kc > 0) in one season, °C. */
function seasonMeanT(crop: Crop, climate: ClimateAnalysis, season: SeasonMonthKc[], harvestYear: number): number | null {
  const kc = kcFor(crop, climate.season.hemisphere, climate.monthly.recent)
  let sum = 0
  let days = 0
  for (const s of season) {
    if (kc[s.month - 1] <= 0) continue
    const r = climate.byMonth.get(monthKey(harvestYear + s.yearOffset, s.month))
    if (!r) return null
    const d = new Date(Date.UTC(r.year, r.month, 0)).getUTCDate()
    sum += r.t * d
    days += d
  }
  return days ? sum / days : null
}

/**
 * Wheat's vernalisation stops at 15.7 °C (Porter & Gawith 1999, Eur. J. Agron. 10:23-36: cardinal temperatures -1.3 /
 * 4.9 / 15.7 °C). A winter form with no spring form to fall back on (rye, triticale) heads only after enough cold: full
 * where the season's coldest month averages MILD_WINTER_T or less, none from 15.7 °C, linear between - a coarse stand-in
 * for the cold days a winter collects. Earlier, nothing checked it, and winter rye kept full warmth on the
 * equator.
 */
export const VERNALISATION_MAX = 15.7
function vernalised(crop: Crop, climate: ClimateAnalysis, season: SeasonMonthKc[], harvestYear: number): number | null {
  let coldest = Infinity
  for (const s of season) {
    const r = climate.byMonth.get(monthKey(harvestYear + s.yearOffset, s.month))
    if (!r) return null
    coldest = Math.min(coldest, r.t)
  }
  return clamp((VERNALISATION_MAX - coldest) / (VERNALISATION_MAX - MILD_WINTER_T))
}

/**
 * Is the season warm enough to ripen? Where FAO GAEZ v4 rates the crop: from this season's sowing date, the heat units
 * (Σ daily mean temperature on days above the cultivar's minimum) each GAEZ cultivar of the crop would collect, against
 * its requirement - 0 at the lower limit, 1 from the lower optimum; the best cultivar counts. Elsewhere a rule-of-thumb
 * degree-day need (base 10 °C) from monthly means. The autumn-sown form of a mild winter (mildWinterOf) is not limited,
 * like the winter form: its season is built on its own degree-day need, which a winter whose every month averages
 * 10 °C or more reaches within 210 days. GAEZ's cultivars are fixed 90-150-day cycles of summer-grown spring types;
 * held against them, the 180-day May-November wheat season of south-western Australia came out too cool to ripen.
 */
type Warmth = { fit: number; hot: boolean }
function thermalFit(crop: Crop, climate: ClimateAnalysis, harvestYear: number): Warmth | null {
  const hemi = climate.season.hemisphere
  const season = cropSeason(crop, hemi, climate.monthly.recent)
  // the mild-winter form: no lower limit (its season is built on its own degree-days), but GAEZ's upper one - the
  // warmest season mean any of the crop's cultivars still takes (Sudan's Gezira wheat at 24 °C: 0.4; the coast of
  // Ghana at 27 °C: 0)
  if (crop.form === 'mild') {
    const lim = warmestSeason(heatNeeds(crop.id, hemi === 'tropics'))
    const t = lim && seasonMeanT(crop, climate, season, harvestYear)
    if (!lim) return { fit: 1, hot: false }
    return t === null ? null : { fit: clamp((lim.max - t) / Math.max(0.1, lim.max - lim.opt)), hot: t > lim.opt }
  }
  // the silage form is rated on GAEZ's silage maize rows (whole plant at 30-35 % dry matter), not the grain crop's
  const needs = crop.fao ? heatNeeds(crop.form === 'silage' && crop.silage ? crop.silage : crop.id, hemi === 'tropics') : []
  if (needs.length && crop.fao) {
    // the longest cycle, and the days it may wait for warmth (bestCultivar starts a cycle on the first warm-enough day)
    const longest = Math.max(...needs.map((n) => n.days)) + CYCLE_WAIT
    const shift = calendarShift(crop, hemi, climate.monthly.recent)
    // a warm-season sowing that waits for the seed-bed to warm starts on the day it does (warmthWait), not on the
    // reference day of the month the monthly calendar rounds it to
    const wait = warmthWait(crop, hemi, climate.monthly.recent)
    // where the rains set the date: from the day they start (sowingSpan), one month back when the calendar rounded up
    const rain = wait > 0 ? null : sowingSpan(crop, hemi, climate.monthly.recent)
    const back = wait > 0 ? warmthDelay(crop, hemi, climate.monthly.recent) : rain && rain.hi === ((shift % 12) + 12) % 12 ? 1 : 0
    const shifted = (crop.fao.sow[0] - 1 + shift) % 12
    let month = (shifted - back + 12) % 12 // 0-based: the reference sowing month on this field
    let year = harvestYear + season[0].yearOffset - (shifted - back < 0 ? 1 : 0)
    let day = crop.fao.sow[1] - 1
    let skip = wait + (rain ? Math.round(rain.f * 30.44) : 0)
    const dailyT: number[] = []
    let rec = climate.byMonth.get(monthKey(year, month + 1))
    let days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    while (dailyT.length < longest) {
      if (!rec) return null
      if (skip > 0) skip--
      else dailyT.push(rec.t)
      if (++day >= days) {
        day = 0
        month = (month + 1) % 12
        if (month === 0) year++
        rec = climate.byMonth.get(monthKey(year, month + 1))
        days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
        if (!rec && dailyT.length < longest) break // record ends: judge on the days there are
      }
    }
    const best = bestCultivar(dailyT, needs)
    return best ? { fit: best.fit, hot: best.hu > best.need.optHigh } : null
  }
  if (crop.gddNeed <= 0) {
    const v = crop.hardiness !== undefined && !crop.perennial ? vernalised(crop, climate, season, harvestYear) : 1
    return v === null ? null : { fit: v, hot: v < 1 }
  }
  const kc = kcFor(crop, hemi, climate.monthly.recent)
  let gdd = 0
  for (const s of season) {
    if (kc[s.month - 1] <= 0) continue
    const r = climate.byMonth.get(monthKey(harvestYear + s.yearOffset, s.month))
    if (!r) return null
    gdd += Math.max(0, r.t - 10) * new Date(Date.UTC(r.year, r.month, 0)).getUTCDate()
  }
  return { fit: clamp((gdd - crop.gddNeed + 150) / 300), hot: false }
}

/** Sowing into summer-dried soil (NH July-September) is where autumn crops fail to establish. */
function drySowing(crop: Crop, climate: ClimateAnalysis, harvestYear: number): boolean | null {
  const first = cropSeason(crop, climate.season.hemisphere, climate.monthly.recent)[0]
  const rec = climate.byMonth.get(monthKey(harvestYear + first.yearOffset, first.month))
  if (!rec) return null
  return rec.p < 0.5 * rec.pet
}

/**
 * Winter kill: how far the coldest month of this season averaged its nights below the crop's hardiness - a full kill
 * 1 °C below it, none 1 °C above (a ramp, a judgement: a monthly mean of the nights is a coarse stand-in for the cold
 * snaps and snow cover that decide it, and earlier a winter 0.1 °C either side counted all or nothing, so a
 * warmer scenario moved yields in steps). `over`: the mean night itself was below it, for the page and the crop's form.
 */
function winterKill(crop: Crop, climate: ClimateAnalysis, harvestYear: number): { kill: number; over: boolean } | null {
  if (crop.hardiness === undefined) return { kill: 0, over: false }
  let coldest = Infinity
  for (const s of cropSeason(crop, climate.season.hemisphere, climate.monthly.recent)) {
    const rec = climate.byMonth.get(monthKey(harvestYear + s.yearOffset, s.month))
    if (!rec) return null
    coldest = Math.min(coldest, rec.t - rec.tRange / 2)
  }
  return { kill: clamp((crop.hardiness + 1 - coldest) / 2), over: coldest < crop.hardiness }
}

/** Foliar-disease weather: in-season rain against the crop's limit - the hit grows from none 10 % under it to full 10 %
 *  over it (a judgement, as the winter-kill ramp; earlier a season 1 mm either side counted all or nothing).
 *  `over`: past the limit, as the note reports it. */
export const WET_RAMP = 0.1
function wetSeason(crop: Crop, climate: ClimateAnalysis, harvestYear: number): { hit: number; over: boolean } | null {
  if (crop.wetLimit === undefined) return { hit: 0, over: false }
  let rain = 0
  for (const s of cropSeason(crop, climate.season.hemisphere, climate.monthly.recent)) {
    if (s.kc < 0.5) continue // establishment and ripening months matter less for leaf disease
    const rec = climate.byMonth.get(monthKey(harvestYear + s.yearOffset, s.month))
    if (!rec) return null
    rain += rec.p
  }
  return { hit: clamp((rain - (1 - WET_RAMP) * crop.wetLimit) / (2 * WET_RAMP * crop.wetLimit)), over: rain > crop.wetLimit }
}

/** Is the harvest (or sowing) month wet enough that the soil sits at field capacity - the worst time for heavy traffic? */
function wetMonth(crop: Crop, climate: ClimateAnalysis, harvestYear: number, which: 'harvest' | 'sowing'): boolean | null {
  const season = cropSeason(crop, climate.season.hemisphere, climate.monthly.recent)
  const m = which === 'harvest' ? season[season.length - 1] : season[0]
  const rec = climate.byMonth.get(monthKey(harvestYear + m.yearOffset, m.month))
  if (!rec) return null
  return rec.p >= rec.pet
}

function sowsIntoSummer(crop: Crop): boolean {
  return crop.sow >= 7 && crop.sow <= 9 && !crop.perennial
}

const avgOf = <T>(xs: (T | null)[], f: (x: T) => number) => {
  const vals = xs.filter((x): x is T => x !== null).map(f)
  return vals.length ? mean(vals) : NaN
}

export function cropRisk(crop: Crop, climate: ClimateAnalysis, soil: SoilProfile, budget = 0, transpiration = 1): CropRisk {
  const taw = rootZoneWater(soil, crop.rootDepth)
  const years = climate.years.map((y) => y.year)
  // a CO₂ scenario only changes the scenario decade; the baseline stays as observed
  const tr = (y: number) => (y >= climate.recent.from ? transpiration : 1)
  const paddy = paddyFor(crop, soil)
  const byYear = years.map((y) => simulateSeason(crop, climate, taw, y, budget, tr(y), paddy)).filter((x): x is CropYearWater => x !== null)
  const inWin = (w: { from: number; to: number }, ys = byYear) => ys.filter((y) => y.year >= w.from && y.year <= w.to)
  // the same seasons after a bare fallow year (crops that hold the field all year never follow one)
  const bare = crop.perennial ? null : bareSoil(soil)
  const afterBare = bare ? years.map((y) => simulateSeason(crop, climate, taw, y, budget, tr(y), paddy, bare)).filter((x): x is CropYearWater => x !== null) : []
  const win = (w: { from: number; to: number }) => years.filter((y) => y >= w.from && y <= w.to)
  const figures = (ys: CropYearWater[]): WaterFigures => {
    const worst = [...ys].sort((a, b) => b.loss - a.loss).slice(0, Math.max(1, Math.round(ys.length * 0.3)))
    return {
      loss: mean(ys.map((y) => y.loss)),
      deficit: mean(ys.map((y) => y.deficit)),
      stress: mean(ys.map((y) => y.stress)),
      bad: mean(worst.map((y) => y.loss)),
      irrigation: mean(ys.map((y) => y.irrigation)),
      eta: mean(ys.map((y) => y.eta)),
    }
  }
  return {
    id: crop.id,
    crop,
    taw,
    byYear,
    baseline: figures(inWin(climate.baseline)),
    recent: figures(inWin(climate.recent)),
    afterFallow: afterBare.length ? {
      byYear: afterBare,
      baseline: figures(inWin(climate.baseline, afterBare)),
      recent: figures(inWin(climate.recent, afterBare)),
      stored: mean(inWin(climate.recent, afterBare).map((y, i) => y.eta - (inWin(climate.recent)[i]?.eta ?? y.eta))),
    } : undefined,
    heat: (() => {
      const b = win(climate.baseline).map((y) => heatExceeded(crop, climate, y))
      const r = win(climate.recent).map((y) => heatExceeded(crop, climate, y))
      return {
        baseline: avgOf(b, (x) => x.hit), recent: avgOf(r, (x) => x.hit),
        seasons: { baseline: avgOf(b, (x) => +x.over), recent: avgOf(r, (x) => +x.over) },
      }
    })(),
    grainFill: grainFill(crop, climate),
    thermal: (() => {
      const recent = win(climate.recent).map((y) => thermalFit(crop, climate, y))
      return {
        baseline: avgOf(win(climate.baseline).map((y) => thermalFit(crop, climate, y)), (x) => x.fit),
        recent: avgOf(recent, (x) => x.fit),
        hot: avgOf(recent, (x) => (x.hot && x.fit < 1 ? 1 : 0)),
      }
    })(),
    establish: sowsIntoSummer(crop)
      ? {
        month: cropSeason(crop, climate.season.hemisphere, climate.monthly.recent)[0].month,
        baseline: avgOf(win(climate.baseline).map((y) => drySowing(crop, climate, y)), (x) => (x ? 1 : 0)),
        recent: avgOf(win(climate.recent).map((y) => drySowing(crop, climate, y)), (x) => (x ? 1 : 0)),
      }
      : null,
    cold: (() => {
      const b = win(climate.baseline).map((y) => winterKill(crop, climate, y))
      const r = win(climate.recent).map((y) => winterKill(crop, climate, y))
      return { baseline: avgOf(b, (x) => x.kill), recent: avgOf(r, (x) => x.kill), seasons: { baseline: avgOf(b, (x) => +x.over), recent: avgOf(r, (x) => +x.over) } }
    })(),
    wet: {
      baseline: avgOf(win(climate.baseline).map((y) => wetSeason(crop, climate, y)), (x) => x.hit),
      recent: avgOf(win(climate.recent).map((y) => wetSeason(crop, climate, y)), (x) => x.hit),
      seasons: {
        baseline: avgOf(win(climate.baseline).map((y) => wetSeason(crop, climate, y)), (x) => +x.over),
        recent: avgOf(win(climate.recent).map((y) => wetSeason(crop, climate, y)), (x) => +x.over),
      },
    },
    workability: crop.perennial ? undefined : {
      harvest: {
        baseline: avgOf(win(climate.baseline).map((y) => wetMonth(crop, climate, y, 'harvest')), (x) => (x ? 1 : 0)),
        recent: avgOf(win(climate.recent).map((y) => wetMonth(crop, climate, y, 'harvest')), (x) => (x ? 1 : 0)),
      },
      sowing: {
        baseline: avgOf(win(climate.baseline).map((y) => wetMonth(crop, climate, y, 'sowing')), (x) => (x ? 1 : 0)),
        recent: avgOf(win(climate.recent).map((y) => wetMonth(crop, climate, y, 'sowing')), (x) => (x ? 1 : 0)),
      },
    },
  }
}

/** Winter kill in at least this share of the recent winters, and farmers grow the spring form instead. */
export const SPRING_FORM_KILL = 0.5
/**
 * Half-widths of the bands in which a field is scored on both forms of a crop, weighted by where it sits (formsOf):
 * ±1 °C of the coldest month around the mild-winter line (as the winter-kill ramp around the hardiness), ±0.15 of the
 * share of winters killed or summers unripe around a half. Judgements: farms in such a zone grow both, and a 0.5-degree
 * what-if no longer swaps a whole crop at once.
 */
export const BAND_T = 1
export const BAND_SHARE = 0.15
/** Grain rated under half its warmth (GAEZ) in at least this share of the recent seasons, and farmers grow the crop
 *  for silage instead - where the silage form is the warmer fit (as SPRING_FORM_KILL: in most years it would fail) */
export const SILAGE_FORM_UNRIPE = 0.5

/**
 * The form of a crop this field grows: a winter crop whose winter form dies in at least half the recent winters is
 * grown as its spring form - winter wheat gives way to spring wheat on the prairies and the steppe; where the winter is
 * too mild to vernalise it, a spring-type form is sown in late autumn instead (mildWinterOf - rabi wheat in Punjab);
 * maize whose grain does not ripen in most recent summers is grown for silage (silageOf).
 */
export function formOf(crop: Crop, climate: ClimateAnalysis): Crop {
  return formsOf(crop, climate).main
}

/** The share of the way through a band of half-width `half` around `at`: 0 below it, 1 above. */
const across = (x: number, at: number, half: number) => clamp((x - at + half) / (2 * half))

/**
 * formOf's choice and, near a line, the other variants with their weights. The lines, in order: the form (spring for
 * winter where winters kill the winter form by a narrow margin, the autumn-sown spring type near the mild-winter line,
 * silage near the line where grain stops ripening - formOnly), the sowing rule of a summer-rain field just above the
 * mild-winter line (sowingBand), and a month that splits the rainy season (rainsBand). Each line splits every variant
 * it reaches in two, weighted continuously, so the weights move without steps. Earlier, a crop carried only
 * the first line that applied: a field in the sowing band and at a split kept the band, and its sowing still jumped by
 * months (Cordoba: the median crop's largest 0.1-degree move 9.5 %).
 */
export function formsOf(crop: Crop, climate: ClimateAnalysis, line = 0): Forms {
  if (line === LINES.length) return { main: crop }
  const p = LINES[line](crop, climate)
  if (p && 'list' in p) {
    // several variants: each joined after the likelier ones before it
    let forms = formsOf(p.list[0].crop, climate, line + 1)
    let before = p.list[0].w
    for (const v of p.list.slice(1)) {
      forms = join(forms, formsOf(v.crop, climate, line + 1), v.w / (before + v.w), p.kind)
      before += v.w
    }
    return forms
  }
  if (!p?.alt) return formsOf(p?.main ?? crop, climate, line + 1)
  return join(formsOf(p.main, climate, line + 1), formsOf(p.alt.crop, climate, line + 1), p.alt.w, p.alt.kind)
}

/**
 * Two sides of a line as one list: a (weight 1 - w, the likelier) then b (weight w). The likeliest variant leads,
 * then the rest of a, then b; each link's weight is the share of what follows it - so readers that mix a risk with its
 * alt, recursively, weigh every variant as the tree does. Two plain variants give exactly the line's own pair.
 */
function join(a: Forms, b: Forms, w: number, kind: MixKind, sa = 1 - w, sb = w): Forms {
  // sa, sb: the shares of the whole a and b hold, so every link's sides (relative to its own list) become the whole's
  if (!a.alt) return { main: a.main, alt: { forms: scaled(b, sb), w, kind, sides: [sa, sb] } }
  const rest = (1 - w) * a.alt.w + w
  return { main: a.main, alt: { forms: join(a.alt.forms, b, w / rest, kind, sa, sb), w: rest, kind: a.alt.kind, sides: [a.alt.sides[0] * sa, a.alt.sides[1] * sa] } }
}
const scaled = (f: Forms, s: number): Forms => (f.alt ? { main: f.main, alt: { ...f.alt, forms: scaled(f.alt.forms, s), sides: [f.alt.sides[0] * s, f.alt.sides[1] * s] } } : f)

/**
 * A crop sown with the rains where months within RAINS_BAND of FAO's ½ PET decide the rainy season (crops.ts
 * rainsRuns): scored on every season that gives it another calendar, each weighted by its chance. Earlier, a month drying a
 * little split the season and moved the sowing by two months or more at once (Cordoba, December, under +0.2 °C); earlier, one deciding month at a time.
 */
function rainsBand(crop: Crop, climate: ClimateAnalysis): Many | null {
  const normals = climate.monthly.recent
  if (!rainSet(crop, climate.season.hemisphere, normals)) return null
  const runs = rainsRuns(normals)
  if (!runs) return null
  // seasons that give this crop the same calendar are one variant (a warm-season crop reads the onset, a cool-season
  // one the end): the same risk, computed once
  const hemisphere = climate.season.hemisphere
  const byCalendar = new Map<string, { crop: Crop; w: number }>()
  for (const r of runs) {
    const c = { ...crop, rains: r.season }
    const key = JSON.stringify(sowingSpan(c, hemisphere, normals) ?? calendarShift(c, hemisphere, normals))
    const v = byCalendar.get(key)
    if (v) v.w += r.w
    else byCalendar.set(key, { crop: c, w: r.w })
  }
  const list = [...byCalendar.values()].sort((x, y) => y.w - x.w)
  return list.length > 1 ? { list, kind: 'rains' } : null
}
/** a line's several variants, the likeliest first, with their weights (rainsBand) */
type Many = { list: { crop: Crop; w: number }[]; kind: MixKind }
/** a crop's variants near its lines: the likeliest first, then the others along alt (formsOf) */
export type Forms = { main: Crop; alt?: { forms: Forms; w: number; kind: MixKind; sides: Sides } }
/** the shares of the whole the two sides of a link's line hold (what its note reports): its own side - every variant
 *  on it, before and after the link - and the other side */
export type Sides = [number, number]
/** one line's two sides: the likelier, and the other with its weight (< 0.5) */
type Pick = { main: Crop; alt?: { crop: Crop; w: number; kind: MixKind } }
/** what the two scores of a crop near a line differ in: its form, or the rule that sets its sowing */
export type MixKind = 'form' | 'calendar' | 'monsoon' | 'rains'
const pair = (other: Crop, w: number, kind: MixKind) => (w > 0 && w < 1 ? { crop: other, w: Math.min(w, 1 - w), kind } : undefined)
const pick = (a: Crop, b: Crop, wB: number, kind: MixKind): Pick => ({ main: wB >= 0.5 ? b : a, alt: pair(wB >= 0.5 ? a : b, wB, kind) })
/** the lines formsOf splits a crop's variants by, in order */
const LINES: ((crop: Crop, climate: ClimateAnalysis) => Pick | Many | null)[] = [(c, k) => formOnly(c, k), (c, k) => sowingBand(c, k), (c, k) => monsoonBand(c, k), (c, k) => rainsBand(c, k)]

/**
 * A summer-rain field (crops.ts summerRains) whose coldest month sits within BAND_T above the mild-winter line: the
 * crop scored on both sowing rules - once the seed-bed warms, and with the rains (crops.ts monsoonal, which takes the
 * rains from the line on) - the rains' weight rising from 0 at the line to 1 at BAND_T above it. Earlier, a
 * warmer scenario that lifted the coldest month past 10 °C moved a warm-season sowing by months at once. The band
 * starts at the line, not around it: below the line no field has ever had the rains' calendar, and that calendar
 * exists only while the rainy season keeps a monsoon's shape (2-8 months) - so more rain can switch it off. Inside
 * the band that switch moves the score by the band's share, not whole; a band reaching below the line made more rain
 * lower some crops' water score at Pergamino (9.2 °C), and was later removed.
 */
function sowingBand(crop: Crop, climate: ClimateAnalysis): Pick | null {
  const normals = climate.monthly.recent
  const hemisphere = climate.season.hemisphere
  if (hemisphere === 'tropics' || crop.perennial || crop.fixedSow || !crop.fao || normals.length !== 12) return null
  const coldest = Math.min(...normals.map((n) => n.t))
  // a field whose monsoon shape months at ½ PET may lose is in the band too; monsoonBand then splits its rains side
  if (!(coldest > MILD_WINTER_T && coldest < MILD_WINTER_T + BAND_T) || !(summerRainsShare(hemisphere, normals) > 0)) return null
  const rains = clamp((coldest - MILD_WINTER_T) / BAND_T)
  return pick({ ...crop, sowBy: 'warmth' }, { ...crop, sowBy: 'rains' }, rains, 'calendar')
}

/**
 * A field from the mild-winter line up whose rains keep or lose a monsoon's shape by months at ½ PET (crops.ts
 * summerRainsShare): a crop not already sown by warmth scored on both rules - with the rains, weighted by the share
 * that keeps the monsoon, and once the seed-bed warms. Earlier, a few per cent more or less rain switched the
 * rule at once (Cordoba at +20 %: eight rainy months became nine).
 */
function monsoonBand(crop: Crop, climate: ClimateAnalysis): Pick | null {
  const normals = climate.monthly.recent
  const hemisphere = climate.season.hemisphere
  if (hemisphere === 'tropics' || crop.perennial || crop.fixedSow || !crop.fao || crop.sowBy === 'warmth' || normals.length !== 12) return null
  if (Math.min(...normals.map((n) => n.t)) < MILD_WINTER_T) return null
  const on = summerRainsShare(hemisphere, normals)
  return on > 0 && on < 1 ? pick({ ...crop, sowBy: 'warmth' }, { ...crop, sowBy: 'rains' }, on, 'monsoon') : null
}

function formOnly(crop: Crop, climate: ClimateAnalysis): Pick {
  // maize where its grain does not ripen in most recent summers and silage is the warmer fit: grown for silage
  // (silageOf) - Denmark, northern Germany
  const silage = silageOf(crop)
  if (silage) {
    const grain = years(climate.recent).map((y) => thermalFit(crop, climate, y))
    const unripe = avgOf(grain, (x) => clamp((0.6 - x.fit) / 0.2))
    if (!(unripe > SILAGE_FORM_UNRIPE - BAND_SHARE)) return { main: crop } // the grain ripens: no silage band to read
    const whole = avgOf(years(climate.recent).map((y) => thermalFit(silage, climate, y)), (x) => x.fit)
    if (!(whole > avgOf(grain, (x) => x.fit))) return { main: crop }
    return pick(crop, silage, across(unripe, SILAGE_FORM_UNRIPE, BAND_SHARE), 'form')
  }
  const spring = springOf(crop)
  if (!spring) return { main: crop }
  const normals = climate.monthly.recent
  const coldest = normals.length === 12 ? Math.min(...normals.map((n) => n.t)) : NaN
  // the spring form where winters kill the winter form (the ramp around the hardiness, winterKill)
  const kill = avgOf(years(climate.recent).map((y) => winterKill(crop, climate, y)), (x) => x.kill)
  const byKill = pick(crop, spring, across(kill, SPRING_FORM_KILL, BAND_SHARE), 'form')
  // the spring type sown in late autumn where the winter is too mild to vernalise the winter form (mildWinterOf)
  const mild = mildWinterOf(crop, climate.season.hemisphere, normals, MILD_WINTER_T - BAND_T)
  return mild ? pick(byKill.main, mild, across(coldest, MILD_WINTER_T, BAND_T), 'form') : byKill
}
const years = (w: { from: number; to: number }) => Array.from({ length: w.to - w.from + 1 }, (_, i) => w.from + i)

/**
 * @param budget irrigation water per season, mm (0 = rainfed)
 * @param transpiration crop-transpiration multiplier for the recent decade (CO₂ scenarios), 1 = as observed
 */
export function allCropRisks(climate: ClimateAnalysis, soil: SoilProfile, budget = 0, transpiration = 1): Record<CropId, CropRisk> {
  return Object.fromEntries(CROPS.map((c) => {
    const riskOf = (f: Forms): CropRisk => {
      const risk = cropRisk(f.main, climate, soil, budget, transpiration)
      return f.alt ? { ...risk, alt: { risk: riskOf(f.alt.forms), w: f.alt.w, kind: f.alt.kind, sides: f.alt.sides } } : risk
    }
    return [c.id, riskOf(formsOf(c, climate))]
  })) as Record<CropId, CropRisk>
}

/** Water-stress figures for a replay year, or the recent-decade mean when `year` is null. */
export function waterIn(risk: CropRisk, year: number | null): WaterFigures {
  const y = year == null ? undefined : risk.byYear.find((r) => r.year === year)
  return y ? { loss: y.loss, deficit: y.deficit, stress: y.stress, bad: y.loss, irrigation: y.irrigation, eta: y.eta } : risk.recent
}
