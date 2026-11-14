// How sure the greenhouse advice is, what would change it, and where the greenhouse model stops.
//
// The field engine's uncertainties are soil water, drought response and crop prices. Under glass the soil barely
// matters and water is bought or banked; what moves the answer is money for energy, the price the crop fetches, how
// much yield a unit of light buys, how well the house holds heat, and which recent years the future resembles. So:
//
//  • Monte Carlo (seeded, 200 runs): gas-heat price × lognormal (σ 0.35 - European gas moved several-fold in
//    2021-23), electricity × lognormal (σ 0.25), the crop prices of one real year 2015-2024 for every crop at once
//    (DG AGRI: a dear year is dear for most crops) with ±10 % on top per crop, light-use efficiency ±15 % (Marcelis et
//    al. 2006: 0.7-1 % yield per 1 % light), heat loss of cover and leakage ±15 % (ASABE EP406 gives ranges, not
//    points), each crop's plants, substrate and labour ±30 % (±50 % where only a small US budget exists), and the
//    recent decade resampled year by year. Each run ranks the crops the way the page does (margin, CO₂ and how steady
//    the real years were, with the grower's weights); the share of runs each crop comes first is its confidence -
//    not a probability of profit.
//  • Tipping points on the observed record: the gas and electricity prices at which another crop takes first place,
//    and how far the pick's own price can fall before it loses first place.
//  • Counterfactual: the same house planned on the 1981-2010 climate - did NASA's record of the shift change the pick
//    or the planting month?
//  • Validity: failure modes of a steady-state monthly model, and the ones this site triggers.

import type { ClimateAnalysis } from './climate'
import { PRICE_YEARS } from './ghMarket'
import {
  DEFAULT_GH_PRIORITIES, GH_CROPS, marginFor, normalsFor, normalsForYears, NO_TWEAK, rankGreenhouseCrops,
  scalePrices, type GhCropId, type GhPriorities, type GhRankOptions, type GhResult, type GreenhouseSpec, type Normal, type Prices, type Tweak,
} from './greenhouse'
import { rng, SEED } from './robust'

export const GH_RUNS = 200

export type GhConfidence = {
  runs: number
  shares: { id: GhCropId; share: number }[] // highest first
  top: GhCropId
  topShare: number
  varied: string[]
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())

type Ranked = { id: GhCropId; margin: number; plant: number | null; score: number }

/**
 * The page's ranking, cheaply: margin and CO₂ from the tweaked run, steadiness kept from the real-year replay
 * (it is a property of the record, not of one scenario).
 */
function rankOn(normals: Normal[], lat: number, spec: GreenhouseSpec, prices: Prices, tw: (id: GhCropId) => Tweak, ctx: Ctx): Ranked[] {
  const w = ctx.w
  const sum = w.profit + w.climate + w.steady || 1
  return ctx.crops
    .map((id) => {
      const c = GH_CROPS.find((x) => x.id === id)!
      const m = marginFor(normals, lat, { ...spec, crop: id }, c, prices, tw(id))
      const profit = 1 - Math.exp(-Math.max(0, m.margin) / 25)
      const climate = 1 - Math.min(1, m.carbonKg / 120)
      const blended = (w.profit * profit + w.climate * climate + w.steady * (ctx.steady.get(id) ?? 0.5)) / sum
      return { id, margin: m.margin, plant: m.plant, score: 100 * blended * (m.margin > 0 ? 1 : 0.2) }
    })
    .sort((a, b) => b.score - a.score || b.margin - a.margin)
}

type Ctx = { crops: GhCropId[]; steady: Map<GhCropId, number>; w: GhPriorities }

/** The crops the grower can sell, and how steady each one's plan was over the real years. */
function contextOf(climate: ClimateAnalysis, spec: GreenhouseSpec, prices: Prices, opts: GhRankOptions): Ctx {
  const base = rankGreenhouseCrops(climate, spec, prices, opts)
  return {
    crops: base.map((r) => r.crop.id),
    steady: new Map(base.map((r) => [r.crop.id, r.score.steady])),
    w: opts.priorities ?? DEFAULT_GH_PRIORITIES,
  }
}

