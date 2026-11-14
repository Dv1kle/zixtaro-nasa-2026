// What a plan's four numbers cannot say: why it is on the table, what it rests on, what it gives against carrying
// on as now and what that costs, what is not known about it, and what has to be checked on the ground before anyone
// acts on it. The challenge this app answers asks for exactly these five, for every strategy and for the rotation
// the farm is already on.
//
// Nothing here is a new calculation. Every line is read from the plan's own evaluations (rotation.ts) and its report
// (planMetrics.ts) - the numbers the cards and the sandbox already show - and from what the field's context says
// about where its inputs came from. A plan that wins nothing says so.

import { CROP_BY_ID, type Crop, type CropId } from './crops'
import { euro, pct } from './format'
import { currentRotation, type PlanReport } from './planMetrics'
import { evaluate, metricsFor, unpriced, type Evaluation, type FieldContext, type Priorities, type Strategy, type StrategyMetrics } from './rotation'

export type PlanKey = Strategy['key'] | 'now'

/** One plan as the board shows it: a strategy of the engine's, or the rotation the farm is on. */
export type PlanView = {
  key: PlanKey
  label: string
  blurb: string
  ids: CropId[]
  report: PlanReport
  /** the balance the plan was searched for; null for the farmer's own and for "as now" */
  w: Priorities | null
}

/** A sentence of a reading; `year` and `crop` when it is about one season of the plan. */
export type Line = { text: string; year?: number; crop?: Crop }

export type Reading = {
  why: Line[]
  rests: Line[]
  gives: Line[]
  costs: Line[]
  gaps: Line[]
  check: Line[]
}

/** The rotation the farm is on, laid over the plan's seasons: its last known crops, in their order, again. */
export function asNow(history: (CropId | null)[], horizon = 4): CropId[] | null {
  const known = currentRotation(history)
  return known ? Array.from({ length: horizon }, (_, i) => known[i % known.length]) : null
}

/**
 * The plan the farmer goes on with. The page is built around it: the season the plan opens with is the one the plate
 * names, the soil core measures, the forecast checks for sowing, the elevator takes in and the market prices - the
 * engine's own plan until another is chosen. A key that names no plan here (the priorities moved and that strategy is
 * gone, the history was cleared) falls back to the engine's own.
 */
export type Choice = { key: PlanKey; label: string; ids: CropId[] }

export function chosenPlan(strategies: Strategy[], history: (CropId | null)[], key: PlanKey): Choice | null {
  const of = (s: Strategy): Choice => ({ key: s.key, label: s.label, ids: s.seq.map((e) => e.crop.id) })
  const own = strategies[0]
  if (!own) return null
  if (key === 'now') {
    const ids = asNow(history, own.seq.length)
    return ids ? { key: 'now', label: 'As now', ids } : of(own)
  }
  return of(strategies.find((s) => s.key === key) ?? own)
}

/** The chosen plan season by season, for a page that prints it: each season as the ranking scores it, and the plan's measures. */
export type ChosenSeasons = Choice & { seq: Evaluation[]; metrics: StrategyMetrics }

/**
 * A strategy of the engine's is taken as the engine made it. The rotation the farm is on is scored here the same way
 * a strategy is: season by season with the farmer's weights, each on what was sown before it, and measured by the
 * engine's own function - so the printed report says of it exactly what the page does.
 */
