// The practice prior of mode C, as arithmetic only (no imports from the engine at run time, so rotation.ts and
// practice.ts can both use it).
//
// log score = log science + push, push = clamp(lambda x log(prior / uniform), +-log cap), the prior being the practice
// share of the crop (smoothed by PRIOR_FLOOR) and uniform 1 / the number of candidates - a crop at an average share is
// not moved. A crop the science rates implausible (under PLAUSIBLE of the best scientific score here) gains on no
// plausible crop: its push is at most the smallest a plausible crop gets. A season that sells nothing (a cover crop, a
// bare fallow) is in no crop map: it keeps its push but sets neither that bar nor that floor - else a high-scoring
// fallow decided which crops practice may lift (the evaluations switch both off, so they are unchanged).
import type { CropId } from './crops'
import type { FieldPractice } from './fieldPractice'

export const PLAUSIBLE = 0.5
export const PRIOR_FLOOR = 0.002

/** what mode C pushes the science toward, and how hard */
export type PracticePrior = {
  /** practice shares per crop (any scale - normalised over the candidates) */
  shares: Partial<Record<CropId, number>>
  lambda: number
  /** the largest factor the prior moves a score by, either way */
  cap: number
  /** where the shares come from: CROPGRIDS around the field, the country's FAOSTAT mix, or (field) the crop maps of the
   *  field and the fields around it, with the neighbours' rotations - read again for each history (fieldPractice.ts) */
  source: 'region' | 'country' | 'field'
  field?: FieldPractice
}

/**
 * The region's practice: CROPGRIDS harvested area in a square ring of 0.5-degree cells 2 to 4 cells from the field's
 * own cell (about 100-250 km; the cell and its neighbours left out). Setting chosen on the 217 development cells
 * and confirmed on 48 fresh cells (pre-registered check I: mean rank of
 * the crop grown most 1.50, top-3 98 %, no catastrophic miss; the country's mix as the prior 2.04 / 85 % there).
 */
export const REGION_RING: [number, number] = [2, 4]
export const REGION_LAMBDA = 1
export const REGION_CAP = 16
/** the country's FAOSTAT mix where CROPGRIDS has nothing around (checks F and G) */
export const COUNTRY_LAMBDA = 0.3
export const COUNTRY_CAP = 2

/** the push of each candidate, in the order given (pure: the same numbers practicePosterior sorts by) */
export function posteriorPushes(ranking: { crop: { id: CropId; econ?: { yield: number } }; science: number }[], shares: Partial<Record<CropId, number>>, lambda: number, capFactor: number): number[] {
  const n = ranking.length
  const total = ranking.reduce((a, e) => a + (shares[e.crop.id] ?? 0), 0)
  const sold = ranking.map((e) => (e.crop.econ?.yield ?? 1) > 0)
  const best = Math.max(0, ...ranking.filter((_, i) => sold[i]).map((e) => e.science))
  const cap = Math.log(capFactor)
  const raw = ranking.map((e) => {
    const share = shares[e.crop.id] ?? 0
    const push = total > 0 ? lambda * Math.log(((share + PRIOR_FLOOR) / (total + PRIOR_FLOOR * n)) * n) : 0
    return Math.max(-cap, Math.min(cap, push))
  })
  const plausible = ranking.map((e, i) => sold[i] && e.science >= PLAUSIBLE * best)
  const floor = Math.min(0, ...raw.filter((_, i) => plausible[i]))
  return raw.map((p, i) => (plausible[i] || !sold[i] ? p : Math.min(p, floor)))
}

/**
 * The prior as a factor per crop, at most 1: e^(push - the largest push). Scores times these factors order the crops
 * exactly as science x e^push; the crop practice favours most keeps its scientific score and every other one loses
 * what practice holds against it - the share of the score the page shows as lost to practice.
 */
export function practiceFactors(ranking: { crop: { id: CropId }; science: number }[], prior: PracticePrior): Map<CropId, number> {
  const pushes = posteriorPushes(ranking, prior.shares, prior.lambda, prior.cap)
  const top = Math.max(...pushes)
  return new Map(ranking.map((e, i) => [e.crop.id, Math.exp(pushes[i] - top)]))
}