/** Seeded Monte Carlo over energy prices, real crop-price years, light response, heat loss and which recent years recur. */
export function ghConfidence(climate: ClimateAnalysis, spec: GreenhouseSpec, prices: Prices, runs = GH_RUNS, opts: GhRankOptions = {}): GhConfidence {
  const ctx = contextOf(climate, spec, prices, opts)
  const r = rng(SEED)
  const years: number[] = []
  for (let y = climate.recent.from; y <= climate.recent.to; y++) years.push(y)
  const wins = new Map<GhCropId, number>()
  for (let k = 0; k < runs; k++) {
    const sample = years.map(() => years[Math.floor(r() * years.length)])
    const normals = normalsForYears(climate, sample)
    const p = scalePrices(prices, Math.exp(0.35 * gauss(r)), Math.exp(0.25 * gauss(r)))
    const heat = 1 + (r() * 2 - 1) * 0.15
    const priceYear = PRICE_YEARS[Math.floor(r() * PRICE_YEARS.length)]
    const tweaks = new Map(
      GH_CROPS.map((c) => [c.id, { heat, lue: 1 + (r() * 2 - 1) * 0.15, price: 1 + (r() * 2 - 1) * 0.1, other: 1 + (r() * 2 - 1) * c.otherSpread, priceYear }]),
    )
    const ranked = rankOn(normals, climate.lat, spec, p, (id) => tweaks.get(id)!, ctx)
    // a house left empty wins nothing: when no crop pays, no crop gets the run
    if (ranked.length && ranked[0].margin > 0) wins.set(ranked[0].id, (wins.get(ranked[0].id) ?? 0) + 1)
  }
  const shares = ctx.crops.map((id) => ({ id, share: (wins.get(id) ?? 0) / runs })).sort((a, b) => b.share - a.share)
  const varied = [
    spec.heated ? 'gas price (×½ to ×2)' : null,
    spec.lit ? 'electricity price' : null,
    `crop prices of a real year ${PRICE_YEARS[0]}-${PRICE_YEARS.at(-1)} ±10 %`,
    'plants, substrate and labour ±30-50 %',
    'yield per unit of light ±15 %',
    spec.heated ? 'heat loss of the house ±15 %' : null,
    'which recent years recur',
  ].filter((x): x is string => x !== null)
  const top = shares[0] ?? { id: spec.crop, share: 0 }
  return { runs, shares, top: top.id, topShare: top.share, varied }
}

/** The ranking the page shows, on the recent normals, with one set of multipliers per crop - for checks and tests. */
export function ghRankUnder(climate: ClimateAnalysis, spec: GreenhouseSpec, prices: Prices, tw: (id: GhCropId) => Tweak, opts: GhRankOptions = {}) {
  return rankOn(normalsFor(climate, climate.recent), climate.lat, spec, prices, tw, contextOf(climate, spec, prices, opts))
}

export type GhTipping = {
  /** gas-heat price band (€/kWh) inside which the pick stays first; null ends = never flips within ×¼ … ×4 */
  heat: { low: number | null; high: number | null; lowTo: GhCropId | null; highTo: GhCropId | null } | null
  power: { low: number | null; high: number | null; lowTo: GhCropId | null; highTo: GhCropId | null } | null
  /** how far the pick's own price can fall before it loses first place (0.4 = −40 %), and to whom */
  ownPrice: { drop: number; to: GhCropId } | null
  /** the pick and its margin if gas cost three times as much (2022-like) */
  gasShock: { top: GhCropId; margin: number; pickMargin: number } | null
}

const GRID = Array.from({ length: 41 }, (_, i) => Math.pow(4, (i - 20) / 20)) // ×¼ … ×4, log-spaced

