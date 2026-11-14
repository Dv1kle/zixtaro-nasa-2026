// Three views of one field, kept apart on purpose (forensic audit, modes A / B / C):
//  A. the scientific ranking - climate, soil, water and money; no prevalence in it. Earlier, it carried the
//     national proof (LOCAL_PROOF: is the crop harvested at scale in this country?) as a gate on the score; that is
//     observed practice, and it now lives only in C
//  B. observed practice - what farms around it grow (CROPGRIDS 2020, localCrops.ts)
//  C. practice-informed - the scientific score × a visible prior: the national proof (1, 0.8 for a niche or a crop
//     only the neighbours harvest, 0.5 for one only the world does) × (1 + PRACTICE_WEIGHT × √share of the land
//     around). Evidence of markets, machinery and know-how the model cannot see, not the answer.
// And the bridge between 1 and 2: why the model disagrees with what farms grow most - its own numbers, not a guess.
// Blind validation: the model has no share information beyond a country's crop mix, but it does tell
// where within a country its important crops are grown or not (AUC 0.65); a prior from the country's mix never beat
// the mix itself at naming the main crop. So practice stays separate, and the prior stays small.
import { CROPS, type CropId, isCropId } from './crops'
import { weighed, type CropRisk } from './water'
import { MARKETS } from './markets'
import { compare, type Comparison } from './explain'
import { soilSuitability } from './gaez'
import type { LocalCrops } from './localCrops'
import { pct } from './format'
import { COUNTRY_CAP, COUNTRY_LAMBDA, PLAUSIBLE, posteriorPushes, PRIOR_FLOOR, REGION_CAP, REGION_LAMBDA, type PracticePrior } from './prior'
import { unpriced, type Evaluation, type FieldContext, type Note, type Priorities, type RotationFlag } from './rotation'

/** A crop grown on all the land around gains this share of its score; on a quarter of it, half of that. */
export const PRACTICE_WEIGHT = 0.25

/** A CROPGRIDS group as a model crop: its millet is pearl millet within 30° of the equator, proso millet beyond. */
export function practiceCrop(id: string, lat: number): CropId | null {
  const m = id === 'millet' ? (Math.abs(lat) < 30 ? 'pearlmillet' : 'millet') : id === 'bean' ? 'drybean' : id
  return isCropId(m) ? m : null
}

/** What farms around the field grow, as shares of the cell's harvested area per model crop. */
export function localShares(here: LocalCrops | null): Partial<Record<CropId, number>> {
  const out: Partial<Record<CropId, number>> = {}
  for (const c of here?.crops ?? []) {
    const id = practiceCrop(c.id, here!.cell.lat)
    if (id) out[id] = (out[id] ?? 0) + c.share
  }
  return out
}

/** One crop in mode C: its scientific score, the practice prior (national proof × local adoption) and the product. */
export type PracticeRank = { e: Evaluation; share: number; proof: number; prior: number; score: number; rank: number; was: number }

/** The practice prior of one crop: national proof × (1 + k × √share of the land around). */
export const practicePrior = (e: Evaluation, share: number, k = PRACTICE_WEIGHT) => e.proof * (1 + k * Math.sqrt(share))

/**
 * Mode C with the local prior: the scientific score × the practice prior, re-sorted (`was` = the rank it came in at).
 * `rotation` - what farms around sow after this field's last crops (rotationShares in rotationPrior.ts) - stands in for
 * the region's crop shares when the history is known: the same practice, conditioned on the field's own sequence.
 */
export function practiceInformed(ranking: Evaluation[], shares: Partial<Record<CropId, number>>, k = PRACTICE_WEIGHT, rotation?: Partial<Record<CropId, number>> | null): PracticeRank[] {
  return ranking
    .map((e, i) => {
      const share = (rotation ?? shares)[e.crop.id] ?? 0
      const prior = practicePrior(e, share, k)
      return { e, share, proof: e.proof, prior, score: e.science * prior, rank: 0, was: i + 1 }
    })
    .sort((a, b) => b.score - a.score || a.was - b.was)
    .map((x, i) => ({ ...x, rank: i + 1 }))
}

/**
 * Mode C as a bounded log-prior (accuracy plan): log score = log science + λ × log(prior / uniform), the
 * prior being the practice share of the crop (smoothed by PRIOR_FLOOR), uniform = 1 / the number of candidates - a crop
 * at an average share is not moved. Practice reorders plausible candidates; it cannot rescue a crop the science rates
 * implausible (under PLAUSIBLE of the best scientific score here: it gains on no plausible crop), and it never moves
 * a score by more than a factor PRIOR_CAP either way. λ, PLAUSIBLE and the cap were chosen among 9 settings on the
 * development cells with the country's FAOSTAT crop mix as the prior (217 CROPGRIDS cells, model 2026.10-heat: mean
 * rank 1.93, top-1 62 %, top-3 92 %, 1 catastrophic miss, against the mix alone 1.82 / 62 % / 91 %) and fixed before
 * any held-out check.
 */
