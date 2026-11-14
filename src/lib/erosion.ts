// How erodible this field is - the field's half of the soil-erosion question.
//
// RUSLE (Renard et al. 1997, USDA Agriculture Handbook 703) writes water erosion as A = R·K·LS·C·P. R, K and LS
// belong to the field; only C, the cover-management term, depends on the crop. The field's half is computed here:
//
// · Water: the bare-soil potential R·K·LS in t/ha a year (C = P = 1) - R from the modified Fournier index of the
//   NASA POWER monthly rain (Renard & Freimund 1994), K from topsoil texture and organic carbon (EPIC; Williams
//   1995), LS from the terrain slope (McCool et al. 1987, 1989) over an assumed 100 m slope. An order of magnitude,
//   not a measurement: R comes from a US regression (in Europe it runs high - the measured European mean is
//   722 MJ mm ha⁻¹ h⁻¹ yr⁻¹; Panagos et al. 2015) and the slope length is not known.
// · Wind: the erodible fraction of the topsoil (dry aggregates < 0.84 mm; Fryrear et al. 1994). No wind-speed data
//   goes in, and the equation fits some regions' soils poorly (López et al. 2007, Spain and Argentina).
//
// The crop's half stays a ranked judgement (`coverGap`, 0 = a sward, 1 = bare for months), ordered like published
// C-factors - winter cereals and rapeseed low, row crops high (German values: winter wheat 0.12, maize 0.35; HLNUG,
// DIN 19708). A month-by-month canopy × NASA-storm version was tried and rejected: on the Torgau field it put winter
// wheat above maize, against those measured factors, because it ignores residue and soil consolidation and the
// reanalysis rain puts too much storm energy into late summer. It is not used until it can be checked.

import type { MonthNormal } from './climate'
import type { SoilProfile } from './soil'
import { clamp } from './stats'

/** Mean rainfall erosivity of Europe, MJ mm ha⁻¹ h⁻¹ yr⁻¹ (Panagos et al. 2015, 1541 stations) - used when R is unknown. */
export const R_EUROPE = 722
/** Slope length assumed when only the slope is known, m. */
export const SLOPE_LENGTH_M = 100
/** Slope assumed while the terrain model has not answered, %. */
export const SLOPE_UNKNOWN_PCT = 1
/** Bare-soil water potential (t/ha/yr) at which a field counts as fully susceptible in the score. */
export const WATER_FULL_T = 30
/** Wind-erodible fraction from which the topsoil starts to count as blowing, and the span to "fully". */
export const WIND_EF_LOW = 0.25
export const WIND_EF_SPAN = 0.35

/** US-customary EPIC K → SI (t·ha·h / (ha·MJ·mm)). */
const K_TO_SI = 0.1317

/** Soil erodibility K (SI units) from sand, silt, clay (%) and organic carbon (%) - EPIC, Williams (1995). */
export function kFactor(sand: number, silt: number, clay: number, ocPct: number): number {
  const sn = 1 - sand / 100
  const fSand = 0.2 + 0.3 * Math.exp(-0.256 * sand * (1 - silt / 100))
  const fClSi = (silt / Math.max(1e-6, clay + silt)) ** 0.3
  const fOrgC = 1 - (0.25 * ocPct) / (ocPct + Math.exp(3.72 - 2.95 * ocPct))
  const fHiSand = 1 - (0.7 * sn) / (sn + Math.exp(-5.51 + 22.9 * sn))
  return fSand * fClSi * fOrgC * fHiSand * K_TO_SI
}

/** RUSLE slope length-steepness factor for a uniform slope (McCool et al. 1987 for S, 1989 for the L exponent). */
export function lsFactor(slopePct: number, lengthM = SLOPE_LENGTH_M): number {
  const sin = Math.sin(Math.atan(Math.max(0, slopePct) / 100))
  const s = slopePct < 9 ? 10.8 * sin + 0.03 : 16.8 * sin - 0.5
  const beta = sin / 0.0896 / (3 * sin ** 0.8 + 0.56)
  const m = beta / (1 + beta)
  return (lengthM / 22.13) ** m * s
}

/** R from the modified Fournier index F = Σ p²/P (Arnoldus 1980; Renard & Freimund 1994), MJ mm ha⁻¹ h⁻¹ yr⁻¹. */
export function rFactor(normals: MonthNormal[]): number {
  const P = normals.reduce((a, m) => a + Math.max(0, m.p), 0)
  if (P <= 0) return 0
  const F = normals.reduce((a, m) => a + Math.max(0, m.p) ** 2, 0) / P
  return F < 55 ? 0.7397 * F ** 1.847 : 95.77 - 6.081 * F + 0.477 * F ** 2
}

/** Wind-erodible fraction of the topsoil (0-1), Fryrear et al. (1994); organic matter taken as 1.724 × organic carbon. */
export function erodibleFraction(sand: number, silt: number, clay: number, ocPct: number, caco3 = 0): number {
  const om = 1.724 * ocPct
  return clamp((29.09 + 0.31 * sand + 0.17 * silt + (0.33 * sand) / Math.max(1, clay) - 2.59 * om - 0.95 * caco3) / 100)
}

export type FieldErodibility = {
  r: number // rainfall erosivity, MJ mm ha⁻¹ h⁻¹ yr⁻¹
  rFrom: 'fournier' | 'europe-mean'
  k: number // soil erodibility, t·ha·h/(ha·MJ·mm)
  ls: number
  slopePct: number
  slopeKnown: boolean
  /** bare-soil water-erosion potential R·K·LS, t/ha/yr */
  potential: number
  /** wind-erodible fraction of the topsoil, 0-1 */
  ef: number
  /** 0-1: how much bare soil costs on this field, by water and by wind, and either */
  water: number
  wind: number
  either: number
}

export function fieldErodibility(soil: SoilProfile, slopePct: number | null, r: number | null | undefined): FieldErodibility {
  const t = soil.top
  const oc = t.soc / 10
  const k = kFactor(t.sand, t.silt, t.clay, oc)
  const slope = slopePct ?? SLOPE_UNKNOWN_PCT
  const ls = lsFactor(slope)
  const R = r ?? R_EUROPE
  const potential = R * k * ls
  const ef = erodibleFraction(t.sand, t.silt, t.clay, oc)
  const water = clamp(potential / WATER_FULL_T)
  // wind weighs a little less: without wind-speed data we only know the soil could blow
  const wind = clamp((ef - WIND_EF_LOW) / WIND_EF_SPAN)
  return {
    r: R, rFrom: r == null ? 'europe-mean' : 'fournier', k, ls, slopePct: slope, slopeKnown: slopePct != null, potential, ef,
    water, wind, either: 1 - (1 - water) * (1 - 0.6 * wind),
  }
}

/**
 * How well a crop protects this field, 0-1, for the soil score: bare soil always costs something (crusting, organic
 * matter and nutrients washed off - 0.3), the rest scales with how erodible the field is.
 */
export const protection = (coverGap: number, f: FieldErodibility) => clamp(1 - coverGap * (0.3 + 0.7 * f.either))
