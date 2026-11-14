// Soil organic carbon and soil cover under a rotation - the "soil health" half of the plan, in published models.
//
// Carbon returned to the soil: IPCC 2006 Guidelines, Vol. 4, Ch. 11, Table 11.2 - above-ground residue
// AG = yield(DM) × slope + intercept, below-ground BG = (yield + AG) × R_BG - with 45 % carbon in dry matter and
// root exudates worth 65 % of root carbon (Bolinder et al. 2007, Agric. Ecosyst. Environ. 118:29).
//
// What the soil keeps: ICBM, the two-pool Introductory Carbon Balance Model (Andrén & Kätterer 1997, Ecol. Appl.
// 7:1226) with its Ultuna calibration, k_young = 0.8 /yr, k_old = 0.006 /yr, humification h = 0.125 for
// above-ground residues and 2.3 × that for roots (Kätterer et al. 2011, Agric. Ecosyst. Environ. 141:184).
// Decomposition speeds up with warmth and moisture: the RothC temperature factor (Coleman & Jenkinson 1996) times
// the IPCC 2019 Tier-2 water factor on this field's NASA POWER monthly temperature, rain and ET₀, relative to Ultuna.
//
// The model is linear, so the difference between two rotations does not depend on the (unknown) state of the old
// pool: like the IPCC Tier-2 method we assume the soil has settled under the way the field is farmed now, and
// report how far another rotation would move it. SoilGrids gives the starting stock for the 0-30 cm layer.
//
// Soil cover: FAO-56 eq. 76 turns each month's crop coefficient into canopy cover; erosive rain comes from NASA POWER
// daily precipitation (days ≥ 12.7 mm, energy ∝ P^1.81 after Richardson et al. 1983, the RUSLE daily erosivity form).

import { baseForm, CROP_BY_ID, cropSeason, tableId, type Crop, type CropId, type FormOf } from './crops'
import type { MonthNormal } from './climate'
import { saxtonRawls, omFromSoc, type SoilProfile } from './soil'
import { clamp } from './stats'
import { EXTRA_RESIDUE } from './cropsExtra'

type Hemisphere = 'north' | 'south' | 'tropics'

/** IPCC 2006 Table 11.2 residue relations. `ref` says where the numbers come from. */
export type Residue = {
  dry: number // dry-matter fraction of the harvested product
  slope: number // AG residue per t of harvested DM
  intercept: number // t DM/ha
  rbg: number // ratio of below-ground to above-ground biomass
  /** tuber and root crops: roots are counted against the residue only, not the harvested root itself */
  rootCrop?: boolean
  ref: 'IPCC 2006' | 'IPCC 2006 (proxy)' | 'assumed'
  proxy?: string
}

const GRAINS = { dry: 0.89, slope: 1.09, intercept: 0.88, rbg: 0.22 } // IPCC "Grains" (generic)
const PULSES = { dry: 0.91, slope: 0.36, intercept: 0.68, rbg: 0.19 } // IPCC "Beans & pulses"
const TUBERS = { dry: 0.22, slope: 0.1, intercept: 1.06, rbg: 0.2, rootCrop: true }

