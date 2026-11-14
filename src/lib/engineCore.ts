// The heavy analyses behind one recommendation, as one job: the Monte Carlo, one-at-a-time sensitivity, the NASA
// counterfactual and the sowing-window search. Runs in a Web Worker (engine.worker.ts) and, where workers are not
// available, on the main thread - the same code either way.
import type { CropId } from './crops'
import type { ClimateAnalysis } from './climate'
import type { Daily } from './dailyFormat'
import { traceNasa, type Causal } from './causal'
import { pickConfidence, sensitivity, type Confidence, type Sensitivity } from './robust'
import { rankNext, type FieldContext, type Priorities } from './rotation'
import { co2Effect, type WhatIf } from './scenario'
import type { SoilProfile } from './soil'
import { sowingAdvice, type SowAdvice } from './sowing'
import { sobolGap, type SobolGap } from './sobol'

/** Everything a job needs, structured-clone safe (the CO₂ effect is rebuilt from its settings, not sent as code). */
export type EngineJob = {
  history: (CropId | null)[]
  ctx: Omit<FieldContext, 'co2'>
  whatIf: WhatIf
  co2On: boolean
  w: Priorities
  exclude: CropId[]
  climate: ClimateAnalysis
  soil: SoilProfile
  daily: Daily | null
  irrigated: boolean
  budget: number
}
export type EngineResult = { confidence: Confidence | null; sens: Sensitivity | null; sobol?: SobolGap | null; causal: Causal | null; sowing: SowAdvice[] | null }
export type Phase = keyof EngineResult

/** The phases in the order the page needs them; each returns its part of the result. */
export function phases(j: EngineJob): [Phase, () => unknown][] {
  const co2 = co2Effect(j.whatIf, j.co2On)
  const ctx: FieldContext = { ...j.ctx, co2 }
  const ex = new Set(j.exclude)
  return [
    ['confidence', () => pickConfidence(j.history, ctx, j.w, ex, j.climate)],
    ['sens', () => sensitivity(j.history, ctx, j.w, ex, j.climate, j.soil)],
    ['sobol', () => sobolGap(j.history, ctx, j.w, ex, j.climate)],
    ['causal', () => traceNasa(j.history, ctx, j.w, ex, j.climate, j.soil, j.daily)],
    ['sowing', () => sowingAdvice(rankNext(j.history, ctx, j.w, ex).slice(0, 10).map((e) => e.crop.id), j.climate, j.soil, j.daily, j.irrigated ? 0 : j.budget, co2?.transpiration ?? 1).slice(0, 6)],
  ]
}
