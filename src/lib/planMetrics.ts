// One multi-season rotation, measured every way the plan section compares rotations: score, water, nitrogen,
// money, soil carbon, soil cover and water productivity. Used by the strategies, the sandbox and the soil outlook,
// so a hand-built rotation and Zixtaro's own are judged by exactly the same numbers.

import type { ClimateAnalysis } from './climate'
import { CROP_BY_ID, type CropId } from './crops'
import { evaluate, formIn, nitrogenNeed, type Evaluation, type FieldContext, type Priorities } from './rotation'
import { decompFactor, perMille, socStock30, soilOutlook, topsoilWater, type CoverFigures } from './soilcarbon'
import { riskAfter, waterIn } from './water'
import { leaching, winterDrainage, type Leaching } from './nitrate'

export const HORIZON_YEARS = 20

export type PlanEnv = {
  climate: ClimateAnalysis
  /** erosive rain energy by calendar month (NASA POWER daily), or null while daily data loads */
  erosivity: number[] | null
  strawRemoved: boolean
  catchCrops: boolean
}

export type PlanReport = {
  seq: Evaluation[]
  score: number // mean score over the seasons, with the farmer's weights
  loss: number // mean water-stress loss, typical recent season
  tail: number // mean loss in the driest 30 % of seasons
  water: number // irrigation per season, mm (applied from the budget, or needed when unlimited)
  fertiliserN: number // kg N/ha over the plan, after legume credits
  margin: number // mean expected gross margin, €/ha per season
  families: number
  breaks: { season: number; text: string }[] // rotation rules the plan breaks
  carbon: {
    humified: number // t C/ha per season that builds lasting organic matter
    delta: number[] // ΔSOC vs repeating the reference rotation, t C/ha, years 1…20
    perMille: number // ‰ of the 0-30 cm stock per year (4 per 1000 initiative yardstick)
    waterGain: number // plant-available water gained in the top 30 cm after 20 years, mm
  }
  cover: CoverFigures | null
  /** kg of harvest per m³ of water the crops used (FAO water productivity), harvested crops only */
  kgPerM3: number
  /** gross margin per mm of crop water use, €/ha/mm */
  eurPerMm: number
  /** nitrate washed below the roots over winter (Burns 1974 on NASA POWER drainage) */
  nitrate: Leaching
}

const shareOf = (id: CropId, ctx: FieldContext, w: Priorities) => evaluate(CROP_BY_ID[id], [], ctx, w).yieldShare

/** The rotation a farm is on now: its last (up to) four known seasons. Null when fewer than two are known. */
export function currentRotation(history: (CropId | null)[]): CropId[] | null {
  const known = history.filter((x): x is CropId => x !== null).slice(-4)
  return known.length >= 2 ? known : null
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
/** each season of a plan scored after the seasons before it */
const planSeq = (seqIds: CropId[], history: (CropId | null)[], ctx: FieldContext, w: Priorities) => seqIds.map((id, i) => evaluate(CROP_BY_ID[id], [...history, ...seqIds.slice(0, i)], ctx, w))

/**
 * A plan's score alone: the ledger's last column without the soil outlook, nitrogen and leaching behind the others.
 * The story's plan plate sets the plans side by side with it, so the plate carries none of the workings' weight.
 */
export const planScore = (seqIds: CropId[], history: (CropId | null)[], ctx: FieldContext, w: Priorities): number => avg(planSeq(seqIds, history, ctx, w).map((e) => e.score))

export function planReport(seqIds: CropId[], history: (CropId | null)[], ctx: FieldContext, w: Priorities, env: PlanEnv, ref: CropId[] | null): PlanReport {
  const seq = planSeq(seqIds, history, ctx, w)
  const water = seqIds.map((id, i) => waterIn(riskAfter(ctx.risks[id], seq[i].afterFallow), ctx.stressYear))
  const breaks = seq.flatMap((e, i) => e.notes.filter((n) => n.tag === 'rotation' && n.tone === 'bad').map((n) => ({ season: i, text: n.text })))
  const hemi = env.climate.season.hemisphere
  const re = decompFactor(env.climate.monthly.recent)
  const reference = ref ?? seqIds
  const outlook = soilOutlook(
    { seq: seqIds, shares: seq.map((e) => e.yieldShare) },
    { seq: reference, shares: reference.map((id) => shareOf(id, ctx, w)) },
    { re, years: HORIZON_YEARS, hemi, normals: env.climate.monthly.recent, erosivity: env.erosivity, strawRemoved: env.strawRemoved, catchCrops: env.catchCrops, form: formIn(ctx) },
  )
  const stock = socStock30(ctx.soil)
  const d20 = outlook.delta[outlook.delta.length - 1] ?? 0
  const harvested = seq.map((e) => ({ e })).filter(({ e }) => e.crop.econ.yield > 0 && e.crop.group !== 'forage')
  return {
    seq,
    score: avg(seq.map((e) => e.score)),
    loss: avg(water.map((f, i) => (seq[i].crop.ky > 0 ? f.loss : 0))),
    tail: avg(water.map((f, i) => (seq[i].crop.ky > 0 ? f.bad : 0))),
    water: avg(water.map((f) => (ctx.irrigated ? f.deficit : f.irrigation))),
    fertiliserN: nitrogenNeed(seqIds, history[history.length - 1] ?? null, formIn(ctx)).n,
    margin: avg(seq.map((e) => e.margin)),
    families: new Set(seqIds.map((id) => CROP_BY_ID[id].family).filter((f) => f !== 'none')).size,
    breaks,
    carbon: {
      humified: outlook.humified,
      delta: outlook.delta,
      perMille: perMille(d20, stock, HORIZON_YEARS),
      waterGain: stock > 0 ? topsoilWater(ctx.soil, (stock + d20) / stock) - topsoilWater(ctx.soil) : 0,
    },
    cover: outlook.cover,
    kgPerM3: avg(harvested.map(({ e }) => e.kgPerM3)),
    nitrate: leaching(seqIds, winterDrainage(env.climate, ctx.soil), ctx.soil, env.catchCrops, formIn(ctx)),
    eurPerMm: avg(harvested.map(({ e }) => e.eurPerMm)),
  }
}
