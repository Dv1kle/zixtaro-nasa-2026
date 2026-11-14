// "What if it gets warmer?" - the delta-change method: take the recent decade of real NASA POWER
// months, add ΔT (and optionally scale rain), keep relative humidity constant (dew point moves with
// air temperature) and recompute Penman-Monteith ET₀. Baseline years stay untouched, so every
// "baseline → recent" comparison downstream becomes "baseline → recent + ΔT".
//
// The shifts are either flat stress tests (+1…+3 °C) or NASA NEX-GDDP-CMIP6 projections for the
// 2050s: month-by-month changes in temperature and rain vs 2016-2025, pre-baked per 0.25° grid cell
// by scripts/cmip6.mjs for the demo fields (and any field that falls in the same cell).

import { analyzeClimate, type ClimateAnalysis, type MonthRec } from './climate'
import { COOL_SEASON, cropSeason, flowerMonth, type Crop, type Group } from './crops'
import { hargreavesPET, penmanMonteithPET } from './solar'

/** dT in °C and rain as a relative change (−0.1 = 10 % less), either flat or per calendar month (Jan..Dec). */
export type Warming = { dT: number | number[]; rain: number | number[] }

const at = (x: number | number[], month: number) => (Array.isArray(x) ? (x[month - 1] ?? 0) : x)

export function warmedRecords(climate: ClimateAnalysis, w: Warming): MonthRec[] {
  const recs = [...climate.byMonth.values()].sort((a, b) => a.year - b.year || a.month - b.month)
  const from = climate.recent.from
  let tPrev = NaN
  let prev: MonthRec | null = null
  return recs.map((r) => {
    // The previous month only counts if it really is the previous month (POWER series can have gaps).
    const follows = prev !== null && (prev.year * 12 + prev.month) === r.year * 12 + r.month - 1
    prev = r
    if (r.year < from) {
      tPrev = r.t
      return r
    }
    const dT = at(w.dT, r.month)
    // Shift the month before the scenario starts too, so the soil heat flux sees no artificial jump.
    if (!follows) tPrev = NaN
    else if (r.year === from && r.month === 1) tPrev += at(w.dT, 12)
    const t = r.t + dT
    const tDew = r.tDew + dT
    const canPM = Number.isFinite(tDew) && Number.isFinite(r.wind) && Number.isFinite(r.ps)
    const pet = canPM
      ? penmanMonteithPET({ lat: climate.lat, month: r.month, year: r.year, t, tRange: r.tRange, tDew, wind: r.wind, ps: r.ps, rs: r.rs, tPrev })
      : hargreavesPET(climate.lat, r.month, r.year, t, r.tRange)
    tPrev = t
    return { ...r, t, tDew, tMaxAbs: r.tMaxAbs + dT, p: Math.max(0, r.p * (1 + at(w.rain, r.month))), pet }
  })
}

/** The same field, with the recent decade shifted by the scenario. */
export function warmClimate(climate: ClimateAnalysis, w: Warming): ClimateAnalysis {
  const none = (x: number | number[]) => (Array.isArray(x) ? x.every((v) => v === 0) : x === 0)
  if (none(w.dT) && none(w.rain)) return climate
  const dT = Array.from({ length: 12 }, (_, i) => at(w.dT, i + 1))
  return { ...analyzeClimate(warmedRecords(climate, w), climate.lat, climate.lon), height: climate.height, warming: { dT, present: climate.monthly.recent } }
}

// ---------- Grain fill: shorter in a warmer season (what-if only) ----------

/** Cool-season crops harvested for grain or seed (not potato and sugar beet) */
const COOL_GRAIN: ReadonlySet<Group> = new Set(['small-grain', 'oilseed', 'legume'])
/**
 * Base temperature of the grain-fill clock, °C: 0 for the cool-season grain crops (the engine's own ripening sum,
 * ripenGdd0, is base 0), 8 for the C4 cereals (CERES-Maize counts silking to maturity, P5, in degree-days above 8 °C;
 * Jones & Kiniry 1986). Rice, soybean and the other warm-season grain crops get no term: their reproductive phase is
 * paced largely by day length, which the engine does not model, and on the development cells soybean and rice sat
 * closer to the literature without it (−1.5 % at +1 °C against −3.1 / −3.2 %) than with it (−7.6 / −7.5 % at base 8,
 * −5.5 / −5.3 % at base 0). Evidence register: grainfill.
 */
