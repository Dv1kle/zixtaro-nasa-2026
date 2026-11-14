// Insect pressure from warmth. Insect development runs on degree-days; many crop pests develop above ≈ 10 °C, so the
// season's degree-days above 10 °C are a proxy for how many generations pests can fit in. Deutsch et al. (2018,
// Science 361:916) project maize, rice and wheat yield losses to insects to rise 10-25 % per °C of global warming,
// through faster population growth and metabolism. A regional proxy from NASA POWER monthly means - not a pest
// forecast for this field, and silent on any particular species.
import type { ClimateAnalysis } from './climate'

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Degree-days above 10 °C per year from monthly means (undercounts in cool months). */
export function insectDegreeDays(climate: ClimateAnalysis, w: { from: number; to: number }): number {
  let sum = 0
  let years = 0
  for (let y = w.from; y <= w.to; y++) {
    let dd = 0
    let ok = true
    for (let m = 1; m <= 12; m++) {
      const r = climate.byMonth.get(`${y}-${m}`)
      if (!r) {
        ok = false
        break
      }
      dd += Math.max(0, r.t - 10) * DAYS[m - 1]
    }
    if (ok) {
      sum += dd
      years++
    }
  }
  return years ? sum / years : NaN
}

export type InsectPressure = { baseline: number; recent: number; change: number; dT: number; lossRise: [number, number] }

export function insectPressure(climate: ClimateAnalysis): InsectPressure | null {
  const baseline = insectDegreeDays(climate, climate.baseline)
  const recent = insectDegreeDays(climate, climate.recent)
  if (!Number.isFinite(baseline) || !Number.isFinite(recent) || baseline <= 0) return null
  const dT = climate.means.recent.t - climate.means.baseline.t
  // Deutsch et al. 2018: +10 to +25 % insect losses per °C of (global) warming - shown as the range the local shift suggests
  return { baseline, recent, change: recent / baseline - 1, dT, lossRise: [Math.max(0, 10 * dT), Math.max(0, 25 * dT)] }
}
