// Which NASA observation decided the pick? A counterfactual on the field's own record.
//
// The recent decade is re-run with the mean shift since 1981-2010 taken out - month by month, the same
// delta-change method as the what-if scenarios but in reverse: temperature lowered by how much warmer that
// calendar month has become (dew point with it, so relative humidity holds and Penman-Monteith ET₀ follows),
// rain scaled back by how much wetter or drier it has become. Year-to-year variability - which seasons were
// droughts - stays as observed; only the trend goes. Daily heat at flowering is shifted by the same monthly ΔT.
//
// Three runs: without the warming, without the rain shift, without either. If the pick changes, the climate
// shift NASA POWER recorded on this field is what decided it; if it holds, the pick rests on soil, rotation and
// priorities, and the NASA record mainly sizes the risks.

import type { ClimateAnalysis } from './climate'
import type { CropId } from './crops'
import type { Daily } from './dailyFormat'
import { withDailyExtremes } from './extremes'
import { rankNext, type FieldContext, type Priorities } from './rotation'
import { warmClimate } from './scenario'
import type { SoilProfile } from './soil'
import { allCropRisks } from './water'

export type Counterfactual = {
  key: 'no-warming' | 'no-rain-shift' | 'no-shift'
  label: string
  /** the monthly change that was taken out: ΔT (°C) and rain ratio − 1, Jan…Dec */
  removed: { dT: number[]; rain: number[] }
  pick: CropId
  pickScore: number // score of the observed pick in this counterfactual
  top3: { id: CropId; score: number }[]
}

export type Causal = {
  pick: CropId
  pickScore: number
  shift: { dT: number[]; rain: number[] } // recent − baseline, per calendar month
  runs: Counterfactual[]
  /** crops the observed shift lifted or pushed down most: score now minus score without any shift */
  movers: { id: CropId; delta: number; rankNow: number; rankWithout: number }[]
  /** the observation that decided it, in one line */
  verdict: string
}

/** Recent-minus-baseline change per calendar month: ΔT (°C) and relative rain change. */
export function monthlyShift(climate: ClimateAnalysis): { dT: number[]; rain: number[] } {
  const by = (xs: ClimateAnalysis['monthly']['recent'], m: number) => xs.find((x) => x.month === m)
  const dT: number[] = []
  const rain: number[] = []
  for (let m = 1; m <= 12; m++) {
    const r = by(climate.monthly.recent, m)
    const b = by(climate.monthly.baseline, m)
    dT.push(r && b ? r.t - b.t : 0)
    rain.push(r && b && r.p > 0 ? b.p / r.p - 1 : 0) // the scaling that takes recent rain back to the baseline mean
  }
  return { dT, rain }
}

export function traceNasa(
  history: (CropId | null)[], ctx: FieldContext, w: Priorities, exclude: Set<CropId>, climate: ClimateAnalysis, soil: SoilProfile, daily: Daily | null,
): Causal | null {
  const nominal = rankNext(history, ctx, w, exclude)
  if (!nominal[0]) return null
  const pick = nominal[0].crop.id
  const shift = monthlyShift(climate)
  const minusT = shift.dT.map((x) => -x)
  const zero = shift.dT.map(() => 0)
  const variants: { key: Counterfactual['key']; label: string; dT: number[]; rain: number[] }[] = [
    { key: 'no-warming', label: 'without the warming since 1981-2010', dT: minusT, rain: zero },
    { key: 'no-rain-shift', label: 'without the change in rain', dT: zero, rain: shift.rain },
    { key: 'no-shift', label: 'without any climate shift', dT: minusT, rain: shift.rain },
  ]
  let withoutAll: ReturnType<typeof rankNext> = []
  const runs = variants.map((v): Counterfactual => {
    const cf = warmClimate(climate, { dT: v.dT, rain: v.rain })
    let risks = allCropRisks(cf, soil, ctx.irrigated ? 0 : ctx.budget ?? 0, ctx.co2?.transpiration ?? 1)
    if (daily) risks = withDailyExtremes(risks, daily, cf, v.dT)
    const ranked = rankNext(history, { ...ctx, risks, drying: false }, w, exclude)
    if (v.key === 'no-shift') withoutAll = ranked
    const mine = ranked.find((e) => e.crop.id === pick)
    return {
      key: v.key,
      label: v.label,
      removed: { dT: v.dT.map((x) => -x), rain: v.rain },
      pick: ranked[0]?.crop.id ?? pick,
      pickScore: mine?.score ?? 0,
      top3: ranked.slice(0, 3).map((e) => ({ id: e.crop.id, score: e.score })),
    }
  })
  const rankOf = (list: ReturnType<typeof rankNext>, id: CropId) => list.findIndex((e) => e.crop.id === id) + 1
  const movers = nominal
    .map((e) => ({ id: e.crop.id, delta: e.score - (withoutAll.find((x) => x.crop.id === e.crop.id)?.score ?? e.score), rankNow: rankOf(nominal, e.crop.id), rankWithout: rankOf(withoutAll, e.crop.id) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6)
  const flipped = runs.filter((r) => r.pick !== pick)
  const all = runs.find((r) => r.key === 'no-shift')!
  const verdict = flipped.length
    ? `The climate shift decided it: ${flipped.map((r) => r.label).join(' and ')}, a different crop would come first.`
    : Math.abs(all.pickScore - nominal[0].score) >= 3
      ? `The pick holds without the climate shift, but the shift moved its score by ${(nominal[0].score - all.pickScore).toFixed(1)} points.`
      : 'The pick holds without the climate shift: it rests on soil, rotation and your priorities; the NASA record sizes the risks.'
  return { pick, pickScore: nominal[0].score, shift, runs, movers, verdict }
}