export const RESIDUE: Record<CropId, Residue> = {
  wheat: { dry: 0.89, slope: 1.61, intercept: 0.4, rbg: 0.23, ref: 'IPCC 2006' }, // winter wheat
  barley: { dry: 0.89, slope: 0.98, intercept: 0.59, rbg: 0.22, ref: 'IPCC 2006' },
  rye: { dry: 0.88, slope: 1.09, intercept: 0.88, rbg: 0.22, ref: 'IPCC 2006' },
  maize: { dry: 0.87, slope: 1.03, intercept: 0.61, rbg: 0.22, ref: 'IPCC 2006' },
  sorghum: { dry: 0.89, slope: 0.88, intercept: 1.33, rbg: 0.22, ref: 'IPCC 2006' },
  oats: { dry: 0.89, slope: 0.91, intercept: 0.89, rbg: 0.25, ref: 'IPCC 2006' },
  millet: { dry: 0.9, slope: 1.43, intercept: 0.14, rbg: 0.22, ref: 'IPCC 2006' },
  soybean: { dry: 0.91, slope: 0.93, intercept: 1.35, rbg: 0.19, ref: 'IPCC 2006' },
  pea: { dry: 0.91, slope: 1.13, intercept: 0.85, rbg: 0.19, ref: 'IPCC 2006' },
  triticale: { dry: 0.88, slope: 1.09, intercept: 0.88, rbg: 0.22, ref: 'IPCC 2006 (proxy)', proxy: 'rye' },
  sunflower: { ...GRAINS, ref: 'IPCC 2006 (proxy)', proxy: 'grains' },
  rapeseed: { ...GRAINS, ref: 'IPCC 2006 (proxy)', proxy: 'grains' },
  linseed: { ...GRAINS, ref: 'IPCC 2006 (proxy)', proxy: 'grains' },
  buckwheat: { ...GRAINS, ref: 'IPCC 2006 (proxy)', proxy: 'grains' },
  lupin: { ...PULSES, ref: 'IPCC 2006 (proxy)', proxy: 'beans & pulses' },
  faba: { ...PULSES, ref: 'IPCC 2006 (proxy)', proxy: 'beans & pulses' },
  lentil: { ...PULSES, ref: 'IPCC 2006 (proxy)', proxy: 'beans & pulses' },
  chickpea: { ...PULSES, ref: 'IPCC 2006 (proxy)', proxy: 'beans & pulses' },
  potato: { ...TUBERS, ref: 'IPCC 2006' },
  sugarbeet: { ...TUBERS, ref: 'IPCC 2006 (proxy)', proxy: 'tubers' },
  rice: { dry: 0.89, slope: 0.95, intercept: 2.46, rbg: 0.16, ref: 'IPCC 2006' },
  groundnut: { dry: 0.94, slope: 1.07, intercept: 1.54, rbg: 0.2, ref: 'IPCC 2006' }, // peanut with pod
  pearlmillet: { dry: 0.9, slope: 1.43, intercept: 0.14, rbg: 0.22, ref: 'IPCC 2006' }, // millet
  cowpea: { ...PULSES, ref: 'IPCC 2006 (proxy)', proxy: 'beans & pulses' },
  drybean: { ...PULSES, ref: 'IPCC 2006', proxy: 'beans & pulses' },
  cassava: { ...TUBERS, ref: 'IPCC 2006 (proxy)', proxy: 'tubers' },
  sweetpotato: { ...TUBERS, ref: 'IPCC 2006 (proxy)', proxy: 'tubers' },
  cotton: { ...GRAINS, ref: 'IPCC 2006 (proxy)', proxy: 'grains' },
  // forage yield is already dry matter; IPCC "N-fixing forages"
  clover: { dry: 1, slope: 0.3, intercept: 0, rbg: 0.4, ref: 'IPCC 2006' },
  // a green fallow is not harvested: all of it goes back (biomass below)
  cover: { dry: 1, slope: 0, intercept: 0, rbg: 0.4, ref: 'assumed' },
  fallow: { dry: 1, slope: 0, intercept: 0, rbg: 0, ref: 'assumed' }, // no plant, no residue
  ...EXTRA_RESIDUE,
}

export const C_IN_DM = 0.45
export const EXUDATES = 0.65 // extra-root carbon per unit of root carbon
export const K_YOUNG = 0.8
export const K_OLD = 0.006
export const H_AG = 0.125
export const H_BG = 0.125 * 2.3
/** above-ground dry matter of a season-long multi-species green fallow, t/ha (typical 3-6) */
export const COVER_BIOMASS = 4
/** a winter catch crop sown after an early harvest, t DM/ha above ground (typical 1-2.5) */
export const CATCH_BIOMASS = 1.5
/** share of cereal straw carried off the field when it is baled (the stubble stays) */
export const STRAW_TAKEN = 0.7

export type CarbonIn = { ag: number; bg: number } // t C/ha per season

/** Carbon a season of `crop` returns to the soil at `share` of its reference yield. */
export function carbonInputs(crop: Crop, share: number, strawRemoved = false): CarbonIn {
  const r = RESIDUE[tableId(crop)]
  const s = clamp(share, 0, 1.2)
  if (crop.id === 'cover') {
    const ag = COVER_BIOMASS * s
    return { ag: ag * C_IN_DM, bg: ag * r.rbg * C_IN_DM * (1 + EXUDATES) }
  }
  const product = crop.econ.yield * s * r.dry
  let ag = product > 0 ? product * r.slope + r.intercept : 0
  const bg = (r.rootCrop ? ag : product + ag) * r.rbg
  if (strawRemoved && crop.group === 'small-grain') ag *= 1 - STRAW_TAKEN
  return { ag: ag * C_IN_DM, bg: bg * C_IN_DM * (1 + EXUDATES) }
}

export const CATCH_INPUT: CarbonIn = { ag: CATCH_BIOMASS * C_IN_DM, bg: CATCH_BIOMASS * 0.4 * C_IN_DM * (1 + EXUDATES) }

/** Carbon the soil keeps for the long run from one season's inputs (what enters the old pool), t C/ha. */
export const humified = (c: CarbonIn) => H_AG * c.ag + H_BG * c.bg

// ---------- climate: how fast this soil breathes ----------