export const PRIOR_LAMBDA = COUNTRY_LAMBDA
export const PRIOR_CAP = COUNTRY_CAP
export { PLAUSIBLE, PRIOR_FLOOR }

export type PosteriorRank = { e: Evaluation; share: number; push: number; score: number; rank: number; was: number }

export function practicePosterior(ranking: Evaluation[], shares: Partial<Record<CropId, number>>, lambda = PRIOR_LAMBDA, capFactor = PRIOR_CAP): PosteriorRank[] {
  const pushes = posteriorPushes(ranking, shares, lambda, capFactor)
  return ranking
    .map((e, i) => ({ e, share: shares[e.crop.id] ?? 0, push: pushes[i], score: e.science * Math.exp(pushes[i]), rank: 0, was: i + 1 }))
    .sort((a, b) => b.score - a.score || a.was - b.was)
    .map((x, i) => ({ ...x, rank: i + 1 }))
}

/** The CROPGRIDS mix around the field (localCrops' `region`, CROPGRIDS ids) on the model's crops - the practice prior
 *  of mode C where CROPGRIDS has cropland around; otherwise the country's mix (practiceFor). */
export function regionalShares(region: Record<string, number> | null | undefined, lat: number): Partial<Record<CropId, number>> {
  const out: Partial<Record<CropId, number>> = {}
  for (const [id, share] of Object.entries(region ?? {})) {
    const c = practiceCrop(id, lat)
    if (c) out[c] = (out[c] ?? 0) + share
  }
  return out
}

/** Mode C's prior for a field: the region's practice when CROPGRIDS has any modelled crop around it, else the country's */
export function practiceFor(region: Record<string, number> | null | undefined, lat: number, iso3: string): PracticePrior {
  const shares = regionalShares(region, lat)
  return Object.values(shares).some((v) => (v ?? 0) > 0)
    ? { shares, lambda: REGION_LAMBDA, cap: REGION_CAP, source: 'region' }
    : { shares: nationalShares(iso3), lambda: COUNTRY_LAMBDA, cap: COUNTRY_CAP, source: 'country' }
}

/** The country's harvested area of each modelled crop as a share of all of them (FAOSTAT production / yield, mean
 *  2019-2023) - the national level of practice, the prior mode C uses where nothing more local is known. */
export function nationalShares(iso3: string): Partial<Record<CropId, number>> {
  const area: Partial<Record<CropId, number>> = {}
  for (const c of CROPS) {
    const prod = MARKETS.trade[iso3]?.[c.id]?.[0] ?? 0
    const y = MARKETS.yields[iso3]?.[c.id] ?? 0
    if (prod > 0 && y > 0) area[c.id] = prod / y
  }
  const total = Object.values(area).reduce((a, b) => a + b, 0)
  return total > 0 ? Object.fromEntries(Object.entries(area).map(([k, v]) => [k, v / total])) : {}
}

/** The factors of the model's expected yield, 0..1 each (rotation.ts step 6 multiplies them). */
export type YieldFactors = { soil: number; warmth: number; water: number; heat: number; winter: number; wet: number; frost: number }

export function yieldFactors(e: Evaluation, ctx: FieldContext): YieldFactors {
  const r = ctx.risks[e.crop.id]
  // near a line the score mixed every variant (water.ts formsOf), so the factors mix them too
  const by = (g: (x: CropRisk) => number) => weighed(r, g)
  return {
    soil: soilSuitability(e.crop.id, ctx.soil).rating,
    warmth: by((x) => x.thermal.recent),
    water: ctx.irrigated || e.crop.ky <= 0 ? 1 : 1 - e.loss,
    heat: by((x) => 1 - 0.3 * x.heat.recent),
    winter: by((x) => 1 - 0.7 * x.cold.recent),
    wet: by((x) => 1 - 0.35 * x.wet.recent),
    frost: by((x) => 1 - 0.3 * (x.frost?.recent ?? 0)),
  }
}

export type Disagreement = {
  /** the modelled crop farms around grow most */
  grown: Evaluation
  share: number
  ourRank: number
  /** the model's pick against it: an exact Shapley split of the score gap (explain.ts) */
  cmp: Comparison
  factors: YieldFactors
  /** the weakest factor of its expected yield */
  weakest: { key: keyof YieldFactors; value: number }
  /** its harvest in the model against what farms in the country harvest (FAOSTAT), t/ha */
  harvest: number
  observed: number | null
  /**
   * close - the model ranks it in its top three; physics - one factor of the model's yield cuts it hard (drought, heat, winter, soil);
   * economics - it grows fine in the model but pays less than the pick at the reference prices and costs (food needs,
   * local markets and know-how are unseen)
   */
  verdict: 'close' | 'physics' | 'economics'
}

