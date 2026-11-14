// Does "holds in 80 % of variations" mean anything? A calibration of the confidence against the weather that came.
//
// The Monte Carlo share says how robust a decision based on the recent decade is. The fair test of that claim is
// out of sample: for a decision year D, rank the crops with only the record up to D − 2 (as the backtest does), note
// the pick and its share, then re-rank once the ten seasons D … D + 9 have been observed - the same engine, same
// soil, same priorities, only the weather now known. Was the pick still first? Over many decisions, picks called
// "holds in 80-100 %" should still be first about that often. Two shares are tested: the app's (soil, seasons, Ky,
// prices and priorities all varied) and weather-only (seasons resampled), the part the check can actually verify.
//
// Caveats, stated with the result: decisions a year apart share nine of their ten verifying seasons, so they are not
// independent; the truth is the model's own ranking on observed weather, not harvests; and five fields are few.

import { analyzeClimate, type ClimateAnalysis } from './climate'
import type { CropId } from './crops'
import { rFactor } from './erosion'
import { winterDrainage } from './nitrate'
import { pickConfidence, VARY_ALL, type Vary } from './robust'
import { rankNext, type FieldContext, type Priorities } from './rotation'
import type { SoilProfile } from './soil'
import { allCropRisks } from './water'

export type CalibrationRow = {
  site: string
  decided: number // the first harvest year the decision is for
  dataTo: number
  pick: CropId
  share: number // Monte Carlo share, everything varied
  shareWeather: number // Monte Carlo share, seasons only
  truth: CropId // first once D … D+9 were observed
  hit: boolean
  top2: boolean
}

export const VARY_WEATHER: Vary = { soil: false, seasons: true, ky: false, prices: false, priorities: false }
export const HORIZON = 10

function contextFor(climate: ClimateAnalysis, soil: SoilProfile): FieldContext {
  return {
    risks: allCropRisks(climate, soil),
    soil,
    stressYear: null,
    irrigated: false,
    drying: climate.signal.drying,
    slopePct: null,
    winterDrain: winterDrainage(climate, soil),
    erosivity: rFactor(climate.monthly.recent),
    recentLabel: `${climate.recent.from}-${climate.recent.to}`,
    baselineLabel: `${climate.baseline.from}-${climate.baseline.to}`,
  }
}

/** Every decision year whose next ten seasons are in the record. `runs` Monte Carlo draws per decision. */
export function calibrateSite(
  site: string, climate: ClimateAnalysis, soil: SoilProfile, history: (CropId | null)[], w: Priorities, exclude: Set<CropId>,
  opts: { from?: number; runs?: number } = {},
): CalibrationRow[] {
  const recs = [...climate.byMonth.values()]
  const rows: CalibrationRow[] = []
  const last = climate.lastYear - HORIZON + 1
  for (let d = opts.from ?? 2000; d <= last; d++) {
    let past: ClimateAnalysis
    let seen: ClimateAnalysis
    try {
      past = analyzeClimate(recs.filter((r) => r.year <= d - 2), climate.lat, climate.lon)
      seen = analyzeClimate(recs.filter((r) => r.year <= d + HORIZON - 1), climate.lat, climate.lon)
    } catch {
      continue
    }
    if (seen.recent.from !== d) continue // the verifying window must be exactly D … D+9
    const ctx = contextFor(past, soil)
    const nominal = rankNext(history, ctx, w, exclude)[0]
    if (!nominal) continue
    const all = pickConfidence(history, ctx, w, exclude, past, opts.runs ?? 120, VARY_ALL)
    const weather = pickConfidence(history, ctx, w, exclude, past, opts.runs ?? 120, VARY_WEATHER)
    const truthRank = rankNext(history, contextFor(seen, soil), w, exclude)
    const pick = nominal.crop.id
    rows.push({
      site, decided: d, dataTo: d - 2, pick,
      share: all?.shares.find((x) => x.id === pick)?.share ?? 0,
      shareWeather: weather?.shares.find((x) => x.id === pick)?.share ?? 0,
      truth: truthRank[0].crop.id,
      hit: truthRank[0].crop.id === pick,
      top2: truthRank.slice(0, 2).some((e) => e.crop.id === pick),
    })
  }
  return rows
}

export type Bin = { from: number; to: number; n: number; meanShare: number; hitRate: number }
export type Reliability = { bins: Bin[]; brier: number; brierClimatology: number; n: number; hitRate: number }

/** Reliability table and Brier score of a share used as the probability that the pick stays first. */
export function reliability(rows: CalibrationRow[], key: 'share' | 'shareWeather', edges = [0, 0.5, 0.7, 0.9, 1.0001]): Reliability {
  const n = rows.length
  const hitRate = n ? rows.filter((r) => r.hit).length / n : NaN
  const bins: Bin[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const inBin = rows.filter((r) => r[key] >= edges[i] && r[key] < edges[i + 1])
    bins.push({
      from: edges[i], to: Math.min(1, edges[i + 1]), n: inBin.length,
      meanShare: inBin.length ? inBin.reduce((a, r) => a + r[key], 0) / inBin.length : NaN,
      hitRate: inBin.length ? inBin.filter((r) => r.hit).length / inBin.length : NaN,
    })
  }
  const brier = n ? rows.reduce((a, r) => a + (r[key] - +r.hit) ** 2, 0) / n : NaN
  // the reference forecast: always say the overall hit rate
  const brierClimatology = n ? rows.reduce((a, r) => a + (hitRate - +r.hit) ** 2, 0) / n : NaN
  return { bins, brier, brierClimatology, n, hitRate }
}
