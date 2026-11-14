// "Why A and not B?" - honest attribution for a score that multiplies its parts.
//
// score = 100 × rotation × viability × reach × (0.25 × fit + 0.75 × (w_s·soil + w_w·water + w_p·profit) / Σw)
// viability is the national proof in the practice-informed mode C and 1 in mode A (the science alone);
// reach is 0.5 for fresh produce beyond the market reach of nearly all its growers, else 1 (access.ts).
//
// Because rotation, viability and reach multiply everything else, "water +11, rotation +7" cannot be read off the
// parts. Shapley values solve exactly this: each factor's contribution is its average effect over every order in which
// B's seven inputs could be switched to A's. They are unique, add up exactly to scoreA − scoreB, and give zero to a
// factor that doesn't differ. Seven factors → 128 evaluations of a closed-form function: exact, not sampled.
//
// The causal chain then follows the water factor from the NASA record down to the points it cost:
// NASA POWER rain & ET₀ in the crop's own months → crop demand (FAO-56 Kc) → soil tank in root reach (SoilGrids,
// Saxton-Rawls) → unmet demand (root-zone bucket) → yield loss (FAO-33 Ky) → score.

import type { ClimateAnalysis } from './climate'
import { cropSeason, type CropId } from './crops'
import { unpriced, type Evaluation, type FieldContext, type Note, type Priorities } from './rotation'
import { riskAfter, waterIn } from './water'

export type FactorKey = 'rotation' | 'viability' | 'reach' | 'fit' | 'soil' | 'water' | 'profit'
export const FACTORS: FactorKey[] = ['rotation', 'viability', 'reach', 'fit', 'soil', 'water', 'profit']

type Sub = Record<FactorKey, number>

/** The score as a function of its seven factors - the same formula as `evaluate`. */
export function scoreOf(x: Sub, w: Priorities): number {
  const W = w.soil + w.water + w.profit || 1
  const mix = (w.soil * x.soil + w.water * x.water + w.profit * x.profit) / W
  return 100 * x.rotation * x.viability * x.reach * (0.25 * x.fit + 0.75 * mix)
}

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1))

/** Exact Shapley values of each factor for the move from `b` to `a`. */
export function shapley(a: Sub, b: Sub, w: Priorities): Record<FactorKey, number> {
  const n = FACTORS.length
  const out = Object.fromEntries(FACTORS.map((k) => [k, 0])) as Record<FactorKey, number>
  const value = (mask: number) => {
    const x = {} as Sub
    FACTORS.forEach((k, i) => { x[k] = mask & (1 << i) ? a[k] : b[k] })
    return scoreOf(x, w)
  }
  const cache = new Map<number, number>()
  const v = (mask: number) => {
    let r = cache.get(mask)
    if (r === undefined) cache.set(mask, (r = value(mask)))
    return r
  }
  for (let i = 0; i < n; i++) {
    for (let mask = 0; mask < 1 << n; mask++) {
      if (mask & (1 << i)) continue
      let size = 0
      for (let m = mask; m; m &= m - 1) size++
      const weight = (factorial(size) * factorial(n - size - 1)) / factorial(n)
      out[FACTORS[i]] += weight * (v(mask | (1 << i)) - v(mask))
    }
  }
  return out
}

export type Kind = 'science' | 'rule' | 'assumption' | 'yours'

export const FACTOR_INFO: Record<FactorKey, { label: string; data: string[]; kind: Kind; method: string }> = {
  water: {
    label: 'What a dry year costs',
    data: ['NASA POWER rain & ET₀', 'SoilGrids water', 'reference prices'],
    kind: 'science',
    method: 'FAO-56 root-zone water balance and FAO-33 yield response; the money the driest 30 % of seasons put at stake (their yield loss × the crop’s reference revenue) - risk, not the level, which is profit’s (irrigated: margin per mm of water)',
  },
  viability: {
    label: 'Local practice',
    data: ['CROPGRIDS 2020 around the field', 'FAOSTAT harvests by country'],
    kind: 'rule',
    method: 'observed practice, not science: the page’s default view (labelled) pushes the science toward what farms within about 250 km grow (CROPGRIDS), or the country’s FAOSTAT mix where CROPGRIDS has no cropland around - by a bounded factor (at most 16× either way); a crop the science rates under half of the best gains nothing on a plausible one. Checked on 48 fresh places (pre-registered check I): the crop grown most ranks 1.50 on average, top 3 in 98 %. The science-only view does not use it.',
  },
  reach: {
    label: 'A market within reach',
    data: ['travel time to cities (Nelson 2019)', 'CROPGRIDS 2020'],
    kind: 'rule',
    method: 'fresh produce keeping under 30 days keeps half its score where the field is farther from a city of 50 000+ than 95 % of the crop’s world harvested area - logistics, so the science-only view applies it too',
  },
  rotation: {
    label: 'Rotation health',
    data: ['your crop history'],
    kind: 'rule',
    method: 'break intervals & disease bridges from agronomic guidance',
  },
  soil: {
    label: 'Soil health',
    data: ['IPCC residues', 'SoilGrids', 'terrain slope', 'NASA POWER rain'],
    kind: 'science',
    method: 'carbon from IPCC 2006 residues & ICBM humification; N balance after pre-crop credits; field erodibility (RUSLE R·K·LS, wind fraction) × bare months; nitrate within deeper roots (Burns)',
  },
  fit: {
    label: 'Site fit',
    data: ['SoilGrids texture & pH', 'NASA POWER warmth'],
    kind: 'science',
    method: 'FAO GAEZ v4 pH and texture ratings and heat units to ripen',
  },
  profit: {
    label: 'Margin',
    data: ['reference prices'],
    kind: 'assumption',
    method: 'illustrative EU/US prices and costs - replace with local ones',
  },
}