/** Price band scan: walk away from today's price in both directions until another crop comes first. */
function band(normals: Normal[], lat: number, spec: GreenhouseSpec, prices: Prices, key: 'heat' | 'power', pick: GhCropId, ctx: Ctx) {
  const topAt = (f: number) => rankOn(normals, lat, spec, key === 'heat' ? scalePrices(prices, f) : scalePrices(prices, 1, f), () => NO_TWEAK, ctx)[0]
  let low: number | null = null
  let lowTo: GhCropId | null = null
  let high: number | null = null
  let highTo: GhCropId | null = null
  for (let i = 21; i < GRID.length; i++) {
    const t = topAt(GRID[i])
    if (t.id !== pick || t.margin <= 0) {
      high = prices[key] * GRID[i]
      highTo = t.margin > 0 ? t.id : null
      break
    }
  }
  for (let i = 19; i >= 0; i--) {
    const t = topAt(GRID[i])
    if (t.id !== pick) {
      low = prices[key] * GRID[i]
      lowTo = t.id
      break
    }
  }
  return { low, high, lowTo, highTo }
}

export function ghTipping(climate: ClimateAnalysis, spec: GreenhouseSpec, prices: Prices, opts: GhRankOptions = {}): GhTipping {
  const ctx = contextOf(climate, spec, prices, opts)
  const normals = normalsFor(climate, climate.recent)
  const base = rankOn(normals, climate.lat, spec, prices, () => NO_TWEAK, ctx)
  const pick = base[0]
  if (!pick || pick.margin <= 0) return { heat: null, power: null, ownPrice: null, gasShock: null }
  let ownPrice: GhTipping['ownPrice'] = null
  for (let drop = 0.02; drop <= 0.9 + 1e-9; drop += 0.02) {
    const t = rankOn(normals, climate.lat, spec, prices, (id) => (id === pick.id ? { ...NO_TWEAK, price: 1 - drop } : NO_TWEAK), ctx)[0]
    if (t.id !== pick.id) {
      ownPrice = { drop, to: t.id }
      break
    }
  }
  const shock = spec.heated ? rankOn(normals, climate.lat, spec, scalePrices(prices, 3), () => NO_TWEAK, ctx) : null
  return {
    heat: spec.heated ? band(normals, climate.lat, spec, prices, 'heat', pick.id, ctx) : null,
    power: spec.lit ? band(normals, climate.lat, spec, prices, 'power', pick.id, ctx) : null,
    ownPrice,
    gasShock: shock ? { top: shock[0].id, margin: shock[0].margin, pickMargin: shock.find((x) => x.id === pick.id)!.margin } : null,
  }
}

export type GhThenNow = {
  topThen: GhCropId | null
  topNow: GhCropId | null
  /** planting month of the chosen crop then and now (1-12, null = not worth planting) */
  plantThen: number | null
  plantNow: number | null
  marginThen: number
  marginNow: number
}

/** The same house and prices planned on the 1981-2010 climate: did the observed shift change the advice? */
export function ghThenNow(climate: ClimateAnalysis, spec: GreenhouseSpec, prices: Prices, opts: GhRankOptions = {}): GhThenNow {
  const ctx = contextOf(climate, spec, prices, opts)
  const then = rankOn(normalsFor(climate, climate.baseline), climate.lat, spec, prices, () => NO_TWEAK, ctx)
  const now = rankOn(normalsFor(climate, climate.recent), climate.lat, spec, prices, () => NO_TWEAK, ctx)
  const t = then.find((x) => x.id === spec.crop) ?? then[0]
  const n = now.find((x) => x.id === spec.crop) ?? now[0]
  return {
    topThen: then[0] && then[0].margin > 0 ? then[0].id : null,
    topNow: now[0] && now[0].margin > 0 ? now[0].id : null,
    plantThen: t?.plant ?? null,
    plantNow: n?.plant ?? null,
    marginThen: t?.margin ?? 0,
    marginNow: n?.margin ?? 0,
  }
}

// ---------- where the model stops ----------