export const GRAIN_FILL_TB = { cool: 0, c4: 8 } as const
const fillBase = (crop: Crop) =>
  crop.group === 'c4-cereal' ? GRAIN_FILL_TB.c4 : COOL_SEASON.has(crop.id) && COOL_GRAIN.has(crop.group) ? GRAIN_FILL_TB.cool : null

/**
 * The share of today's grain a what-if leaves once a warmer season fills grain faster: flowering to maturity takes a
 * fixed thermal time, so its length - and the light the crop turns into grain over it - scales with
 * (T − Tb) / (T + ΔT − Tb), T the observed mean of the months the crop fills grain in under the what-if - its calendar
 * may move with the warmth (an earlier warmth wait, the rains' calendar past the mild-winter line), and what moving it
 * does is the thermal and heat factors' to say; this term only times the fill in the months it happens. Earlier,
 * those months came from today's calendar, so a crop whose calendar the what-if moved was timed in months it
 * no longer filled in (Punjab oats at +1.9 °C, sown with the rains: 0.85 against 0.93 on today's spring calendar). 1 for
 * the observed climate (its FAOSTAT yield anchor already holds today's grain fill) and for the crops GRAIN_FILL_TB
 * leaves out. Earlier, the
 * what-if had no such term: shortening the season only cut water stress, so winter wheat in cool climates gained
 * from warming (higher at +2 °C on 24 of 216 development cells) where crop models and experiments lose ~6 % per °C
 * (Asseng et al. 2015; Zhao et al. 2017).
 */
export function grainFill(crop: Crop, climate: ClimateAnalysis): number {
  const w = climate.warming
  const tb = fillBase(crop)
  if (!w || tb === null) return 1
  const hemi = climate.season.hemisphere
  const now = climate.monthly.recent // the what-if's normals: the calendar the crop is grown on there
  const season = cropSeason(crop, hemi, now)
  // flowering to the end of the season; where the season's degree-days run out before the flowering month (winter rye
  // in the Indo-Gangetic plain) the ripening month stands in
  const from = season.findIndex((s) => s.month === flowerMonth(crop, hemi, now))
  const months = season.slice(from < 0 ? -1 : from).map((s) => s.month)
  const t = avg(months.map((m) => w.present.find((n) => n.month === m)?.t ?? NaN))
  const warmer = t + avg(months.map((m) => w.dT[m - 1])) - tb
  // a fill below the base temperature is not timed by warmth (cold ends it) - nothing to shorten
  return t - tb > 0 && warmer > 0 ? (t - tb) / warmer : 1
}

// ---------- The what-if menu: flat stress tests and NASA CMIP6 projections ----------

export const SSPS = ['ssp245', 'ssp585'] as const
export type Ssp = (typeof SSPS)[number]
export const SSP_LABEL: Record<Ssp, string> = { ssp245: 'SSP2-4.5', ssp585: 'SSP5-8.5' }
/** The same pathways in a farmer's words; the SSP code stays in tooltips, the banner and the Method page. */
export const SSP_PLAIN: Record<Ssp, string> = { ssp245: 'moderate emissions', ssp585: 'high emissions' }

/** 0 = the observed recent decade. */
export type WhatIf = 0 | 1 | 2 | 3 | Ssp

export const isWhatIf = (x: unknown): x is WhatIf => x === 0 || x === 1 || x === 2 || x === 3 || x === 'ssp245' || x === 'ssp585'

export type Projection = {
  id: string
  cell: string
  source: string
  base: [number, number]
  future: [number, number]
  models: string[]
  scenarios: Record<Ssp, { dT: number[]; rain: number[]; spread: [number, number] }>
}

