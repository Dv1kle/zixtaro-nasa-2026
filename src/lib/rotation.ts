// Transparent rotation engine. Every score decomposes into named parts and every part
// carries the agronomic or NASA-data reason behind it - no black box, no hidden ties.
//
// score = 100 × rotationFit × (0.25 × siteFit + 0.75 × priorityMix(soil, water, profit))

import { MARKET_REACH_GATE, marketReach } from './access'
import { baseForm, CROPS, CROP_BY_ID, DISEASE_INFO, FAMILY_LABEL, cropSeason, tableId, type Crop, type CropId, type Disease, type FormOf } from './crops'
import type { SoilProfile } from './soil'
import { clamp } from './stats'
import { riskAfter, waterIn, type CropRisk } from './water'
import { carbonInputs, humified } from './soilcarbon'
import { FROST_KILL, HOT_DAYS_HIT as HOT } from './extremes'
import { burnsFraction, fieldCapacity, LEY_BREAK_N, N_RESIDUAL, type WinterDrainage } from './nitrate'
import { fieldErodibility, protection as coverProtection, type FieldErodibility } from './erosion'
import type { Co2Effect } from './scenario'
import { phOptimum, soilSuitability } from './gaez'
import { fieldFactors } from './fieldPractice'
import { practiceFactors, type PracticePrior } from './prior'
import { COUNTRY, MARKETS } from './markets'
import type { CropQuote, MarketContext } from './marketProfit'

export type Priorities = { soil: number; water: number; profit: number } // 0..100 each