export type GhLevel = 'out' | 'stretch' | 'ok'
export type GhFlag = { id: string; level: GhLevel; title: string; detail: string }

/** Known failure modes of the greenhouse model - shown in full in the Method section and the docs. */
export const GH_FAILURE_MODES: { id: string; title: string; detail: string; detect: boolean }[] = [
  { id: 'cooling', title: 'Hot climates need active cooling', detail: 'The model knows ventilation and shade only. Where the house runs far above the crop’s limit, pad-and-fan or fog cooling decides the season, and its water and power are not counted.', detect: true },
  { id: 'tropics', title: 'Tropical protected cropping', detail: 'In the tropics covers mostly keep off rain and insects (net and screen houses). The model is built for heated or passive houses in seasonal climates.', detect: true },
  { id: 'darkwinter', title: 'Dark winters', detail: 'Far from the equator the lamps (180 µmol m⁻² s⁻¹, 16 h) cannot reach the crop’s light target in mid-winter; yields then fall below the plan.', detect: true },
  { id: 'market', title: 'Thin markets', detail: 'Pot herbs have no open market record: they are ranked only on the price the grower enters, and they sell into small markets that saturate fast. A price that holds for a few hundred m² may not hold for hectares.', detect: true },
  { id: 'euprices', title: 'European prices elsewhere', detail: 'Crop prices come from the EU market record (Spain & Italy, or the Netherlands & Belgium north of 45°). Outside Europe they are a reference: set your market’s price level or your own prices.', detect: true },
  { id: 'nocrop', title: 'No crop pays for its energy', detail: 'At these prices every crop loses money over any calendar; the advice is to leave the house empty.', detect: true },
  { id: 'estimatedsun', title: 'Estimated sunlight before 1984', detail: 'NASA POWER solar radiation starts in 1984; earlier baseline months use FAO-56 eq. 50 from the temperature range.', detect: true },
  { id: 'coldsnap', title: 'Monthly means hide cold snaps', detail: 'The boiler must be sized for the coldest nights (a design temperature), which a monthly model does not see.', detect: false },
  { id: 'humidity', title: 'Humidity and disease', detail: 'Heated houses carry a flat 12 % extra heat for venting humid air; real humidity control depends on the crop, screen use and weather, and disease pressure is not modelled.', detect: false },
  { id: 'co2', title: 'CO₂ enrichment', detail: 'Dosing adds a fixed yield share while the house is closed (Mortensen 1987) and is paid as bought CO₂; flue gas from the boiler, which most heated houses use, would make it cheaper.', detect: false },
  { id: 'chp', title: 'Combined heat and power', detail: 'Many Dutch houses heat with gas engines that sell electricity to the grid, which makes their heat far cheaper than the boiler assumed here.', detect: false },
  { id: 'substrate', title: 'Soil-borne disease and rotation', detail: 'Tomato and pepper share soil-borne diseases; soil-grown houses need rotation, grafting or substrate. The model assumes the crop can be grown every year.', detect: false },
  { id: 'cover', title: 'Cover ageing', detail: 'Films lose light transmission within a few years and are replaced; dirty glass loses light too.', detect: false },
  { id: 'flatprices', title: 'Typical prices, not your contract', detail: 'Each month earns the 2020-2024 market average for that month; growers on fixed contracts or with their own brand see other curves (enter your own price or level).', detect: false },
  { id: 'costs', title: 'Capital and overheads', detail: 'Energy, CO₂, plants, substrate, crop care and picking labour are subtracted; depreciation, interest, packaging materials and selling costs are not - the result is a gross margin, not profit.', detect: false },
]

const TROPIC = 23.44