/** RothC temperature rate modifier (Coleman & Jenkinson 1996). */
export const rothcTemp = (t: number) => (t < -5 ? 0 : 47.9 / (1 + Math.exp(106 / (t + 18.3))))
/** IPCC 2019 Refinement, Vol. 4 eq. 5.0F: water factor from the monthly rain / PET ratio (capped at 1.25). */
export const ipccWater = (p: number, pet: number) => {
  const r = Math.min(1.25, pet > 0 ? p / pet : 1.25)
  return 0.2129 + 0.9303 * r - 0.2413 * r * r
}

/** Uppsala (Ultuna) monthly climate, 1991-2020, rounded - the site ICBM was calibrated at. */
const ULTUNA = {
  t: [-2.9, -3.3, 0, 5.1, 10.9, 15, 17.6, 16.2, 11.6, 6.3, 2.2, -1.2],
  p: [42, 30, 29, 32, 41, 58, 70, 72, 52, 55, 49, 46],
  pet: [3, 8, 22, 50, 85, 105, 105, 80, 45, 20, 7, 3],
}
const climateRate = (t: number[], p: number[], pet: number[]) => t.reduce((s, ti, i) => s + rothcTemp(ti) * ipccWater(p[i], pet[i]), 0) / 12
const ULTUNA_RATE = climateRate(ULTUNA.t, ULTUNA.p, ULTUNA.pet)

/** ICBM external factor r_e for this field (1 = Ultuna). */
export function decompFactor(normals: MonthNormal[]): number {
  const n = [...normals].sort((a, b) => a.month - b.month)
  return climateRate(n.map((m) => m.t), n.map((m) => m.p), n.map((m) => m.pet)) / ULTUNA_RATE
}

// ---------- ICBM ----------

/**
 * Change in soil carbon (t C/ha, by year 1…years) from running `plan` instead of `ref`, each repeated as a cycle.
 * Inputs enter the young pools at the start of each year; both pools then decay for a year (analytic solution).
 */
export function icbmDifference(plan: CarbonIn[], ref: CarbonIn[], re: number, years: number): number[] {
  const kY = K_YOUNG * re
  const kO = K_OLD * re
  let yAg = 0
  let yBg = 0
  let o = 0
  const out: number[] = []
  const eY = Math.exp(-kY)
  const eO = Math.exp(-kO)
  for (let t = 0; t < years; t++) {
    const a = plan[t % plan.length]
    const b = ref[t % ref.length]
    yAg += a.ag - b.ag
    yBg += a.bg - b.bg
    const toOld = (H_AG * yAg + H_BG * yBg) * K_YOUNG / (K_OLD - K_YOUNG) // h·kY·Y/(kO−kY), re cancels
    o = (o - toOld) * eO + toOld * eY
    yAg *= eY
    yBg *= eY
    out.push(yAg + yBg + o)
  }
  return out
}

/** SOC stock of the top 30 cm, t C/ha, from SoilGrids SOC, bulk density and stones. */
export function socStock30(soil: SoilProfile): number {
  let s = 0
  for (const l of soil.layers) {
    const cm = Math.max(0, Math.min(l.bottom, 30) - l.top)
    if (cm > 0) s += l.soc * l.bd * cm * 0.1 * (1 - Math.min(90, l.cfvo) / 100)
  }
  return s
}

/** Plant-available water of the top 30 cm (mm) with its SOC scaled by `factor` - Saxton & Rawls (2006). */
export function topsoilWater(soil: SoilProfile, factor = 1): number {
  let mm = 0
  for (const l of soil.layers) {
    const cm = Math.max(0, Math.min(l.bottom, 30) - l.top)
    if (cm <= 0) continue
    const { paw } = saxtonRawls(l.sand, l.clay, omFromSoc(l.soc * factor))
    mm += paw * (1 - Math.min(90, l.cfvo) / 100) * cm * 10
  }
  return mm
}

// ---------- soil cover & storm rain ----------

/** FAO-56 eq. 76: fraction of ground covered by the canopy, from the crop coefficient (Kc as a proxy for Kcb). */
export const canopyCover = (kc: number, h = 1) => (kc <= 0 ? 0 : clamp((kc - 0.15) / (1.2 - 0.15)) ** (1 + 0.5 * h))

const harvestMonthIndex = (crop: Crop, hemi: Hemisphere, normals?: MonthNormal[]) => {
  const s = cropSeason(crop, hemi, normals)
  const last = s[s.length - 1]
  return last.yearOffset * 12 + last.month - 1
}
const sowMonthIndex = (crop: Crop, hemi: Hemisphere, normals?: MonthNormal[]) => {
  const first = cropSeason(crop, hemi, normals)[0]
  return first.yearOffset * 12 + first.month - 1
}