export type FieldContext = {
  risks: Record<CropId, CropRisk>
  soil: SoilProfile
  /** replay a specific season (e.g. 2018) instead of the recent-decade average */
  stressYear: number | null
  recentLabel: string // e.g. "2016-2025"
  baselineLabel: string // e.g. "1981-2010"
  drying: boolean // significant drying trend at this field
  /** unlimited irrigation: water stress becomes irrigation demand instead of yield loss */
  irrigated: boolean
  /**
   * While the farmer has not said how the field is watered: the share of the cropland around it that is irrigated
   * (FAO GMIA, 0..1). Every crop is then scored as the expectation over the two cases - p × irrigated + (1 - p) ×
   * rainfed - and `irrigated` is ignored. A yes/no default at 50 % moved single crops by up to 37 points between a
   * share of 0.49 and 0.50 (sanity tests). The risks must be the rainfed ones (no budget).
   */
  irrigationPrior?: number | null
  /**
   * Mode C (practice-informed): multiply the score by the national proof (LOCAL_PROOF - does this country harvest the
   * crop at scale?). Off = mode A, the science alone. The page turns it on by default and labels it; the evaluation
   * scripts report both. See practice.ts and docs/SCIENCE.md "Three views of a field".
   */
  nationalProof?: boolean
  /** mode C (the page's default, labelled): the science pushed toward observed practice - CROPGRIDS around the field,
   *  or the country's mix - by a bounded log-prior (prior.ts). Applied by rankNext over the whole ranking as the
   *  viability factor (so the parts still add up and explain.ts names it); evaluate() alone never sees it. */
  practice?: PracticePrior
  /** € per mm of irrigation water per hectare on this field (irrigation.ts: pumped groundwater vs canal water, by
   *  FAO GMIA's source shares); IRRIGATION_COST - all pumped - when absent */
  irrigationCost?: number
  /** sensitivity runs only: internal coefficients scaled; DEFAULT_TUNING when absent */
  tuning?: Partial<Tuning>
  /**
   * a limited irrigation budget, mm per season (0 = rainfed). The risks were simulated with it, so their losses are
   * what is left after the water ran out; here it only prices the water that was applied.
   */
  budget?: number
  /** winter drainage below the roots on this field (for nitrate-leaching notes), when known */
  winterDrain?: WinterDrainage
  /** a 2050s scenario's CO₂ effect on the crops (transpiration is already in the risks; yields apply here) */
  co2?: Co2Effect | null
  /** multipliers on the reference crop prices (sensitivity runs), 1 when absent */
  priceFactor?: Partial<Record<CropId, number>>
  /** mean slope of the field from the terrain model, % (null when unknown) */
  slopePct: number | null
  /** rainfall erosivity R of this field, MJ mm ha⁻¹ h⁻¹ yr⁻¹ (from NASA POWER monthly rain); the European mean when absent */
  erosivity?: number
  /** where the harvest is sold and what it nets there (marketProfit.ts); reference prices when absent */
  market?: MarketContext | null
  /** what farms in this country really harvest, t/ha (FAOSTAT via markets.observedYield); the reference yield when absent */
  yieldRef?: Partial<Record<CropId, { t: number; source: 'country' | 'region' | 'world'; niche?: boolean }>> | null
  /** travel time from the field to the nearest city of 50 000+, hours (access.ts); unknown when absent */
  cityHours?: number | null
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const nhHarvest = (c: Crop) => {
  const s = cropSeason(c, 'north')
  return s[s.length - 1].month
}

export type Tone = 'good' | 'warn' | 'bad'
export type Note = { tone: Tone; text: string; tag: 'rotation' | 'soil' | 'water' | 'fit' | 'profit' }

/**
 * A rotation risk the score does not price: published guidance (a break interval, a disease bridge, the same family)
 * with no measured yield figure behind it (history v3 - experiments H and H2 found such penalties pushing
 * the ranking away from what farms sow). high: past a run limit, inside a minimum break, a soil-borne failure bridge;
 * moderate: the rest.
 */
/** The words a flag's note ends with - and the test that a note is not a reason for any part of the score. */
const NOT_PRICED = ' - a risk, not priced in the score.'
export const unpriced = (n: Note) => n.text.endsWith(NOT_PRICED)

export type RotationFlag = {
  rule: 'run-limit' | 'run-second' | 'min-break' | 'disease-self' | 'disease-host' | 'same-family'
  level: 'high' | 'moderate'
  /** the disease behind it, when there is one */
  cause: Disease | null
  text: string
}

export type Evaluation = {
  crop: Crop
  score: number
  /** the scientific score (mode A) - equal to `score` unless ctx.nationalProof applied the national proof */
  science: number
  /** the national proof, 0.5..1 - observed practice (LOCAL_PROOF); in the score only when ctx.nationalProof is on */
  proof: number
  /** contributions to the score (they add up to `score`) plus what the rotation and the national proof cost */
  parts: { soil: number; water: number; profit: number; fit: number; lost: number }
  /** 0..1 each; viability is the national proof as applied (`proof` in mode C, 1 in mode A); reach a fresh crop's market reach (both modes) */
  sub: { rotation: number; soil: number; water: number; profit: number; fit: number; viability: number; reach: number; carbon: number }
  loss: number // water-stress yield loss used for scoring
  /** the season follows a bare fallow: its water figures are the after-fallow ones (water.ts riskAfter) */
  afterFallow: boolean
  deficit: number // mm
  /** expected gross margin at the reference prices, €/ha (after water, heat, winter and disease losses) */
  margin: number
  /** share of the reference yield this field can expect */
  yieldShare: number
  /** expected harvest, t/ha: the country's observed yield scaled by this field's conditions, or reference × share */
  harvest: number
  /** FAO water productivity: harvest per m³ of water the crop used (ET, plus irrigation when unlimited), kg/m³ */
  kgPerM3: number
  /** gross margin per mm of crop water use, €/ha/mm */
  eurPerMm: number
  /** the market behind the margin, when one is set */
  money?: { market: string; source: CropQuote['source']; netPerT: number; homeNetPerT: number; costIndex: number; demand: number; mode: CropQuote['route']['mode'] }
  notes: Note[]
  /** rotation risks the score does not price (history v3) */
  flags: RotationFlag[]
}

/** Crops by id as this field grows them (spring wheat, silage maize ...), for figures read beside the score. */
export const formIn = (ctx: { risks: Partial<Record<CropId, CropRisk>> }): FormOf => (id) => ctx.risks[id]?.crop ?? CROP_BY_ID[id]

/** € per mm of irrigation water per hectare (pumping + labour), for irrigated scoring */
export const IRRIGATION_COST = 1.5
/** A margin of this size (€/ha) scores ~0.63 on the profit axis; bigger margins saturate. */
export const MARGIN_SCALE = 800

/** What a tonne of the crop earns at this field's market: the reference price moved as the market moves it relative to
 *  selling at home, or the grower's own price as typed. */
export function unitPrice(crop: Crop, ctx: FieldContext): number {
  const q = ctx.market?.quotes[crop.id]
  const rel = !q ? 1 : q.source === 'yours' ? NaN : q.homeNetPerT > 0 ? q.netPerT / q.homeNetPerT : q.netPerT > 0 ? 1 : 0
  const unit = q?.source === 'yours' ? q.netPerT : crop.econ.price * rel
  return unit * (ctx.priceFactor?.[crop.id] ?? 1)
}

const LEVELS = new WeakMap<FieldContext, number>()
/**
 * The field's revenue level for the drought-risk axis: the highest reference revenue (reference yield × price at this
 * field's market) among the field crops a farm here can grow without a contract or a herd. It depends on the market,
 * not on the weather, so more drought can only lower the axis.
 */
export function revenueLevel(ctx: FieldContext): number {
  let v = LEVELS.get(ctx)
  if (v === undefined) {
    v = Math.max(0, ...CROPS.filter((c) => !c.contract && c.econ.yield > 0).map((c) => c.econ.yield * unitPrice(c, ctx)).filter(Number.isFinite))
    LEVELS.set(ctx, v)
  }
  return v
}
/** Irrigated water axis: this margin per mm of irrigation scores ~0.63 - the profit scale over a 500 mm irrigation season. */
export const WATER_SCALE = MARGIN_SCALE / 500
/** The least irrigation a season on an irrigated field takes (land preparation, a first watering), mm. */
export const IRRIGATION_FLOOR = 50
/** the share of attainable yield a well-run rainfed farm reaches in an average season, where the full costs apply */
export const TYPICAL_SHARE = 0.8

/** The engine's internal coefficients that a sensitivity run may perturb (forensic audit phase 17). */
export type Tuning = { heat: number; cold: number; wet: number; frost: number; typicalShare: number; marginScale: number; fitShare: number }
export const DEFAULT_TUNING: Tuning = { heat: 0.3, cold: 0.7, wet: 0.35, frost: 0.3, typicalShare: TYPICAL_SHARE, marginScale: 800, fitShare: 0.25 }
/** the least of the reference seed and field-pass costs a farm still pays, however low its country's yields */
export const MIN_INTENSITY = 0.3

/**
 * How much a crop keeps of its standing when nobody around grows it. Absence from the country's (or the whole
 * sub-region's) FAOSTAT harvest record is evidence of a limit the model does not see: pests, day length, cultivars,
 * a market, storage. A record of a niche (under NICHE_SHARE of the country's cropland - Kenya's soybeans, India's
 * sweet potatoes) is the same evidence and counts as the neighbours' record: 'region'. A judgement, not a fitted
 * value; listed in the evidence register.
 */
export const LOCAL_PROOF = { country: 1, region: 0.8, world: 0.5 } as const

/**
 * Crops whose national FAOSTAT yields count glasshouse harvests - the Netherlands' tomatoes 460 t/ha, its peppers 272 t/ha
 * (src/data/markets.json). Like a niche crop's, such a record cannot lift an open field above what its physics gives.
 */
export const GLASSHOUSE_IN_STATS: ReadonlySet<CropId> = new Set<CropId>(['tomato', 'chilli'])

/** Humified carbon of a well-grown cereal with its straw left on the field, t C/ha - the top of the carbon scale. */
const HUMIFIED_REF = 1.2
/** kg N/ha of biologically fixed nitrogen that moves the nitrogen sub-score from 0.5 to 1. */
const N_SCALE = 400
/** Fertiliser N price, €/kg N - an assumption (calcium ammonium nitrate, 2019-2023, rounded). Replace with your own. */
export const N_PRICE = 1.2
/** kg N/ha of nitrate brought back within reach that gives the full root sub-score. */
const DEEP_N_FULL = 20

/** Crops harvested with heavy machinery (root crops, maize): the compaction risk on wet soil. */
const HEAVY_HARVEST = new Set<CropId>(['sugarbeet', 'potato', 'maize', 'sweetpotato', 'cassava'])

/**
 * Yield lost when a crop follows itself, or comes back one season early, where field records or trials measure it. The
 * rotation factor falls by that share (0.9 × drag) in place of the rule-of-thumb gates (a third wheat had kept 0.2 of
 * its score), and the crop's own soil-borne disease is not charged on top - the measured loss includes it:
 *   maize 4.3 %, soybean 10.4 % after themselves - Seifert, Roberts & Lobell 2017, Agronomy J. 109:541-548
 *     (748 374 field yields, US Corn Belt);
 *   wheat, triticale 10 % after themselves - between continuous wheat on the Canadian Prairies (7.2 % below rotated,
 *     6-yr trial, Gill 2018, Can. J. Plant Sci., doi:10.1139/cjps-2017-0292) and second wheats in the UK (10-15 %, AHDB take-all
 *     guidance); barley and rye take wheat's figure (assumed);
 *   canola 7.5 % after itself and 4.7 % with one season between - field records, Western Canada 2002-2021 (Lassoued et al.
 *     2024, Agronomy J., doi:10.1002/agj2.21739): canola after canola, and the gain of canola after a pulse over canola after a cereal.
 * Crops whose short breaks risk soil-borne failures (sugar beet, potato, the pulses, sunflower, linseed) keep their
 * minimum breaks. Experiment H found the gates far harsher than practice: continuous spring wheat in North
 * Dakota, canola every other year in Saskatchewan.
 */
export const REPEAT_DRAG: Partial<Record<CropId, { self: number; gap?: Record<number, number> }>> = {
  maize: { self: 0.043 }, soybean: { self: 0.104 },
  wheat: { self: 0.1 }, triticale: { self: 0.1 }, barley: { self: 0.1 }, rye: { self: 0.1 },
  rapeseed: { self: 0.075, gap: { 2: 0.047 } },
}

/**
 * Yield lost by a small grain after another host of its residue- and soil-borne cereal diseases - charged as a second
 * wheat, 10 % (REPEAT_DRAG's figure), in place of the rule-of-thumb penalties (R -0.2 for take-all, -0.15 for Fusarium):
 *   take-all after another cereal or a grass ley - AHDB: losses of 10-20 % are common in second and third wheats; grass
 *     weeds carry it (a ley taken as a cereal: assumed, likely an upper bound);
 *   Fusarium after maize or sorghum - Dill-Macky & Jones 2000 (Plant Disease 84:71-76, doi:10.1094/PDIS.2000.84.1.71):
 *     wheat after corn yielded as little as wheat after wheat, ~15 % below wheat after soybean (Minnesota 1995-97,
 *     epidemic years, a susceptible cultivar) - a cereal after maize is no worse than a second cereal.
 * Experiment H: wheat after maize and triticale after a ley fell 2-7 places on fields that sowed them.
 */
export const CEREAL_HOST_DRAG = 0.1

/** A crop's unpriced rotation risks in one line: the worst level and the diseases behind them. */
export function flagSummary(flags: RotationFlag[]): { level: 'high' | 'moderate'; causes: string[] } | null {
  if (!flags.length) return null
  const causes = [...new Set(flags.map((f) => f.cause).filter((d): d is Disease => d !== null))].map((d) => DISEASE_INFO[d].name)
  return { level: flags.some((f) => f.level === 'high') ? 'high' : 'moderate', causes }
}

/** Soil-borne diseases that can fail a crop: a bridge to them is a high flag; the rest (rootworm) moderate. Take-all is
 *  priced (CEREAL_HOST_DRAG). */
const FAILURE_DISEASES = new Set<Disease>(['sclerotinia', 'beet-cyst', 'clubroot', 'pea-rots', 'potato-cyst'])

const pct = (x: number) => `${Math.round(x * 100)}%`

const deficitCache = new WeakMap<FieldContext, number>()
/** Irrigation demand of the thirstiest crop at this field - the yardstick for irrigated scoring. */
function maxDeficit(ctx: FieldContext): number {
  let m = deficitCache.get(ctx)
  if (m === undefined) {
    m = Math.max(50, ...CROPS.filter((c) => c.ky > 0).map((c) => waterIn(ctx.risks[c.id], ctx.stressYear).deficit))
    deficitCache.set(ctx, m)
  }
  return m
}
const erodibilityCache = new WeakMap<FieldContext, FieldErodibility>()
/** The field's erodibility (RUSLE R·K·LS, wind-erodible fraction), once per context. */
export function erodibilityOf(ctx: FieldContext): FieldErodibility {
  let f = erodibilityCache.get(ctx)
  if (!f) {
    f = fieldErodibility(ctx.soil, ctx.slopePct, ctx.erosivity)
    erodibilityCache.set(ctx, f)
  }
  return f
}

/** Nitrogen the previous crop leaves for this one, kg N/ha: a legume's credit, or the flush from ploughing out a ley. */
export const precropCredit = (last: Crop | null, crop: Crop) =>
  !last ? 0 : last.id === 'clover' && crop.id !== 'clover' ? LEY_BREAK_N : last.nFix

/**
 * Nitrate the previous crop left that winter drainage carries below its roots but not below this crop's, kg N/ha -
 * within reach again for a deeper-rooted crop (Thorup-Kristensen 2006; Burns 1974 for the depth profile).
 */
export function deepNitrate(last: Crop | null, crop: Crop, ctx: FieldContext): number {
  // a bare fallow has no roots (its depth only sizes the water it stores)
  if (!last || !ctx.winterDrain || last.perennial || crop.family === 'none' || crop.rootDepth <= last.rootDepth) return 0
  const residual = last.id === 'clover' ? LEY_BREAK_N : N_RESIDUAL[tableId(last)]
  // an autumn-sown crop covers part of the winter; a spring crop meets the full bare-soil drainage
  const d = crop.sow >= 7 ? (ctx.winterDrain.bare + ctx.winterDrain.covered) / 2 : ctx.winterDrain.bare
  const fc = fieldCapacity(ctx.soil)
  return residual * (burnsFraction(d, fc, last.rootDepth * 100) - burnsFraction(d, fc, crop.rootDepth * 100))
}

const seasonsAgo = (k: number) => (k === 1 ? 'last season' : `${k} seasons ago`)

/** `history` is oldest → newest; null = unknown. Returns seasons since `id` was last grown (1 = last season). */
function lastSeen(history: (CropId | null)[], id: CropId): number | null {
  for (let i = history.length - 1; i >= 0; i--) if (history[i] === id) return history.length - i
  return null
}

function runLength(history: (CropId | null)[], id: CropId): number {
  let r = 0
  for (let i = history.length - 1; i >= 0 && history[i] === id; i--) r++
  return r
}

export function evaluate(asListed: Crop, history: (CropId | null)[], ctx: FieldContext, w: Priorities): Evaluation {
  const p = ctx.irrigationPrior
  if (p != null) {
    const plain = { ...ctx, irrigationPrior: null, budget: 0 }
    if (p <= 0 || p >= 1) return evaluate(asListed, history, { ...plain, irrigated: p >= 1 }, w)
    return expected(evaluate(asListed, history, { ...plain, irrigated: true }, w), evaluate(asListed, history, { ...plain, irrigated: false }, w), p)
  }
  // near a line the field is scored on every variant, weighted (water.ts formsOf): spring wheat a little past the line
  // where winters kill the winter form, silage maize where the grain only just ripens; where lines nest (a sowing band
  // and a split) each link's note gives the whole's shares of its line's two sides (water.ts Sides)
  const near = ctx.risks[asListed.id]?.alt
  if (near) {
    const id = asListed.id
    const main = evaluate(asListed, history, { ...ctx, risks: { ...ctx.risks, [id]: { ...ctx.risks[id], alt: undefined } } }, w)
    const other = evaluate(asListed, history, { ...ctx, risks: { ...ctx.risks, [id]: near.risk } }, w)
    // the variant next to this one (the first of the others): the side of the line it stands for
    const next = near.risk.crop ?? asListed
    const [mine, theirs] = near.sides ?? [1 - near.w, near.w]
    const share = `${Math.round(100 * mine)} / ${Math.round(100 * theirs)}`
    // the other notes describe the likelier form; this one gives both forms' water, which the score mixed
    const water = ctx.irrigated ? `irrigation need ~${Math.round(main.deficit)} mm against ~${Math.round(other.deficit)} mm` : `water-stress loss ~${pct(main.loss)} against ~${pct(other.loss)}`
    const sown = (c: Crop) => (c.sowBy === 'rains' ? 'sowing with the rains' : 'sowing once the seed-bed warms')
    const rainsFrom = (c: Crop) => `the rains from ${MONTH[(c.rains?.onset ?? 1) - 1]}`
    const text = near.kind === 'monsoon'
      ? `Close to the rain at which the rains here stop keeping a monsoon's shape: scored ${share} between ${sown(main.crop)} and ${sown(next)} (${water}).`
      : near.kind === 'rains'
      ? `Close to a dry spell that splits the rainy season: scored ${share} between ${rainsFrom(main.crop)} and ${rainsFrom(next)} (${water}).`
      : near.kind === 'calendar'
      ? `Close to the mild-winter line from which summer-rain farms sow with the rains: scored ${share} between ${sown(main.crop)} and ${sown(next)} (${water}).`
      : `Close to the line where farms here grow ${next.name.toLowerCase()} instead: scored ${share} between ${main.crop.name.toLowerCase()} and it (${water}).`
    // the likeliest variant leads (its calendar, name and notes), whatever share the others hold together
    return mixed(other, main, near.w, { tone: 'warn', tag: 'fit', text }, main, near.risk.alt ? other.notes[0] : undefined)
  }
  // last season's crop near its own switch: the field grew either form, weighted as that crop's score was (its roots,
  // harvest month and residues set this season's nitrogen, catch-crop window and notes)
  const prevId = history[history.length - 1] ?? null
  const prevNear = prevId && prevId !== asListed.id ? ctx.risks[prevId]?.alt : undefined
  if (prevId && prevNear) {
    const main = evaluate(asListed, history, { ...ctx, risks: { ...ctx.risks, [prevId]: { ...ctx.risks[prevId], alt: undefined } } }, w)
    const other = evaluate(asListed, history, { ...ctx, risks: { ...ctx.risks, [prevId]: prevNear.risk } }, w)
    return mixed(other, main, prevNear.w, undefined, main)
  }
  // the form this field grows (spring wheat where winters kill winter wheat) - its calendar, economics and name
  const crop = ctx.risks[asListed.id]?.crop ?? asListed
  const notes: Note[] = []
  const lastId = history[history.length - 1] ?? null
  // a past crop in the form it takes on this field - spring wheat on the Prairies, not the base winter form (its
  // harvest month decides the winter window; its name is what the notes say)
  const pastForm = (id: CropId) => ctx.risks[id]?.crop ?? CROP_BY_ID[id]
  const last = lastId ? pastForm(lastId) : null

  // ---------- 1. Rotation health (gatekeeper) ----------
  let rotation = 0.9
  const flags: RotationFlag[] = []
  const flag = (rule: RotationFlag['rule'], level: RotationFlag['level'], cause: Disease | null, text: string) => {
    flags.push({ rule, level, cause, text })
    notes.push({ tone: level === 'high' ? 'bad' : 'warn', tag: 'rotation', text: `${text}${NOT_PRICED}` })
  }
  const run = runLength(history, crop.id)
  const drag = REPEAT_DRAG[crop.id]
  const pctOf = (x: number) => `${Math.round(x * 1000) / 10} %`
  if (run > 0 && drag) {
    rotation -= 0.9 * drag.self
    notes.push({ tone: 'warn', tag: 'rotation', text: `${crop.name} after ${crop.name.toLowerCase()}: field records and trials lose about ${pctOf(drag.self)} of the yield.` })
  } else if (drag?.gap) {
    const k = lastSeen(history, crop.id)
    const d = k !== null ? drag.gap[k] : undefined
    if (d) {
      rotation -= 0.9 * d
      notes.push({ tone: 'warn', tag: 'rotation', text: `${crop.name} ${seasonsAgo(k!)}: field records show about ${pctOf(d)} less yield than after a longer break.` })
    }
  } else if (run > 0) {
    if (run >= crop.maxRun) flag('run-limit', 'high', crop.diseases[0] ?? null, `${crop.name} ${run + 1} seasons in a row exceeds its limit (${crop.maxRun})`)
    else flag('run-second', 'moderate', crop.diseases[0] ?? null, `A second ${crop.name.toLowerCase()} in a row is tolerated, but yields and pest pressure suffer`)
  } else if (crop.minBreak > 0) {
    const k = lastSeen(history, crop.id)
    if (k !== null && k <= crop.minBreak) {
      const why = crop.diseases[0] ? ` (${DISEASE_INFO[crop.diseases[0]].name})` : ''
      flag('min-break', 'high', crop.diseases[0] ?? null, `${crop.name} was grown ${seasonsAgo(k)} - it needs ${crop.minBreak}+ seasons between crops${why}`)
    }
  }

  // previous crops already charged through a specific disease pathway: the generic "same family" rule below does not
  // charge them a second time for the same shared pathogens (experiment H: wheat after maize, triticale after a grass
  // ley lost two penalties for one pathway)
  const charged = new Set<CropId>()
  for (const d of crop.diseases) {
    const info = DISEASE_INFO[d]
    for (let k = 1; k <= info.gap && k <= history.length; k++) {
      const id = history[history.length - k]
      if (!id) continue
      const other = pastForm(id)
      // the same crop inside its own break is already penalised above
      if ((id === crop.id && (drag || (crop.minBreak > 0 && k <= crop.minBreak))) || !other.diseases.includes(d)) continue
      if (id === crop.id) {
        // past the usual break but inside the disease's: a risk where the disease is present, which we cannot know
        flag('disease-self', 'moderate', d, `${crop.name} ${seasonsAgo(k)}: where ${info.name} is present, guidance asks for ${info.gap}+ seasons between hosts`)
      } else if (d === 'take-all') {
        rotation -= 0.9 * CEREAL_HOST_DRAG
        charged.add(id)
        notes.push({ tone: 'warn', tag: 'rotation', text: `${other.name} ${seasonsAgo(k)} carries ${info.name}: ${crop.name.toLowerCase()} after it gives about ${pctOf(CEREAL_HOST_DRAG)} less yield, as a second wheat does.` })
      } else {
        charged.add(id)
        flag('disease-host', FAILURE_DISEASES.has(d) ? 'high' : 'moderate', d, `${other.name} ${seasonsAgo(k)} carries ${info.name} - keep ${info.gap}+ seasons between hosts`)
      }
      break
    }
  }

  if (last && crop.group === 'small-grain' && last.group === 'c4-cereal') {
    rotation -= 0.9 * CEREAL_HOST_DRAG
    charged.add(last.id)
    notes.push({ tone: 'warn', tag: 'rotation', text: `${last.name} residues carry Fusarium into ${crop.name.toLowerCase()}: about ${pctOf(CEREAL_HOST_DRAG)} less yield, as after a cereal, and a mycotoxin risk - chop or plough them in.` })
  }
  if (last && last.id !== crop.id && last.family === crop.family && !charged.has(last.id)) {
    flag('same-family', 'moderate', null, `Same plant family as last season (${FAMILY_LABEL[crop.family].toLowerCase()}) - shared pests and diseases`)
  }
  const recent3 = history.slice(-3).filter((x): x is CropId => x !== null)
  const cereals = recent3.filter((id) => CROP_BY_ID[id].family === 'poaceae').length
  if (crop.family !== 'poaceae' && cereals >= 2) {
    // priced like the drags: the cereal after it is spared a second cereal's measured loss (it was +0.1, a round number)
    rotation += 0.9 * CEREAL_HOST_DRAG
    notes.push({ tone: 'good', tag: 'rotation', text: `Break crop after ${cereals} cereal seasons - interrupts grass weeds, take-all and cereal pests: the cereal after it is spared a second cereal's loss, about ${pctOf(CEREAL_HOST_DRAG)} less yield.` })
  }
  rotation = clamp(rotation, 0.05, 1)

  // ---------- 2. Soil health ----------
  const sand = ctx.soil.top.sand
  const slope = ctx.slopePct ?? 0
  // Nitrogen the soil gains: what a legume fixes and leaves (Preissel et al. 2015 for the pre-crop credit). The fertiliser
  // a crop needs is money - in its costs (step 6), less a legume predecessor's credit - and is not counted here again.
  // Earlier, the soil axis scored the N balance (fixed N minus fertiliser still needed): a second count of the
  // fertiliser bill that ranked N-hungry staples down - the N balance alone put the crop grown most at mean rank 7.96
  // on the development cells (accuracy plan H12).
  const credit = precropCredit(last, crop)
  const nComp = clamp(0.5 + crop.nFix / N_SCALE)
  // erosion: the crop's bare months (ranked judgement, ordered like published C-factors) × how erodible the field is
  const erod = erodibilityOf(ctx)
  const protection = coverProtection(crop.coverGap, erod)
  // roots: deeper than the last crop's, they reach the nitrate winter drainage carried below it
  const deepN = deepNitrate(last, crop, ctx)
  const rootReach = clamp(0.5 + (0.5 * deepN) / DEEP_N_FULL)
  // the carbon term (0.35) is added once the expected yield is known - residues grow with the crop (step 6)
  let soil = 0.3 * nComp + 0.2 * protection + 0.15 * rootReach
  if (crop.nFix >= 25) {
    notes.push({
      tone: 'good', tag: 'soil',
      text: `Fixes its own nitrogen and leaves ~${crop.nFix} kg N/ha for the next crop${last && last.nDemand >= 150 ? ` - a good follow-up to hungry ${last.name.toLowerCase()}` : ''}.`,
    })
  }
  if (credit >= 25 && crop.nDemand > 0) {
    notes.push({
      tone: 'good', tag: 'profit',
      text: `${last!.name} last season leaves ~${credit} kg N/ha: about ${Math.min(credit, crop.nDemand)} kg less fertiliser (~€${Math.round((Math.min(credit, crop.nDemand) * N_PRICE) / 5) * 5}/ha at €${N_PRICE}/kg N).`,
    })
  }
  if (crop.coverGap >= 0.5 && erod.water >= 0.35) {
    notes.push({
      tone: 'warn', tag: 'soil',
      text: `Bare, this field could lose ~${Math.round(erod.potential)} t of soil per hectare a year to rain on its ${erod.slopePct.toFixed(1)} % slope (RUSLE, order of magnitude) - and ${crop.name.toLowerCase()} leaves it open for months: drill across the slope and keep residue on the surface.`,
    })
  } else if (crop.coverGap >= 0.5 && erod.wind >= 0.5) {
    notes.push({
      tone: 'warn', tag: 'soil',
      text: `About ${Math.round(erod.ef * 100)} % of this ${sand >= 50 ? 'sandy ' : ''}topsoil is fine enough to blow when dry, and ${crop.name.toLowerCase()} leaves it bare for months - keep stubble standing or follow with a cover crop.`,
    })
  }
  if (deepN >= 5) {
    notes.push({
      tone: 'good', tag: 'soil',
      text: `Roots to ${crop.rootDepth} m, below the ${last!.name.toLowerCase()}’s ${last!.rootDepth} m: ~${Math.round(deepN)} kg N/ha of nitrate washed down over winter is back within reach.`,
    })
  }
  if (last && ctx.winterDrain && last.rootDepth >= 1.5 && crop.rootDepth >= 1.5 && ctx.winterDrain.bare < 10) {
    notes.push({
      tone: 'warn', tag: 'water',
      text: `Deep roots after deep roots: winter rain here barely refills the subsoil (~${Math.round(ctx.winterDrain.bare)} mm drains in an average winter), so it starts on what the ${last.name.toLowerCase()} left - the water model does not carry that over.`,
    })
  }
  // Early harvest + spring sowing leaves a winter window for a catch crop.
  if (last && !last.perennial && !crop.perennial && nhHarvest(last) <= 8 && crop.sow >= 3 && crop.sow <= 6) {
    soil += 0.06
    notes.push({
      tone: 'good', tag: 'soil',
      text: `Winter window after the ${last.name.toLowerCase()} harvest: sow a cover crop to hold soil and nitrogen${ctx.drying ? ' - end it early in spring to save moisture' : ''}.`,
    })
  }

  // ---------- 3. Water & heat (NASA POWER-driven) ----------
  // after a bare fallow the season starts on the rain the fallow year stored (water.ts afterFallow)
  const plainRisk = ctx.risks[crop.id]
  const afterFallow = lastId === 'fallow' && plainRisk.afterFallow ? plainRisk.afterFallow : null
  const risk: CropRisk = riskAfter(plainRisk, !!afterFallow)
  // irrigated, the stored water is water not pumped (the deficit, as `pumped` below); rainfed, stress avoided
  const pumpSaved = afterFallow ? plainRisk.recent.deficit - afterFallow.recent.deficit : 0
  if (afterFallow && crop.ky > 0 && ctx.irrigated && pumpSaved >= 5) {
    notes.push({ tone: 'good', tag: 'water', text: `After the bare fallow it starts on the rain the soil stored: about ${Math.round(pumpSaved)} mm less to pump.` })
  } else if (afterFallow && crop.ky > 0 && !ctx.irrigated && plainRisk.recent.loss - afterFallow.recent.loss >= 0.01) {
    notes.push({ tone: 'good', tag: 'water', text: `After the bare fallow it starts on the rain the soil stored: water-stress loss ~${pct(plainRisk.recent.loss)} → ~${pct(afterFallow.recent.loss)}, about ${Math.round(afterFallow.stored)} mm more water used.` })
  }
  const wf = waterIn(risk, ctx.stressYear)
  const drift = crop.ky > 0 ? risk.recent.loss - risk.baseline.loss : 0
  const heat = risk.heat.recent
  const dryStart = risk.establish?.recent ?? 0
  const when = ctx.stressYear ? `in a ${ctx.stressYear}-like season` : `in ${ctx.recentLabel}`
  const irrigationDrift = risk.recent.deficit - risk.baseline.deficit
  // Irrigated: stress is avoided, but every missing millimetre has to be pumped.
  // Resilience looks at the drought-year tail (the driest 30 % of seasons); the average loss is priced into the margin.
  const tail = crop.ky > 0 ? wf.bad : 0.5 * wf.stress
  // (rainfed crops with a harvest are re-scored in money once the margin is known - step 6)
  let water = ctx.irrigated
    ? clamp(1 - wf.deficit / (1.2 * maxDeficit(ctx)) - Math.max(0, irrigationDrift) / 300) * (1 - 0.35 * heat)
    : clamp(1 - 1.2 * tail - 0.8 * Math.max(0, drift) - 0.3 * dryStart - 0.3 * Math.min(1, wf.irrigation / 300)) * (1 - 0.35 * heat)
  if (ctx.irrigated && crop.id !== 'fallow') {
    const tone: Tone = wf.deficit < 100 ? 'good' : wf.deficit < 220 ? 'warn' : 'bad'
    notes.push({ tone, tag: 'water', text: `Needs ~${Math.round(wf.deficit)} mm of irrigation ${when} to avoid water stress.` })
    if (irrigationDrift >= 20) {
      notes.push({ tone: 'warn', tag: 'water', text: `Irrigation demand grew by ~${Math.round(irrigationDrift)} mm per season since ${ctx.baselineLabel}.` })
    }
  } else if (crop.ky > 0) {
    if (ctx.budget && wf.irrigation >= 5) {
      notes.push({
        tone: wf.deficit < 40 ? 'good' : 'warn', tag: 'water',
        text: `Uses ~${Math.round(wf.irrigation)} of your ${Math.round(ctx.budget)} mm ${when}${wf.deficit >= 20 ? ` and still runs ~${Math.round(wf.deficit)} mm short` : ' - enough to stay out of stress'}.`,
      })
    }
    if (wf.loss <= 0.08) notes.push({ tone: 'good', tag: 'water', text: `Low water-stress risk on this field: ~${pct(wf.loss)} yield loss ${when}.` })
    else if (wf.loss >= 0.25) {
      notes.push({ tone: 'bad', tag: 'water', text: `High water stress: ~${pct(wf.loss)} yield loss ${when} - or ~${Math.round(wf.deficit)} mm of irrigation.` })
    } else notes.push({ tone: 'warn', tag: 'water', text: `Moderate water stress: ~${pct(wf.loss)} yield loss ${when} (~${Math.round(wf.deficit)} mm short).` })
    if (drift >= 0.04) {
      notes.push({ tone: 'warn', tag: 'water', text: `The climate shift hit this crop: water-stress loss ${pct(risk.baseline.loss)} (${ctx.baselineLabel}) → ${pct(risk.recent.loss)} (${ctx.recentLabel}).` })
    }
  }
  // the note reports how often a season meets the heat (the score prices its degree-days, extremes.ts)
  const seen = risk.heat.seasons ?? risk.heat
  if (crop.heat && seen.recent >= 0.3) {
    const hd = risk.heatDaily
    notes.push({
      tone: 'warn', tag: 'water',
      text: hd
        ? `Heat at flowering: ${HOT}+ days at or above ${hd.tCrit} °C in ${MONTH[hd.month - 1]} in ${pct(seen.recent)} of recent seasons (${pct(seen.baseline)} in ${ctx.baselineLabel}) - NASA POWER daily.`
        : `Heat at its sensitive stage: mean daily max above ${crop.heat.tMax} °C in ${pct(seen.recent)} of recent seasons.`,
    })
  }
  const frost = risk.frost?.recent ?? 0
  if (frost >= 0.2) {
    notes.push({ tone: frost >= 0.4 ? 'bad' : 'warn', tag: 'fit', text: `Frost after emergence: a night at ${FROST_KILL} °C or colder in the month after sowing in ${pct(frost)} of recent seasons - sow later or expect re-sowing.` })
  }
  if (risk.establish && dryStart >= 0.3) {
    notes.push({
      tone: 'warn', tag: 'water',
      text: `Sown in ${MONTH[risk.establish.month - 1]} into often-dry soil: rain was under half of evaporation in ${pct(dryStart)} of recent sowings (${pct(risk.establish.baseline)} in ${ctx.baselineLabel}).`,
    })
  }

  // ---------- 4. Site fit (FAO GAEZ v4 soil ratings, season warmth) ----------
  // pH and texture as GAEZ rates them: the share of the yield potential this topsoil allows, the most limiting of the two
  const suit = soilSuitability(crop.id, ctx.soil)
  const thermal = risk.thermal.recent
  const fit = clamp(suit.rating * thermal)
  if (suit.texture.rating < 0.8 && suit.texture.limit) {
    const why = { retention: 'holds few nutrients', workability: 'is hard to work', rooting: 'restricts its roots' }[suit.texture.limit]
    notes.push({ tone: suit.texture.rating < 0.6 ? 'bad' : 'warn', tag: 'fit', text: `${ctx.soil.texture[0].toUpperCase()}${ctx.soil.texture.slice(1)} ${why}: GAEZ rates it at ${pct(suit.texture.rating)} of ${crop.name.toLowerCase()}’s yield potential.` })
  }
  if (suit.ph < 0.97) {
    const ph = ctx.soil.top.ph
    const [lo, hi] = phOptimum(crop.id)
    notes.push({
      tone: suit.ph < 0.8 ? 'bad' : 'warn', tag: 'fit',
      text: `Topsoil pH ${ph.toFixed(1)} is ${ph < lo ? 'below' : 'above'} its optimum ${lo}-${hi}: about ${pct(1 - suit.ph)} of the yield potential lost (GAEZ v4)${ph < lo ? ' - liming would recover it' : ''}.`,
    })
  }
  const tooWarm = (risk.thermal.hot ?? 0) >= 0.5
  if (thermal < 0.5) {
    notes.push({
      tone: 'bad', tag: 'fit',
      text: tooWarm
        ? 'Seasons here are too warm for it: more heat than any of its cultivars takes to fill grain (FAO GAEZ v4 heat units), or a winter too mild to vernalise it.'
        : 'Seasons here are too cool for it to mature reliably.',
    })
  } else if (thermal - risk.thermal.baseline >= 0.2) {
    notes.push({ tone: 'good', tag: 'fit', text: `Warming opened this door: thermal fit ${pct(risk.thermal.baseline)} (${ctx.baselineLabel}) → ${pct(thermal)} now.` })
  }
  if (tooWarm && risk.thermal.baseline - thermal >= 0.2) {
    notes.push({ tone: 'warn', tag: 'fit', text: `Warming is closing this door: thermal fit ${pct(risk.thermal.baseline)} (${ctx.baselineLabel}) → ${pct(thermal)} now - its seasons run hotter than its cultivars take.` })
  }

  // ---------- 5. Winter & wet-season losses ----------
  const cold = risk.cold.recent // the mean kill share of a recent winter (water.ts winterKill)
  const wet = risk.wet.recent // the mean disease hit of a recent season (the ramp around the rain limit, water.ts wetSeason)
  // the note reports how often a winter's nights averaged below the hardiness (the loss reads how far, winterKill)
  const killed = risk.cold.seasons?.recent ?? cold
  if (crop.hardiness !== undefined && killed >= 0.2) {
    notes.push({
      tone: killed >= 0.5 ? 'bad' : 'warn', tag: 'fit',
      text: `Winter kill: the coldest month averaged nights below ${crop.hardiness} °C in ${pct(killed)} of recent winters${killed >= 0.5 ? ' - too harsh for it here' : ''}.`,
    })
  }
  // traffic on wet soil: heavy harvesters on clay at field capacity compact the subsoil for years (Håkansson & Reeder 1994)
  const wk = risk.workability
  if (wk && HEAVY_HARVEST.has(crop.id) && ctx.soil.top.clay >= 30 && wk.harvest.recent >= 0.5) {
    notes.push({ tone: 'warn', tag: 'soil', text: `Harvest traffic on wet clay: the soil sits at field capacity at harvest in ${pct(wk.harvest.recent)} of recent seasons - heavy machinery then compacts the subsoil for years; use low tyre pressure or wait for a dry spell.` })
  }
  if (wk && !crop.perennial && crop.sow <= 6 && ctx.soil.top.clay >= 40 && wk.sowing.recent >= 0.6) {
    notes.push({ tone: 'warn', tag: 'fit', text: `Heavy soil, wet sowing month in ${pct(wk.sowing.recent)} of recent seasons: sowing is often delayed until the clay can carry a tractor.` })
  }
  // the note reports how often a season went over the limit (the loss reads how far, wetSeason)
  const wetShare = risk.wet.seasons?.recent ?? wet
  if (crop.wetLimit !== undefined && wetShare >= 0.4) {
    notes.push({ tone: 'warn', tag: 'fit', text: `Wet seasons breed leaf and pod disease: more than ${crop.wetLimit} mm of rain while it grows in ${pct(wetShare)} of recent seasons.` })
  }

  // ---------- 6. Margin (expected, at reference prices) ----------
  // Share of the reference yield this field can expect: soil (GAEZ) × warmth to mature × water × heat at flowering × winter × disease.
  // …and seedlings lost to a late frost (a share re-sown late or thinned)
  const co2 = ctx.co2 ? ctx.co2.gain(crop.id, crop.family) : 1
  const T = ctx.tuning ? { ...DEFAULT_TUNING, ...ctx.tuning } : DEFAULT_TUNING
  // …and, under a what-if only, the grain a faster grain fill no longer makes (scenario.ts grainFill)
  const fill = risk.grainFill ?? 1
  const yieldShare = co2 * fill * suit.rating * thermal * (1 - (ctx.irrigated || crop.ky <= 0 ? 0 : wf.loss)) * (1 - T.heat * heat) * (1 - T.cold * cold) * (1 - T.wet * wet) * (1 - T.frost * (risk.frost?.recent ?? 0))
  if (fill <= 0.97) {
    // no number: under warming the page shows the order of crops, not by how much they move (DecisionCard)
    notes.push({ tone: 'warn', tag: 'fit', text: 'A warmer season fills its grain faster - the same degree-days in fewer days - so it makes less grain; the expected harvest counts it.' })
  }
  if (ctx.co2 && co2 >= 1.02) {
    notes.push({ tone: 'good', tag: 'fit', text: `CO₂ at ${ctx.co2.ppm} ppm lifts its yield ~${Math.round((co2 - 1) * 100)} % (FACE experiments on ${crop.family === 'fabaceae' ? 'C3 legumes' : 'C3 crops'}) and trims its water use.` })
  } else if (ctx.co2 && crop.ky > 0) {
    notes.push({ tone: 'warn', tag: 'fit', text: `A C4 crop: CO₂ at ${ctx.co2.ppm} ppm saves it some water but adds little yield.` })
  }
  const e = crop.econ
  // Fertiliser and drying follow the yield a farmer can expect; seed and field passes don't (≈ 45 % of costs).
  // …less the fertiliser a legume or ley before it saves
  // at a market: what a tonne nets there after freight, duty and spoilage, and this country's running costs;
  // otherwise the reference price and costs
  const q = ctx.market?.quotes[crop.id]
  const costIdx = q ? ctx.market!.costIndex : 1
  // Expected harvest. With the country's record, the field's conditions move it up or down from a typical season
  // there (share / 0.8, within 0.3-1.25×); without it, the reference yield × the share.
  // (a crop grown for silage: the country's record is its grain yield - the forage's reference yield stands)
  const obs = e.yield > 0 && crop.form !== 'silage' ? ctx.yieldRef?.[crop.id] : undefined
  // A niche crop's national yield (irrigated valleys, gardens - NICHE_SHARE) cannot lift an ordinary field above what
  // the physics gives it: Senegal's 43 t/ha of garden sweet potatoes made sweet potato the pick in the groundnut basin.
  const anchored = obs ? obs.t * Math.min(1.25, Math.max(0.3, yieldShare / T.typicalShare)) : e.yield * yieldShare
  const harvest = obs?.niche || GLASSHOUSE_IN_STATS.has(crop.id) ? Math.min(anchored, e.yield * yieldShare) : anchored
  if (obs && obs.source !== 'country') {
    notes.push({ tone: 'warn', tag: 'profit', text: `Not grown at scale in ${obs.source === 'region' ? 'this country' : 'this country or its neighbours'}: its yield (~${obs.t.toFixed(1)} t/ha) comes from ${obs.source === 'region' ? 'neighbouring countries' : 'the world'} record, and something the model does not see (pests, day length, cultivars, a buyer) may keep farmers off it - the practice-informed view counts that; the scientific score does not.` })
  } else if (obs?.niche) {
    notes.push({ tone: 'warn', tag: 'profit', text: 'Grown on under 1 % of this country’s cropland: something the model does not see (a buyer, pests, cultivars, know-how) keeps most farmers off it - the practice-informed view counts that; the scientific score does not.' })
  }
  // fertiliser and drying (≈ 55 % of costs) follow this field's harvest; seed and field passes (≈ 45 %) the intensity
  // the country farms the crop at - where farms harvest a sixth of a typical European field's yield, nobody runs the
  // European seed rate and machinery (at least 30 % of those costs stays)
  const intensity = obs ? clamp(obs.t / (T.typicalShare * e.yield), MIN_INTENSITY, 1) : 1
  const costsFor = (h: number) => e.cost * (0.45 * intensity + 0.55 * Math.min(1, (e.yield > 0 ? h / e.yield : yieldShare) / T.typicalShare)) * costIdx - N_PRICE * Math.min(credit, crop.nDemand)
  const costs = costsFor(harvest)
  // The reference prices and costs are one consistent set. A market moves the price relative to selling at home
  // (freight, duty, a dearer buyer abroad); farm-gate price levels alone, without matching local costs, made the
  // ranking worse against what regions grow (docs/SCIENCE.md §6), and so did the country's own price ratios between
  // crops at the reference level (top-1 21 % -> 7 % on the development cells). The grower's own price is
  // used as typed.
  const price = unitPrice(crop, ctx)
  const pumped = ctx.irrigated ? wf.deficit : wf.irrigation
  const margin = harvest * price - costs - (ctx.irrigationCost ?? IRRIGATION_COST) * pumped
  // a market short of the crop pays a little more readily, a glutted one less (at most ±10 %)
  const profit = e.yield > 0 ? Math.min(1, (1 - Math.exp(-Math.max(0, margin) / T.marginScale)) * (1 + (q?.demand ?? 0))) : 0
  // Drought risk, rainfed: the money the driest 30 % of recent seasons put at stake - their mean yield loss times the
  // crop's reference revenue (reference yield × this market's price) - so the level of the money stays the profit
  // axis's alone, and more drought can only lower this axis. Heat, winter, disease and soil do not enter it; they act
  // in the harvest. Earlier, this axis was the dry-year margin itself, a second copy of profit (median Spearman
  // 0.94 across the development cells): money weighed two thirds of the score. Measured from the field's own expected
  // margin instead, the axis rose when a drought had already ruined the crop (nothing left to lose) - it broke the
  // monotonicity tests and was dropped. Drought-risk weight: see presets.ts (forensic audit).
  // The climate shift is in it once: the dry-year loss is the recent period's. Earlier, the shift was also
  // subtracted (0.8 × the rise of the mean loss since the baseline): a second count, and not monotone - when a drier
  // climate pushes both periods towards total loss the rise shrinks, so less rain raised the axis (sugarcane and taro
  // in Kansas, sanity.test.ts). The sensitivity run had found it moved no top pick at ±50 %. The shift
  // stays a note on the page.
  if (!ctx.irrigated && crop.ky > 0 && e.yield > 0) {
    // …at least the field's revenue level: on a field that could grow a 2,000 €/ha crop, a crop that earns 150 €/ha
    // does not become drought-safe by being cheap (Bambara groundnut topped Sahel cells that way)
    const atStake = wf.bad * Math.max(e.yield * price, revenueLevel(ctx))
    water = clamp(Math.exp(-atStake / T.marginScale) - 0.3 * dryStart)
  }
  // Irrigated: irrigation-water productivity in money - the margin per millimetre of irrigation the crop needs (paddy
  // seepage included; at least IRRIGATION_FLOOR). The scarce water on an irrigated field is what has to be pumped or
  // allocated, not the rain: counting the monsoon rain too marked West Bengal's rice down from first to fourth. Scored
  // against the thirstiest crop, as before, somebody was always last. Growing irrigation demand stays a penalty.
  if (ctx.irrigated && e.yield > 0) {
    const perMm = Math.max(0, margin) / Math.max(IRRIGATION_FLOOR, wf.deficit)
    water = clamp(1 - Math.exp(-perMm / WATER_SCALE) - Math.max(0, irrigationDrift) / 300)
  }
  const eur = (x: number) => `€${Math.round(Math.abs(x) / 10) * 10}`
  // no country name in the sentence: the dictionary templates numbers and crops, not countries, so a name made one key per
  // country to translate (the market in use is on the page's market chip, MarketChip, in Plan and in Market)
  const at = !q ? 'at reference prices' : q.market === ctx.market!.home ? 'at local farm-gate prices' : "at the chosen market's prices"
  if (e.yield === 0) notes.push({ tone: 'warn', tag: 'profit', text: 'No harvest income this season (eco-scheme payments may apply).' })
  else if (margin < 0) notes.push({ tone: 'bad', tag: 'profit', text: `Loses about ${eur(margin)}/ha ${at} on this field.` })
  else if (margin >= 700) notes.push({ tone: 'good', tag: 'profit', text: `About ${eur(margin)}/ha gross margin ${at} - a strong cash crop here.` })
  if (crop.contract) notes.push({ tone: 'warn', tag: 'profit', text: crop.contractWhy ?? (crop.group === 'forage' ? 'Only pays with livestock to feed.' : 'Needs a processor contract and storage nearby.') })
  if (crop.form === 'silage') notes.push({ tone: 'warn', tag: 'profit', text: 'Grown here for silage: the summers are too cool to ripen the grain in most years. The margin values the whole plant as feed - it pays only with livestock or a biogas plant to take it.' })

  // ---------- 7. Soil carbon from residues & roots (IPCC 2006 residue relations, ICBM humification) ----------
  const cIn = carbonInputs(crop, yieldShare)
  const kept = humified(cIn)
  soil = clamp(soil + 0.35 * clamp(kept / HUMIFIED_REF))
  // nitrogen left in the ground at harvest, and the winter water that can carry it away
  if (ctx.winterDrain && !crop.perennial && N_RESIDUAL[tableId(crop)] >= 60) {
    const f = burnsFraction(ctx.winterDrain.bare, fieldCapacity(ctx.soil))
    if (f >= 0.15) {
      notes.push({
        tone: 'warn', tag: 'soil',
        text: `Leaves ~${N_RESIDUAL[tableId(crop)]} kg N/ha in the soil at harvest; ~${Math.round(ctx.winterDrain.bare)} mm drain through this soil in winter and could wash out ~${Math.round(f * 100)} % of it - follow with a catch crop or an autumn-sown crop.`,
      })
    }
  }
  if (kept >= 0.85) {
    notes.push({ tone: 'good', tag: 'soil', text: `Returns ~${(cIn.ag + cIn.bg).toFixed(1)} t C/ha in straw and roots here, of which ~${kept.toFixed(1)} t builds lasting soil organic matter - leave the residues on the field.` })
  } else if (kept < 0.3) {
    notes.push({ tone: 'warn', tag: 'soil', text: `Leaves little residue (~${(cIn.ag + cIn.bg).toFixed(1)} t C/ha) - soil carbon runs down unless a cover crop or a high-residue crop follows.` })
  }

  // water the crop actually used: its evapotranspiration, plus the irrigation it was given when water is unlimited
  const used = wf.eta + (ctx.irrigated ? wf.deficit : 0)

  // ---------- Combine ----------
  // Drought and winter kill are priced where they act - in the expected yield, the margin and the dry-year water axis -
  // and are not gated again (the layer audit found drought counted three times: Kenyan and Bahian maize lost
  // 12 points to the gate alone). The national proof below (LOCAL_PROOF: is the crop harvested at scale in this
  // country?) is OBSERVED PRACTICE, not climate, soil or money, so the scientific score does not apply it: it is
  // reported as `proof` and applied only in the practice-informed mode C (ctx.nationalProof, practice.ts). Folded into the
  // score it had made national practice look like model skill - without it the pre-registered run A goes 3.29 -> 4.63
  // and the within-country signal was negative (forensic audit). The niche cap on the harvest stays: it is
  // about the national yield being unrepresentative, not about ranking.
  const proof = obs?.niche ? LOCAL_PROOF.region : LOCAL_PROOF[obs?.source ?? 'country']
  // Fresh produce beyond the reach nearly all of the world's growers have (access.ts) - logistics, not observed
  // practice, so the science applies it too
  const reachH = marketReach(crop.id)
  const remote = reachH !== null && ctx.cityHours != null && ctx.cityHours > reachH
  const reach = remote ? MARKET_REACH_GATE : 1
  if (remote) {
    notes.push({ tone: 'bad', tag: 'profit', text: `${ctx.cityHours!.toFixed(1)} h from the nearest city of 50 000 or more: 95 % of the world’s ${crop.name.toLowerCase()} grows within ${reachH!.toFixed(1)} h of one (Nelson 2019, CROPGRIDS 2020). It keeps ${MARKETS.shelf[crop.id]} days - without a buyer under contract, a fresh harvest has nowhere to go.` })
  }
  const viability = ctx.nationalProof ? proof : 1
  const gate = rotation * viability * reach
  const W = w.soil + w.water + w.profit || 1
  const mix = (w.soil * soil + w.water * water + w.profit * profit) / W
  const base = T.fitShare * fit + (1 - T.fitShare) * mix
  const score = 100 * base * gate
  const k = (100 * (1 - T.fitShare) * gate) / W
  return {
    crop,
    score,
    science: 100 * base * rotation * reach,
    proof,
    parts: {
      soil: k * w.soil * soil,
      water: k * w.water * water,
      profit: k * w.profit * profit,
      fit: 100 * T.fitShare * fit * gate,
      lost: 100 * base * (1 - gate),
    },
    sub: { rotation, soil, water, profit, fit, viability, reach, carbon: clamp(kept / HUMIFIED_REF) },
    loss: wf.loss,
    afterFallow: !!afterFallow,
    deficit: wf.deficit,
    margin,
    yieldShare,
    harvest,
    kgPerM3: used > 0 && e.yield > 0 ? (harvest * 1000) / (used * 10) : 0,
    eurPerMm: used > 0 && e.yield > 0 ? margin / used : 0,
    money: q ? { market: q.market, source: q.source, netPerT: q.netPerT, homeNetPerT: q.homeNetPerT, costIndex: costIdx, demand: q.demand, mode: q.route.mode } : undefined,
    notes,
    flags,
  }
}

/** The expectation of two evaluations of one crop - irrigated with probability p, rainfed otherwise. */
function expected(wet: Evaluation, dry: Evaluation, p: number): Evaluation {
  return mixed(wet, dry, p, { tone: 'warn', tag: 'water', text: `Scored as ${Math.round(p * 100)} % likely irrigated - the share of cropland around here that is (FAO GMIA) - until you say how this field is watered.` })
}

/** The expectation of two evaluations of one crop, `a` with probability p: every number mixed, the likelier one's
 *  crop, notes and flags kept, with `note` first when there is one. */
function mixed(a: Evaluation, b: Evaluation, p: number, note?: Note, likely = p >= 0.5 ? a : b, inner?: Note): Evaluation {
  const mix = (x: number, y: number) => p * x + (1 - p) * y
  const mixAll = <T extends Record<string, number>>(x: T, y: T) => Object.fromEntries(Object.keys(x).map((k) => [k, mix(x[k], y[k])])) as T
  return {
    ...likely,
    score: mix(a.score, b.score),
    science: mix(a.science, b.science),
    proof: mix(a.proof, b.proof),
    parts: mixAll(a.parts, b.parts),
    sub: mixAll(a.sub, b.sub),
    loss: mix(a.loss, b.loss),
    deficit: mix(a.deficit, b.deficit),
    margin: mix(a.margin, b.margin),
    yieldShare: mix(a.yieldShare, b.yieldShare),
    harvest: mix(a.harvest, b.harvest),
    kgPerM3: mix(a.kgPerM3, b.kgPerM3),
    eurPerMm: mix(a.eurPerMm, b.eurPerMm),
    notes: [...(note ? [note] : []), ...(inner ? [inner] : []), ...likely.notes],
  }
}

/**
 * When no harvested crop is expected to earn a positive margin here, the best (least negative) margin, €/ha; null when
 * at least one pays. The ranking then only orders losses - the page says so instead of presenting a winner (a 79 mm
 * desert put groundnut, soybean and lupin on top at -90 to -290 €/ha, sanity tests).
 */
export function nothingPays(ranking: Evaluation[]): number | null {
  const cropped = ranking.filter((e) => e.crop.econ.yield > 0)
  if (!cropped.length || cropped.some((e) => e.margin > 0)) return null
  return Math.max(...cropped.map((e) => e.margin))
}

export function rankNext(history: (CropId | null)[], ctx: FieldContext, w: Priorities, exclude: Set<CropId> = new Set()): Evaluation[] {
  const ranked = CROPS.filter((c) => !exclude.has(c.id))
    .map((c) => evaluate(c, history, ctx, w))
    .sort((a, b) => b.score - a.score || b.sub.profit - a.sub.profit)
  return ctx.practice ? withPractice(ranked, ctx.practice, history) : ranked
}

/**
 * Mode C over a ranking: each crop's score times its practice factor (prior.ts practiceFactors, at most 1), entered as
 * the viability factor - the score, its parts (what practice holds against a crop goes to `lost`) and sub.viability move
 * together, so the bars still add up and explain.ts attributes the gap it opens to practice. The scientific score
 * (`science`) is untouched. Re-sorted; ties keep the scientific order.
 */
export function withPractice(ranked: Evaluation[], prior: PracticePrior, history?: (CropId | null)[]): Evaluation[] {
  // the practice of the field and the fields around it is read for the history being ranked (fieldPractice.ts)
  const f = prior.field && history ? fieldFactors(ranked, prior.field, history) : practiceFactors(ranked, prior)
  return ranked
    .map((e, i) => {
      const k = f.get(e.crop.id) ?? 1
      const p = e.parts
      return { e: { ...e, score: e.score * k, parts: { soil: p.soil * k, water: p.water * k, profit: p.profit * k, fit: p.fit * k, lost: p.lost + e.score * (1 - k) }, sub: { ...e.sub, viability: e.sub.viability * k } }, i }
    })
    .sort((a, b) => b.e.score - a.e.score || a.i - b.i)
    .map((x) => x.e)
}

// ---------- Multi-season strategies ----------

export type StrategyMetrics = {
  soil: number // mean soil-health sub-score, 0..1
  fertiliserN: number // kg N/ha over the plan, after legume credits
  loss: number // mean water-stress loss in typical recent seasons
  stressLoss: number | null // mean loss if every season were like the replay year
  margin: number // mean expected gross margin, €/ha per season, at reference prices
  families: number
}

export type Strategy = {
  key: 'you' | 'soil' | 'water' | 'profit'
  label: string
  blurb: string
  seq: Evaluation[]
  score: number
  metrics: StrategyMetrics
}

export const PERSONAS: { key: Strategy['key']; label: string; blurb: string; w: Priorities | null }[] = [
  { key: 'you', label: 'Your balance', blurb: 'Starts with this season’s top pick, then optimises three more for your priorities.', w: null },
  { key: 'soil', label: 'Soil builder', blurb: 'Rebuilds organic matter and nitrogen first.', w: { soil: 100, water: 40, profit: 25 } },
  { key: 'water', label: 'Drought-proof', blurb: 'Minimises water-stress losses on this field.', w: { soil: 35, water: 100, profit: 35 } },
  { key: 'profit', label: 'Cash first', blurb: 'Maximises margin within agronomic limits.', w: { soil: 20, water: 35, profit: 100 } },
]

function searchPlan(
  history: (CropId | null)[], ctx: FieldContext, w: Priorities, pool: Crop[], firstPool: Crop[], horizon: number, beam: number,
) {
  type State = { seq: CropId[]; total: number }
  let states: State[] = [{ seq: [], total: 0 }]
  for (let step = 0; step < horizon; step++) {
    const next: State[] = []
    const risky: State[] = []
    for (const s of states) {
      const h = [...history, ...s.seq]
      for (const c of step === 0 ? firstPool : pool) {
        const e = evaluate(c, h, ctx, w)
        const st = { seq: [...s.seq, c.id], total: s.total + e.score }
        // an unpriced high rotation risk is not traded against money: plans avoid it (history v3) - unless the farmer's
        // ranking fixed the first crop, or nothing else is left
        if (e.flags.some((f) => f.level === 'high') && !(step === 0 && firstPool.length === 1)) risky.push(st)
        else next.push(st)
      }
    }
    const keep = next.length ? next : risky
    keep.sort((a, b) => b.total - a.total)
    states = keep.slice(0, beam)
  }
  const finalScore = (s: State) => {
    // a bare fallow is no plant family: it must not buy diversity
    const families = new Set(s.seq.map((id) => CROP_BY_ID[id].family).filter((f) => f !== 'none')).size
    const idle = s.seq.filter((id) => CROP_BY_ID[id].econ.yield === 0).length
    return s.total / horizon + 1.5 * (families - 1) - (idle >= 2 ? 6 : 0)
  }
  return states.map((s) => ({ ...s, final: finalScore(s) })).sort((a, b) => b.final - a.final)
}

/** Synthetic N a sequence needs (kg N/ha), after each legume's credit to the crop that follows it. */
export function nitrogenNeed(seq: CropId[], before: CropId | null, form: FormOf = baseForm): { n: number; fixed: number } {
  let credit = before ? form(before).nFix : 0
  let n = 0
  let fixed = 0
  for (const id of seq) {
    const c = form(id)
    n += Math.max(0, c.nDemand - credit)
    fixed += c.nFix
    credit = c.nFix
  }
  return { n, fixed }
}

/** A sequence measured as the strategies are (neutral weights): what a plan's card and the report's note read. */
export function metricsFor(seq: CropId[], history: (CropId | null)[], ctx: FieldContext): StrategyMetrics {
  const neutral: Priorities = { soil: 1, water: 1, profit: 1 }
  const evals = seq.map((id, i) => evaluate(CROP_BY_ID[id], [...history, ...seq.slice(0, i)], ctx, neutral))
  const fertiliserN = nitrogenNeed(seq, history[history.length - 1] ?? null, formIn(ctx)).n
  const typical = seq.map((id, i) => waterIn(riskAfter(ctx.risks[id], evals[i].afterFallow), null).loss)
  const stress = ctx.stressYear ? seq.map((id, i) => waterIn(riskAfter(ctx.risks[id], evals[i].afterFallow), ctx.stressYear).loss) : null
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return {
    soil: avg(evals.map((e) => e.sub.soil)),
    fertiliserN,
    loss: avg(typical),
    stressLoss: stress ? avg(stress) : null,
    margin: avg(evals.map((e) => e.margin)),
    families: new Set(seq.map((id) => CROP_BY_ID[id].family).filter((f) => f !== 'none')).size,
  }
}

export function buildStrategies(
  history: (CropId | null)[],
  ctx: FieldContext,
  userWeights: Priorities,
  exclude: Set<CropId> = new Set(),
  horizon = 4,
): Strategy[] {
  const pool = CROPS.filter((c) => !exclude.has(c.id))
  if (pool.length === 0) return []
  const top = rankNext(history, ctx, userWeights, exclude)[0].crop
  // Alternatives come from the personas least like the user's own balance.
  const norm = (w: Priorities) => {
    const len = Math.hypot(w.soil, w.water, w.profit) || 1
    return [w.soil / len, w.water / len, w.profit / len]
  }
  const u = norm(userWeights)
  const others = PERSONAS.filter((p) => p.w)
    .map((p) => ({ p, sim: norm(p.w!).reduce((s, x, i) => s + x * u[i], 0) }))
    .sort((a, b) => a.sim - b.sim)
    .slice(0, 2)
    .map((x) => x.p)

  const out: Strategy[] = []
  const usedFirst = new Set<CropId>()
  const usedMixes = new Set<string>()
  for (const p of [PERSONAS[0], ...others]) {
    const w = p.w ?? userWeights
    const firstPool = p.key === 'you' ? [top] : pool.filter((c) => !usedFirst.has(c.id))
    if (firstPool.length === 0) continue
    const ranked = searchPlan(history, ctx, w, pool, firstPool, horizon, 40)
    const mix = (seq: CropId[]) => [...seq].sort().join('.')
    const pick = ranked.find((r) => !usedMixes.has(mix(r.seq))) ?? ranked[0]
    if (!pick) continue
    usedFirst.add(pick.seq[0])
    usedMixes.add(mix(pick.seq))
    // Re-score each season with the user's own weights so plans are comparable.
    const seq = pick.seq.map((id, i) => evaluate(CROP_BY_ID[id], [...history, ...pick.seq.slice(0, i)], ctx, userWeights))
    out.push({
      key: p.key,
      label: p.label,
      blurb: p.blurb,
      seq,
      score: seq.reduce((s, e) => s + e.score, 0) / seq.length,
      metrics: metricsFor(pick.seq, history, ctx),
    })
  }
  return out
}