/** The failure modes this house, crop and climate trigger (out / stretch), plus the ones it clears (ok). */
export function ghValidity(climate: ClimateAnalysis, r: GhResult, ranking: GhResult[]): GhFlag[] {
  const out: GhFlag[] = []
  const inCrop = r.months.filter((m) => m.state === 'harvest' || m.state === 'establish')
  const hot = r.months.filter((m) => m.active && m.insideDayMax > r.crop.maxT + 6)
  if (hot.length >= 5) out.push({ id: 'cooling', level: 'out', title: 'Cooling decides the season here', detail: `${hot.length} months run more than 6 °C above ${r.crop.name.toLowerCase()}’s ${r.crop.maxT} °C limit even fully vented. Plan evaporative cooling; its water and power are not in the numbers.` })
  else if (hot.length) out.push({ id: 'cooling', level: 'stretch', title: 'Hot months need more than shade', detail: `${hot.length} month${hot.length > 1 ? 's run' : ' runs'} more than 6 °C above the crop’s limit: shade and full venting may not be enough.` })
  else out.push({ id: 'cooling', level: 'ok', title: 'Ventilation and shade keep summers within reach', detail: 'No month runs far above the crop’s heat limit.' })

  if (!r.ownPrice && (climate.lon < -25 || climate.lon > 45 || climate.lat < 34 || climate.lat > 71)) out.push({ id: 'euprices', level: 'stretch', title: 'Prices from the European market', detail: 'This site is outside Europe: the crop prices are the EU record, a reference only. Set your market’s price level or your own prices in the house panel.' })

  if (Math.abs(climate.lat) < TROPIC) out.push({ id: 'tropics', level: 'stretch', title: 'Tropical site', detail: 'Protected cropping here is mostly about rain and insects (net houses); treat heating and calendar advice as indicative.' })

  if (r.spec.lit) {
    const dark = inCrop.filter((m) => m.dliIn + m.supp < r.crop.dli * 0.8)
    if (dark.length) out.push({ id: 'darkwinter', level: 'stretch', title: 'Lamps fall short in mid-winter', detail: `In ${dark.length} month${dark.length > 1 ? 's' : ''} sun and lamps together stay below 80 % of the crop’s ${r.crop.dli} mol m⁻² d⁻¹ target.` })
  }

  const top = ranking[0]
  if (top && top.plan.margin > 0 && !top.crop.market && r.spec.floorM2 >= 2000)
    out.push({ id: 'market', level: 'stretch', title: `${top.crop.name} leads on your own price`, detail: `${top.crop.name} has no open market record; it sells into a small market that saturates fast. On ${r.spec.floorM2.toLocaleString('en-US')} m² check that buyers exist for the whole harvest before trusting its lead.` })

  if (!ranking.some((x) => x.plan.margin > 0)) out.push({ id: 'nocrop', level: 'out', title: 'No crop pays for its energy', detail: 'At these prices every crop loses money over any calendar here.' })

  if (climate.baseline.from < 1984) out.push({ id: 'estimatedsun', level: 'ok', title: 'Sunlight before 1984 is estimated', detail: `${1984 - climate.baseline.from} of the baseline years use FAO-56 eq. 50; the recent decade is measured by CERES.` })
  return out
}

export type GhTrust = { conf: GhConfidence; tip: GhTipping; thenNow: GhThenNow }

// The panel and the printed report ask for the same analysis: compute it once per climate, house and prices.
const CACHE = new WeakMap<ClimateAnalysis, Map<string, GhTrust>>()

export function ghTrust(climate: ClimateAnalysis, spec: GreenhouseSpec, prices: Prices, opts: GhRankOptions = {}): GhTrust {
  let byKey = CACHE.get(climate)
  if (!byKey) CACHE.set(climate, (byKey = new Map()))
  const key = JSON.stringify([spec, prices, opts.exclude ?? [], opts.priorities ?? null, opts.country ?? null])
  let t = byKey.get(key)
  if (!t) {
    t = { conf: ghConfidence(climate, spec, prices, GH_RUNS, opts), tip: ghTipping(climate, spec, prices, opts), thenNow: ghThenNow(climate, spec, prices, opts) }
    if (byKey.size > 20) byKey.clear()
    byKey.set(key, t)
  }
  return t
}