export function whatIfWarming(w: WhatIf, proj: Projection | null): Warming | null {
  if (w === 0) return null
  if (typeof w === 'number') return { dT: w, rain: 0 }
  const s = proj?.scenarios[w]
  return s ? { dT: s.dT, rain: s.rain } : null
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// ---------- CO₂: what the projections change besides the weather ----------

/**
 * Atmospheric CO₂, ppm: the 2016-2025 mean (NOAA global record) and 2050 under each pathway (Meinshausen et al. 2020,
 * the SSP concentrations used by CMIP6).
 */
export const CO2_PPM = { now: 414, ssp245: 509, ssp585: 563 } as const
/** Reference step for the published responses: ≈ 550 vs 370 ppm. */
const CO2_STEP = 180
/** C4 grasses: photosynthesis already CO₂-saturated. */
export const C4: ReadonlySet<string> = new Set(['maize', 'sorghum', 'millet', 'pearlmillet'])

export type Co2Effect = {
  ppm: number // the scenario's concentration
  delta: number // ppm above the recent decade
  /** crop transpiration multiplier from stomatal closure: −5 % at +180 ppm (FAO AquaCrop; Vanuytrecht et al. 2011) */
  transpiration: number
  /** yield multiplier by pathway: FACE experiments, C3 +12 %, C3 legumes +15 %, C4 ≈ 0 at +180 ppm (Ainsworth & Long 2005; Long et al. 2006) */
  gain: (cropId: string, family: string) => number
}

export function co2Effect(w: WhatIf, on = true): Co2Effect | null {
  if (!on || typeof w === 'number') return null
  const delta = CO2_PPM[w] - CO2_PPM.now
  const k = delta / CO2_STEP
  return {
    ppm: CO2_PPM[w],
    delta,
    transpiration: 1 - 0.05 * k,
    gain: (id, family) => (family === 'none' ? 1 : 1 + (C4.has(id) ? 0 : family === 'fabaceae' ? 0.15 : 0.12) * k),
  }
}

/** Annual-mean warming of a choice, °C. */
export const annualDT = (w: WhatIf, proj: Projection | null) =>
  typeof w === 'number' ? w : proj ? avg(proj.scenarios[w].dT) : 0

/** Chip text: "+2 °C" or "2050s, moderate emissions". */
export const whatIfShort = (w: WhatIf) => (typeof w === 'number' ? `+${w} °C` : `2050s, ${SSP_PLAIN[w]}`)

/** As a period label next to "1981-2010": "2016-2025 at +2 °C" or "2050s, moderate emissions". */
export const whatIfPeriod = (w: WhatIf, recent: { from: number; to: number }) =>
  typeof w === 'number' ? `${recent.from}-${recent.to}${w ? ` at +${w} °C` : ''}` : `2050s, ${SSP_PLAIN[w]}`

/** In a sentence: "a season 2 °C warmer" or "a 2050s season (moderate emissions)". */
export const whatIfSeason = (w: WhatIf) => (typeof w === 'number' ? `a season ${w} °C warmer` : `a 2050s season (${SSP_PLAIN[w]})`)

/** One paragraph for the banner, the report and the footnotes. */
export function whatIfExplain(w: WhatIf, proj: Projection | null, recent: { from: number; to: number }, co2On = true): string {
  if (w === 0) return ''
  if (typeof w === 'number') {
    return `every season of ${recent.from}-${recent.to} re-run ${w} °C warmer - same rain, same relative humidity, evaporative demand recomputed with Penman-Monteith (the delta-change method)`
  }
  if (!proj) return ''
  const s = proj.scenarios[w]
  const summer = avg(s.rain.slice(5, 8)) // Jun-Aug
  return `every season of ${recent.from}-${recent.to} re-run with the month-by-month change NASA NEX-GDDP-CMIP6 projects for ${proj.future[0]}-${proj.future[1]} vs ${proj.base[0]}-${proj.base[1]} under ${SSP_LABEL[w]}: +${avg(s.dT).toFixed(1)} °C a year (models ${s.spread[0].toFixed(1)}-${s.spread[1].toFixed(1)} °C), Jun-Aug rain ${summer >= 0 ? '+' : '−'}${Math.abs(Math.round(summer * 100))} % - mean of ${proj.models.join(', ')}${co2On ? `; CO₂ at ${CO2_PPM[w]} ppm lowers crop transpiration and lifts C3 yields (AquaCrop, FACE experiments)` : '; CO₂ effects on the crops left out'}`
}

// ---------- Loading: which 0.25° cell has a pre-baked projection ----------

type Index = { cellSize: number; cells: { id: string; cell: string }[] }
let indexPromise: Promise<Index | null> | null = null
const projections = new Map<string, Promise<Projection | null>>()

export const cmip6Cell = (lat: number, lon: number) => `${Math.floor(lat / 0.25)},${Math.floor((((lon % 360) + 360) % 360) / 0.25)}`

export async function projectionFor(lat: number, lon: number): Promise<Projection | null> {
  const base = `${import.meta.env.BASE_URL}data/cmip6/`
  indexPromise ??= fetch(`${base}index.json`).then((r) => (r.ok ? (r.json() as Promise<Index>) : null)).catch(() => null)
  const index = await indexPromise
  const hit = index?.cells.find((c) => c.cell === cmip6Cell(lat, lon))
  if (!hit) return null
  let p = projections.get(hit.id)
  if (!p) {
    p = fetch(`${base}${hit.id}.json`).then((r) => (r.ok ? (r.json() as Promise<Projection>) : null)).catch(() => null)
    projections.set(hit.id, p)
  }
  return p
}