/** Why the model does not pick the crop farms around grow most - null when it does, or when nobody around farms. */
export function disagreement(ranking: Evaluation[], shares: Partial<Record<CropId, number>>, ctx: FieldContext, w: Priorities): Disagreement | null {
  const listed = ranking.filter((e) => (shares[e.crop.id] ?? 0) > 0).sort((a, b) => (shares[b.crop.id] ?? 0) - (shares[a.crop.id] ?? 0))
  const grown = listed[0]
  if (!grown || grown === ranking[0]) return null
  const factors = yieldFactors(grown, ctx)
  const weakestKey = (Object.keys(factors) as (keyof YieldFactors)[]).reduce((a, b) => (factors[b] < factors[a] ? b : a))
  const ourRank = ranking.indexOf(grown) + 1
  const obs = ctx.yieldRef?.[grown.crop.id]
  const verdict: Disagreement['verdict'] = ourRank <= 3 ? 'close' : factors[weakestKey] < 0.6 ? 'physics' : 'economics'
  return {
    grown, share: shares[grown.crop.id] ?? 0, ourRank, cmp: compare(ranking[0], grown, w), factors,
    weakest: { key: weakestKey, value: factors[weakestKey] }, harvest: grown.harvest,
    observed: obs?.source === 'country' ? obs.t : null, verdict,
  }
}

/** The factors of a crop's expected yield, as the page names them. */
export const YIELD_FACTOR_LABEL: Record<keyof YieldFactors, string> = {
  soil: 'soil (GAEZ pH and texture)', warmth: 'warmth to ripen', water: 'water in an average season', heat: 'heat at flowering',
  winter: 'winter kill', wet: 'wet-season disease', frost: 'late frost',
}

/** What makes the model pass over a crop farms grow: close to the top; else the factor carrying most of the score gap
 *  (the Shapley split) - the rotation or soil health as the model scores them, the national proof, the market, a factor
 *  of the yield - else the money. Beauce: "pays less" had been said of a gap made mostly of rotation. */
export function verdictKind(d: Disagreement): 'close' | 'rotation' | 'soil' | 'viability' | 'reach' | 'physics' | 'economics' {
  if (d.verdict === 'close') return 'close'
  // the largest part in the pick's favour (parts come largest first by size, either sign)
  const lead = d.cmp.parts.find((p) => p.points > 0)
  if (lead && lead.points > 0 && (lead.key === 'rotation' || lead.key === 'soil' || lead.key === 'viability' || lead.key === 'reach')) return lead.key
  if (d.verdict === 'physics' || (lead && lead.points > 0 && (lead.key === 'water' || lead.key === 'fit'))) return 'physics'
  return 'economics'
}

/** One sentence on why the model does not pick a crop farms grow (verdictKind). */
export function verdictText(d: Disagreement): string {
  const pick = d.cmp.a.crop.name.toLowerCase()
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
  // the note behind a factor: the crop's own drawback as scored, else the pick's advantage - never an unpriced flag
  const noteOn = (tag: Note['tag']) =>
    d.grown.notes.find((n) => n.tag === tag && n.tone !== 'good' && !unpriced(n)) ?? d.cmp.a.notes.find((n) => n.tag === tag && n.tone === 'good')
  const kind = verdictKind(d)
  if (kind === 'rotation' || kind === 'soil') {
    const n = noteOn(kind)
    return `Most of the gap is ${kind === 'rotation' ? 'the rotation' : 'soil health'}, as the model scores it${n ? ` - ${lower(n.text)}` : '.'}`
  }
  return {
    close: 'It is in our top three - the science and the practice broadly agree here.',
    viability: `The country harvests little of it: the national proof keeps ${pct(d.grown.proof)} of its score.`,
    reach: 'Its market is beyond reach from this field - a fresh harvest needs a buyer within a few hours.',
    physics: `Its weakest link in the model is ${YIELD_FACTOR_LABEL[d.weakest.key]} (${pct(d.weakest.value)} of its potential).`,
    economics: `It grows well enough in the model but pays less than ${pick} at the reference prices and costs - food needs, local buyers and know-how are not in the model.`,
  }[kind]
}

/** The model's pick against the crop fields around sow most after this field's last crops (rotationShares in
 *  rotationPrior.ts): the disagreement in the model's own numbers, and the rotation risks it flags on that crop
 *  without pricing them. Null when the model already picks it, or when the history backs no observed rotation. */
export function whyDifferent(ranking: Evaluation[], rotation: Partial<Record<CropId, number>> | null, ctx: FieldContext, w: Priorities): (Disagreement & { flags: RotationFlag[] }) | null {
  if (!rotation) return null
  const d = disagreement(ranking, rotation, ctx, w)
  return d ? { ...d, flags: d.grown.flags } : null
}
