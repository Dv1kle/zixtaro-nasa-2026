// Shared test fixtures: the demo fields from their pre-baked bundles, and a synthetic monsoon climate.
import { readFileSync } from 'node:fs'
import { analyzeClimate, analyzeClimate as analyze, parsePowerMonthly, type MonthRec } from './climate'
import { analyzeDaily } from './daily'
import { PRESETS } from './presets'
import type { FieldContext } from './rotation'
import { averageProfiles, parseSoilGrids } from './soil'
import { allCropRisks } from './water'

export function load(id: string) {
  const p = PRESETS.find((x) => x.id === id)!
  const b = JSON.parse(readFileSync(`public/data/presets/${p.bundle ?? p.id}.json`, 'utf8'))
  const climate = analyzeClimate(parsePowerMonthly(b.power, p.field.lat), p.field.lat, p.field.lon)
  const soil = averageProfiles(b.soil.map(parseSoilGrids), b.samples)
  const risks = allCropRisks(climate, soil)
  const ctx: FieldContext = {
    risks, soil, stressYear: null, irrigated: false, drying: climate.signal.drying, slopePct: 0.5,
    recentLabel: `${climate.recent.from}-${climate.recent.to}`, baselineLabel: `${climate.baseline.from}-${climate.baseline.to}`,
  }
  const daily = analyzeDaily(b.daily, p.field.lat)!
  return { p, climate, soil, risks, ctx, daily }
}

/**
 * A synthetic field from twelve monthly normals (Jan…Dec), 1981-2025 with a small deterministic year-to-year wobble in
 * rain. `tRange` is the mean daily temperature range (daily min = t − tRange/2).
 */
export function syntheticClimate(o: { lat: number; lon: number; t: number[]; p: number[]; pet: number[]; tRange?: number }) {
  const recs: MonthRec[] = []
  for (let y = 1981; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) {
      const wob = 1 + 0.25 * Math.sin(y * 1.7 + m)
      recs.push({
        year: y, month: m, p: o.p[m - 1] * wob, t: o.t[m - 1], tRange: o.tRange ?? 12, tMaxAbs: o.t[m - 1] + 12,
        w: NaN, pet: o.pet[m - 1], petMethod: 'hargreaves', rs: NaN, tDew: NaN, wind: NaN, ps: NaN,
      })
    }
  }
  return analyze(recs, o.lat, o.lon)
}

/** Northern Kazakhstan-like steppe (51° N): winters near −15 °C, 350 mm of rain, most of it in summer. */
export const steppeClimate = () =>
  syntheticClimate({
    lat: 51.25, lon: 65.75,
    t: [-16, -14, -6, 6, 14, 19, 21, 19, 12, 4, -5, -13],
    p: [22, 20, 22, 26, 34, 38, 50, 38, 26, 30, 30, 24],
    pet: [3, 5, 20, 78, 146, 169, 180, 154, 97, 49, 14, 5],
  })

/** A Saskatchewan prairie field (52.75° N, 104.75° W; NASA POWER 2016-2025 normals): long frozen winters, cool summers. */
export const prairieClimate = () =>
  syntheticClimate({
    lat: 52.75, lon: -104.75, tRange: 11,
    t: [-16, -16, -7, 2, 11, 16, 19, 18, 13, 3, -7, -15],
    p: [21, 14, 25, 26, 51, 88, 54, 62, 37, 33, 32, 17],
    pet: [2, 5, 21, 62, 109, 128, 145, 123, 82, 38, 11, 3],
  })

/** A West African wet-tropics field (Kindia, Guinea, 10.25° N; NASA POWER 2016-2025 normals): 3.7 m of rain May-October. */
export const guineaClimate = () =>
  syntheticClimate({
    lat: 10.25, lon: -13.25, tRange: 9,
    t: [27, 29, 30, 30, 28, 26, 24, 24, 24, 25, 25, 25],
    p: [1, 1, 3, 24, 200, 393, 1055, 1074, 584, 287, 46, 2],
    pet: [154, 169, 213, 206, 164, 115, 92, 88, 97, 113, 114, 130],
  })

/** The Mexican plateau (Tlaxcala, 19.25° N, ~2 300 m): tropical latitude, temperate warmth, summer rains. */
export const highlandClimate = () =>
  syntheticClimate({
    lat: 19.25, lon: -97.75, tRange: 15,
    t: [12, 13, 15, 17, 18, 18, 17, 17, 17, 15, 14, 12],
    p: [8, 6, 10, 30, 70, 150, 140, 140, 130, 50, 10, 5],
    pet: [100, 115, 150, 160, 165, 140, 130, 125, 110, 100, 90, 85],
  })

/** The Nigerian cassava belt (Enugu, 7.25° N): hot and wet April-October. */
export const nigeriaClimate = () =>
  syntheticClimate({
    lat: 7.25, lon: 7.75, tRange: 9,
    t: [27, 29, 29, 28, 27, 26, 25, 25, 25, 26, 27, 27],
    p: [15, 25, 80, 150, 220, 250, 230, 210, 280, 220, 40, 10],
    pet: [140, 145, 160, 150, 140, 120, 110, 110, 115, 125, 130, 135],
  })

/** Central India-like monsoon field north of the tropic (24° N): rains June-September, dry hot spring. */
export const monsoonNorthClimate = () =>
  syntheticClimate({
    lat: 24.25, lon: 81.75,
    t: [16, 20, 26, 32, 35, 34, 29, 27, 27, 24, 20, 16],
    p: [10, 9, 15, 6, 34, 126, 303, 304, 176, 38, 2, 10],
    pet: [91, 122, 182, 236, 260, 225, 138, 109, 106, 113, 91, 79],
  })

/** A synthetic monsoon field (Sahel-like, 12° N): rains June-September, 25-32 °C. */
export function monsoonClimate(rainByMonth = [0, 0, 5, 15, 60, 130, 220, 260, 150, 25, 0, 0]) {
  const recs: MonthRec[] = []
  for (let y = 1981; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) {
      const wob = 1 + 0.25 * Math.sin(y * 1.7 + m) // year-to-year variation, deterministic
      recs.push({
        year: y, month: m, p: rainByMonth[m - 1] * wob, t: 25 + 4 * Math.sin(((m - 3) / 12) * 2 * Math.PI), tRange: 12, tMaxAbs: 40,
        w: NaN, pet: m >= 6 && m <= 9 ? 140 : 190, petMethod: 'hargreaves', rs: NaN, tDew: NaN, wind: NaN, ps: NaN,
      })
    }
  }
  return analyze(recs, 12, 8.5)
}