const TAG_OF: Record<FactorKey, Note['tag'][]> = {
  water: ['water'],
  viability: ['water', 'fit'],
  reach: ['profit'],
  rotation: ['rotation'],
  soil: ['soil'],
  fit: ['fit'],
  profit: ['profit'],
}

export type Attribution = {
  key: FactorKey
  points: number // Shapley share of scoreA − scoreB
  /** the note that best explains the sign, from whichever crop it is about */
  reason: { text: string; about: CropId } | null
  /** how much the farmer's weights leaned on this factor (soil/water/profit only) */
  weight: number | null
}

export type Comparison = {
  a: Evaluation
  b: Evaluation
  gap: number
  parts: Attribution[] // largest first
}

export function compare(a: Evaluation, b: Evaluation, w: Priorities): Comparison {
  const phi = shapley(a.sub, b.sub, w)
  const W = w.soil + w.water + w.profit || 1
  const parts: Attribution[] = FACTORS.map((key) => {
    const points = phi[key]
    const winner = points >= 0 ? a : b
    const loser = points >= 0 ? b : a
    const tags = TAG_OF[key]
    const good = winner.notes.find((n) => tags.includes(n.tag) && n.tone === 'good')
    // a flag the score does not price never explains a part of it (history v3)
    const bad = loser.notes.find((n) => tags.includes(n.tag) && n.tone !== 'good' && !unpriced(n))
    const pick = key === 'viability' || key === 'reach' ? (bad ?? good) : (good ?? bad)
    const about = pick === good ? winner.crop.id : loser.crop.id
    return {
      key,
      points,
      reason: pick ? { text: pick.text, about } : null,
      weight: key === 'soil' || key === 'water' || key === 'profit' ? w[key] / W : null,
    }
  }).sort((x, y) => Math.abs(y.points) - Math.abs(x.points))
  return { a, b, gap: a.score - b.score, parts }
}

// ---------- the causal chain for one crop ----------

export type Chain = {
  id: CropId
  months: number // season length
  rain: number // NASA POWER rain over the crop's months, recent decade, mm
  rainThen: number // same months, baseline
  et0: number // reference ET over the season, recent, mm
  et0Then: number
  demand: number // crop water demand ETc = Σ Kc × ET₀, mm
  tank: number // plant-available water within root reach, mm
  rootDepth: number
  shortfall: number // unmet demand (≈ irrigation to avoid stress), mm
  irrigation: number // applied from the budget, mm
  loss: number // yield loss from water stress
  lossThen: number
  badLoss: number // mean loss of the driest 30 % of recent seasons
}

export function chainFor(e: Evaluation, ctx: FieldContext, climate: ClimateAnalysis): Chain {
  const season = cropSeason(e.crop, climate.season.hemisphere, climate.monthly.recent)
  const at = (norms: ClimateAnalysis['monthly']['recent'], m: number) => norms.find((x) => x.month === m)
  let rain = 0
  let rainThen = 0
  let et0 = 0
  let et0Then = 0
  let demand = 0
  for (const s of season) {
    const r = at(climate.monthly.recent, s.month)
    const b = at(climate.monthly.baseline, s.month)
    rain += r?.p ?? 0
    rainThen += b?.p ?? 0
    et0 += r?.pet ?? 0
    et0Then += b?.pet ?? 0
    demand += s.kc * (r?.pet ?? 0)
  }
  const risk = riskAfter(ctx.risks[e.crop.id], e.afterFallow)
  const wf = waterIn(risk, ctx.stressYear)
  return {
    id: e.crop.id,
    months: season.length,
    rain,
    rainThen,
    et0,
    et0Then,
    demand,
    tank: risk.taw,
    rootDepth: e.crop.rootDepth,
    shortfall: wf.deficit,
    irrigation: wf.irrigation,
    loss: wf.loss,
    lossThen: risk.baseline.loss,
    badLoss: wf.bad,
  }
}