export function chosenSeasons(choice: Choice, strategies: Strategy[], history: (CropId | null)[], ctx: FieldContext, w: Priorities): ChosenSeasons {
  const made = strategies.find((s) => s.key === choice.key)
  if (made) return { ...choice, seq: made.seq, metrics: made.metrics }
  const seq = choice.ids.map((id, i) => evaluate(CROP_BY_ID[id], [...history, ...choice.ids.slice(0, i)], ctx, w))
  return { ...choice, seq, metrics: metricsFor(choice.ids, history, ctx) }
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const list = (xs: string[]) => xs.reduce((a, x, i, all) => (i === 0 ? x : `${a}${i === all.length - 1 ? ' and ' : ', '}${x}`), '')
const names = (ids: CropId[]) => list([...new Set(ids)].map((id) => lower(CROP_BY_ID[id].name)))
const signedT = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} t C/ha`

const LEAN: Record<Exclude<PlanKey, 'now' | 'you'>, string> = {
  soil: 'the soil - organic matter and nitrogen -',
  water: 'saving water',
  profit: 'the margin',
}

/**
 * The measures a plan is compared on - the sandbox's own (RotationLab), with the same ties: a difference inside
 * `tie` is no difference. `say` words a win of `a` over `b`.
 */
type Measure = {
  key: string
  name: string
  get: (r: PlanReport) => number | null
  better: 'high' | 'low'
  tie: number
  say: (a: number, b: number) => string
}

function measures(ctx: FieldContext): Measure[] {
  const watered = ctx.irrigated || (ctx.budget ?? 0) > 0
  return [
    { key: 'loss', name: 'water-stress loss', get: (r) => r.loss, better: 'low', tie: 0.01, say: (a, b) => `Water-stress loss in a typical season: ${pct(a)}, against ${pct(b)} carrying on.` },
    { key: 'tail', name: 'loss in drought years', get: (r) => r.tail, better: 'low', tie: 0.01, say: (a, b) => `In the driest 30 % of seasons the loss is ${pct(a)}, against ${pct(b)}.` },
    ...(watered ? [{ key: 'water', name: 'irrigation water', get: (r: PlanReport) => r.water, better: 'low' as const, tie: 5, say: (a: number, b: number) => `Irrigation: ${Math.round(a)} mm a season, against ${Math.round(b)} mm.` }] : []),
    { key: 'n', name: 'fertiliser nitrogen', get: (r) => r.fertiliserN, better: 'low', tie: 10, say: (a, b) => `Fertiliser nitrogen over the plan: ${Math.round(a)} kg/ha, against ${Math.round(b)} kg/ha - after what the legumes leave.` },
    { key: 'margin', name: 'gross margin', get: (r) => r.margin, better: 'high', tie: 25, say: (a, b) => `Gross margin: ${euro(a)}/ha a season, against ${euro(b)}/ha - at reference prices.` },
    { key: 'bare', name: 'storm rain on bare soil', get: (r) => r.cover?.exposed ?? null, better: 'low', tie: 0.02, say: (a, b) => `Storm rain that falls on bare soil: ${pct(a)} of it, against ${pct(b)}.` },
    { key: 'no3', name: 'nitrate to groundwater', get: (r) => r.nitrate.mgNO3, better: 'low', tie: 2, say: (a, b) => `Nitrate in winter drainage: ${Math.round(a)} mg/L, against ${Math.round(b)} mg/L.` },
    { key: 'wp', name: 'crop per drop', get: (r) => r.kgPerM3, better: 'high', tie: 0.03, say: (a, b) => `Harvest per m³ of water used: ${a.toFixed(2)} kg, against ${b.toFixed(2)} kg.` },
    { key: 'fam', name: 'plant families', get: (r) => r.families, better: 'high', tie: 0.5, say: (a, b) => `${a} plant families in four seasons, against ${b}: longer breaks for pests and diseases.` },
    { key: 'breaks', name: 'rotation rules', get: (r) => r.breaks.length, better: 'low', tie: 0.5, say: (a, b) => `Rotation rules broken: ${a}, against ${b}.` },
  ]
}

/** +1 where `a` beats `b` on the measure, -1 where it loses, 0 inside the tie or where either has no figure. */
function verdict(m: Measure, a: PlanReport, b: PlanReport): { win: number; a: number; b: number } {
  const x = m.get(a)
  const y = m.get(b)
  if (x === null || y === null) return { win: 0, a: x ?? 0, b: y ?? 0 }
  const d = x - y
  return { win: Math.abs(d) <= m.tie ? 0 : (m.better === 'high' ? d > 0 : d < 0) ? 1 : -1, a: x, b: y }
}

export function readPlan(
  plan: PlanView,
  o: {
    /** the rotation the farm is on, when its history is known */
    now: PlanView | null
    /** every plan on the board, this one included */
    all: PlanView[]
    ctx: FieldContext
    priorities: Priorities
    /** the first season's year */
    start: number
  },
): Reading {
  const { now, all, ctx, priorities, start } = o
  const seq = plan.report.seq
  const first = seq[0]?.crop.name ?? ''
  const ms = measures(ctx)

  // ---------- why it is on the table ----------
  const why: Line[] = []
  if (plan.key === 'now') {
    why.push({ text: `What this field has just grown - ${names(plan.ids)} - sown again in the same order.` })
    why.push({ text: 'Nothing here is a suggestion. It is the yardstick: every other plan on this page is measured against it.' })
  } else if (plan.key === 'you') {
    why.push({ text: `It starts with ${lower(first)}, this season’s first pick for your priorities (soil ${priorities.soil} · water ${priorities.water} · profit ${priorities.profit}).` })
    why.push({ text: 'The three seasons after it are the best found among every sequence of the crops you allow, by the same rules that score a single season.' })
  } else {
    const w = plan.w ?? priorities
    why.push({ text: `The best four seasons found if ${LEAN[plan.key]} came first (soil ${w.soil} · water ${w.water} · profit ${w.profit}).` })
    why.push({ text: 'It is on the table because that balance is unlike yours: it shows what leaning that way would win, and what it would cost.' })
    why.push({ text: 'It was made to open with a different crop from the plans before it, so the choice between them is a real one.' })
  }

  // ---------- what it rests on ----------
  const rests: Line[] = []
  rests.push({
    text: ctx.stressYear
      ? `This field’s NASA POWER record - rain, heat, evaporation since ${ctx.baselineLabel.slice(0, 4)}. The losses here assume every season repeats ${ctx.stressYear}.`
      : `This field’s NASA POWER record - rain, heat, evaporation, every season since ${ctx.baselineLabel.slice(0, 4)} - run through each crop’s water balance (FAO-56).`,
  })
  const lab = ctx.soil.lab ?? []
  rests.push({
    text: lab.length || ctx.soil.source === 'manual'
      ? 'Your own soil test for the topsoil; SoilGrids 2.0 for what the test did not measure and for the layers below.'
      : 'SoilGrids 2.0 - sand, silt, clay and organic carbon to 2 m - for how much water this soil holds.',
  })
  const quotes = seq.map((e) => e.money).filter((m): m is NonNullable<typeof m> => !!m)
  const money = quotes[0]
  const abroad = !!ctx.market && quotes.some((m) => m.market !== ctx.market!.home)
  rests.push({
    text: quotes.some((m) => m.source === 'yours')
      ? 'Your own prices for the money; FAOSTAT yields, with rounded typical costs.'
      : abroad
        ? 'FAOSTAT prices in the market the harvest is sold in, less freight, duty and spoilage on the way; rounded typical costs.'
        : 'FAOSTAT farm-gate prices and yields of this country for the money, with rounded typical costs.',
  })
  rests.push({ text: 'Break intervals, disease bridges and legume credits from published agronomic guidance - the same for every field, not measured on this one.' })
  seq.forEach((e, i) => {
    const good = e.notes.find((n) => n.tone === 'good')
    if (good) rests.push({ text: good.text, year: start + i, crop: e.crop })
  })

  // ---------- what it gives, and at what price ----------
  const gives: Line[] = []
  const costs: Line[] = []
  if (plan.key === 'now') {
    gives.push({ text: 'No change to make: the crops, the machines and the buyers are the ones this farm already has. No number here counts that - you do.' })
    const leads = ms.filter((m) => all.every((p) => p === plan || verdict(m, plan.report, p.report).win > 0))
    if (leads.length) gives.push({ text: `Of the plans here it is the best on ${list(leads.map((m) => m.name))}.` })
    costs.push({ text: 'What it gives up is what the other plans gain - read theirs.' })
  } else if (now) {
    for (const m of ms) {
      const v = verdict(m, plan.report, now.report)
      if (v.win > 0) gives.push({ text: m.say(v.a, v.b) })
      else if (v.win < 0) costs.push({ text: m.say(v.a, v.b) })
    }
    // (the report's carbon is already the difference from the rotation the farm is on)
    const soc = plan.report.carbon.delta[plan.report.carbon.delta.length - 1] ?? 0
    if (Math.abs(soc) > 0.3) (soc > 0 ? gives : costs).push({ text: `Soil carbon after 20 years: ${signedT(soc)} against carrying on (ICBM) - what a change of rotation would do, not a measured stock.` })
    if (!gives.length) gives.push({ text: 'On these measures it does not beat carrying on as now.' })
  } else {
    // no known rotation to measure against: the plans are read against each other
    const leads = ms.filter((m) => all.length > 1 && all.every((p) => p === plan || verdict(m, plan.report, p.report).win >= 0) && all.some((p) => p !== plan && verdict(m, plan.report, p.report).win > 0))
    gives.push(leads.length ? { text: `Of the plans here it is the best on ${list(leads.map((m) => m.name))}.` } : { text: 'It leads the other plans on no single measure: it is a balance of them.' })
    gives.push({ text: 'Tell Zixtaro what grew here in the last seasons (Field) and each plan is measured against carrying on as now.' })
  }

  // ---------- what is not known ----------
  const gaps: Line[] = []
  if (!lab.length && ctx.soil.source !== 'manual') gaps.push({ text: 'The soil is SoilGrids’ estimate at 250 m, not a sample from this field. A lab test replaces it (Roots).' })
  gaps.push({ text: 'The weather is one NASA POWER cell, about 50 km across: a frost hollow, a hail track or a storm that missed the field is not in it.' })
  if (ctx.irrigationPrior !== null && ctx.irrigationPrior !== undefined) gaps.push({ text: `You have not said how the field is watered: each crop is scored between rain-fed and irrigated, by the share of cropland around that is irrigated (${pct(ctx.irrigationPrior)}).` })
  if (ctx.slopePct === null) gaps.push({ text: 'The field’s slope is not known, so erosion is not judged.' })
  const far = [...new Set(plan.ids)].filter((id) => ctx.yieldRef?.[id] && ctx.yieldRef[id]!.source !== 'country')
  if (far.length) gaps.push({ text: `Not harvested at scale in this country: ${names(far)}. The yield is taken from a wider record, and something the model does not see - a buyer, pests, cultivars, know-how - may keep farms off it.` })
  const guessed = [...new Set(seq.filter((e) => e.money?.source === 'estimate').map((e) => e.crop.id))]
  if (guessed.length) gaps.push({ text: `No price is on record here for ${names(guessed)}: the margin stands on an estimate.` })
  if (!money || money.source !== 'yours') gaps.push({ text: 'The margins are a yardstick between crops, not a budget: national prices and typical costs. Your own prices change them (Market).' })
  const flagged = seq.reduce((n, e) => n + e.flags.length, 0)
  if (flagged) gaps.push({ text: `${flagged} rotation ${flagged === 1 ? 'risk' : 'risks'} below ${flagged === 1 ? 'is' : 'are'} named but not priced in the score: guidance with no measured yield figure behind it.` })
  gaps.push({ text: 'Pests, diseases and weeds enter as break rules and a warmth index - never as a forecast for this field.' })

  // ---------- what to check on the ground ----------
  const check: Line[] = []
  const seen = new Set<string>()
  const add = (l: Line) => {
    if (seen.has(l.text) || check.length >= 6) return
    seen.add(l.text)
    check.push(l)
  }
  for (const level of ['high', 'moderate'] as const) seq.forEach((e, i) => e.flags.filter((f) => f.level === level).forEach((f) => add({ text: f.text, year: start + i, crop: e.crop })))
  for (const tone of ['bad', 'warn'] as const)
    seq.forEach((e, i) => e.notes.filter((n) => n.tone === tone && !unpriced(n) && (n.tag === 'rotation' || n.tag === 'soil' || n.tag === 'water')).forEach((n) => add({ text: n.text, year: start + i, crop: e.crop })))
  check.push({ text: 'Variety, sowing date, herbicide carry-over, machinery and contracts are decided on the farm: none of them is in the model. Take this list to your agronomist.' })

  return { why, rests, gives, costs, gaps, check }
}