/** Is there a winter window for a catch crop between `a` (harvested early) and a spring-sown `b`? (same rule as the score) */
export function catchWindow(a: Crop, b: Crop): boolean {
  const aHarvest = cropSeason(a, 'north')
  return !a.perennial && !b.perennial && aHarvest[aHarvest.length - 1].month <= 8 && b.sow >= 3 && b.sow <= 6
}

/**
 * Monthly canopy cover over one cycle of the rotation (length = 12 × seasons), January of the first harvest year
 * first. The rotation is treated as a loop, so an autumn sowing before the first season wraps to the cycle's end.
 */
export function coverCycle(seq: CropId[], hemi: Hemisphere, normals?: MonthNormal[], catchCrops = false, form: FormOf = baseForm): number[] {
  const n = seq.length * 12
  const cover = new Array<number>(n).fill(0)
  const put = (i: number, f: number) => {
    const k = ((i % n) + n) % n
    cover[k] = Math.max(cover[k], f)
  }
  seq.forEach((id, s) => {
    const crop = form(id)
    if (crop.perennial) {
      for (let m = 0; m < 12; m++) put(s * 12 + m, canopyCover(crop.kc[m]))
      return
    }
    for (const m of cropSeason(crop, hemi, normals)) put((s + m.yearOffset) * 12 + m.month - 1, canopyCover(m.kc))
  })
  if (catchCrops) {
    seq.forEach((id, s) => {
      const a = form(id)
      const b = form(seq[(s + 1) % seq.length])
      if (!catchWindow(a, b)) return
      const from = s * 12 + harvestMonthIndex(a, hemi, normals) + 2 // sown after harvest, covers a month later
      const to = (s + 1) * 12 + sowMonthIndex(b, hemi, normals) - 1
      for (let i = from; i <= to; i++) put(i, i === from ? 0.35 : 0.6)
    })
  }
  return cover
}

export type CoverFigures = {
  /** share of the year's erosive rain energy that falls on soil the canopy does not cover */
  exposed: number
  /** months per year with less than 30 % cover */
  bareMonths: number
  /** mean cover of each calendar month over the cycle */
  monthly: number[]
}

export function coverFigures(cycle: number[], erosivity: number[]): CoverFigures {
  const seasons = cycle.length / 12
  const monthly = Array.from({ length: 12 }, (_, m) => {
    let s = 0
    for (let y = 0; y < seasons; y++) s += cycle[y * 12 + m]
    return s / seasons
  })
  const total = erosivity.reduce((a, b) => a + b, 0)
  let hit = 0
  cycle.forEach((f, i) => { hit += erosivity[i % 12] * (1 - f) })
  return {
    exposed: total > 0 ? hit / (total * seasons) : NaN,
    bareMonths: cycle.filter((f) => f < 0.3).length / seasons,
    monthly,
  }
}

// ---------- the whole outlook for one rotation ----------

export type SoilOutlook = {
  /** humified carbon added per season, t C/ha (what the old pool gains before decay) */
  humified: number
  /** fresh carbon returned per season, t C/ha */
  returned: number
  /** ΔSOC vs the reference rotation, t C/ha, year 1…years */
  delta: number[]
  cover: CoverFigures | null
}

export type OutlookInput = { seq: CropId[]; shares: number[] }

export function soilOutlook(
  input: OutlookInput,
  ref: OutlookInput,
  opts: { re: number; years: number; hemi: Hemisphere; normals?: MonthNormal[]; erosivity: number[] | null; strawRemoved: boolean; catchCrops: boolean; form?: FormOf },
): SoilOutlook {
  const form = opts.form ?? baseForm
  const inputsOf = (x: OutlookInput) =>
    x.seq.map((id, i) => {
      const c = carbonInputs(form(id), x.shares[i], opts.strawRemoved)
      const next = form(x.seq[(i + 1) % x.seq.length])
      if (opts.catchCrops && catchWindow(form(id), next)) return { ag: c.ag + CATCH_INPUT.ag, bg: c.bg + CATCH_INPUT.bg }
      return c
    })
  const mine = inputsOf(input)
  const theirs = inputsOf(ref)
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return {
    humified: avg(mine.map(humified)),
    returned: avg(mine.map((c) => c.ag + c.bg)),
    delta: icbmDifference(mine, theirs, opts.re, opts.years),
    cover: opts.erosivity ? coverFigures(coverCycle(input.seq, opts.hemi, opts.normals, opts.catchCrops, form), opts.erosivity) : null,
  }
}

/** The 4 per 1000 initiative's yardstick: SOC growth as ‰ of the stock per year. */
export const perMille = (deltaT: number, stock: number, years: number) => (stock > 0 ? (1000 * deltaT) / stock / years : NaN)
