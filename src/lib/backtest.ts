// "Would Zixtaro have called it?" - a backtest on the farmer's own field. For every past season
// with complete NASA data, re-run the recommendation using only the record a farmer could have had
// when deciding (complete years up to two years before harvest - no peeking at the season itself),
// then score what really happened that season: water-stress loss of Zixtaro's pick vs the crop
// that was actually grown, both from the same water model on the season's observed weather.

import { analyzeClimate, type ClimateAnalysis } from './climate'
import { CROP_BY_ID, type Crop, type CropId } from './crops'
import { evaluate, rankNext, type FieldContext, type Priorities } from './rotation'
import { rootZoneWater, type SoilProfile } from './soil'
import { allCropRisks, bareSoil, paddyFor, simulateSeason, type CropRisk } from './water'
import { winterDrainage } from './nitrate'
import { rFactor } from './erosion'

export type BacktestRow = {
  year: number // harvest year
  dataTo: number // last complete year of NASA data the pick was allowed to see
  grown: CropId | null
  pick: CropId
  /** rainfed: water-stress yield loss 0..1; irrigated: irrigation needed, mm */
  grownValue: number | null
  pickValue: number
  grownBrokeRotation: boolean // the grown crop broke a break-interval or disease rule
  verdict: 'better' | 'same' | 'worse' | 'n/a'
}

export type Backtest = { rows: BacktestRow[]; better: number; same: number; worse: number; irrigated: boolean }

/**
 * What each backtest pick may know. Everything time-dependent is cut at `dataTo`; two inputs are taken from today
 * because no archive exists for them: the SoilGrids soil map (soil texture barely changes in decades) and the
 * reference prices (the pick is about water, the verdict ignores money).
 */
export const BACKTEST_FROM_TODAY = ['SoilGrids soil map', 'reference prices', 'your priorities and crop list']

/**
 * @param history oldest → newest, the last entry being the season harvested in `lastYear`
 */
export function backtest(
  climate: ClimateAnalysis, soil: SoilProfile, history: (CropId | null)[], lastYear: number,
  priorities: Priorities, exclude: Set<CropId>, irrigated: boolean, budget = 0,
): Backtest {
  const recs = [...climate.byMonth.values()]
  const rows: BacktestRow[] = []
  history.forEach((grown, i) => {
    const year = lastYear - (history.length - 1 - i)
    if (year > climate.lastYear) return // the season's weather is not in the record yet
    const dataTo = year - 2
    let past: ClimateAnalysis
    try {
      past = analyzeClimate(recs.filter((r) => r.year <= dataTo), climate.lat, climate.lon)
    } catch {
      return // too short a record before this season
    }
    const ctx: FieldContext = {
      risks: allCropRisks(past, soil, irrigated ? 0 : budget),
      soil,
      stressYear: null,
      irrigated,
      budget: irrigated ? 0 : budget,
      drying: past.signal.drying,
      slopePct: null,
      // the same field inputs the live ranking uses, computed from the past record only
      winterDrain: winterDrainage(past, soil),
      erosivity: rFactor(past.monthly.recent),
      recentLabel: `${past.recent.from}-${past.recent.to}`,
      baselineLabel: `${past.baseline.from}-${past.baseline.to}`,
    }
    const before = history.slice(0, i)
    const pick = rankNext(before, ctx, priorities, exclude)[0]?.crop
    if (!pick) return
    const outcome = (id: CropId) => {
      // the season's observed weather, with the same water budget the pick assumed, for one form of the crop: after a
      // bare fallow it starts on the rain it stored, and rice grows in its paddy, as the score has them
      const one = (c: Crop) => {
        const bare = before[before.length - 1] === 'fallow' && !c.perennial ? bareSoil(soil) : undefined
        const s = simulateSeason(c, climate, rootZoneWater(soil, c.rootDepth), year, irrigated ? 0 : budget, 1, paddyFor(c, soil), bare)
        return s ? (irrigated ? s.deficit : s.loss) : null
      }
      // the form the field grew that year (spring wheat where winters killed the winter form), and near a switch both,
      // weighted as the pick was scored (water.ts formsOf)
      const value = (r: CropRisk | undefined): number | null => {
        const main = one(r?.crop ?? CROP_BY_ID[id])
        const alt = r?.alt?.risk.crop ? value(r.alt.risk) : null
        return main !== null && alt !== null ? (1 - r!.alt!.w) * main + r!.alt!.w * alt : main
      }
      return value(ctx.risks[id])
    }
    const pickValue = outcome(pick.id)
    if (pickValue === null) return
    const grownValue = grown ? outcome(grown) : null
    // broke the rotation = guidance the score does not price was ignored (a high flag, history v3); priced repeats are not "broken"
    const grownBrokeRotation = grown ? evaluate(CROP_BY_ID[grown], before, ctx, priorities).flags.some((f) => f.level === 'high') : false
    // A crop without a harvest (green fallow, ley) can't lose yield - comparing it would flatter it.
    const comparable = grown !== null && grownValue !== null && CROP_BY_ID[grown].ky > 0 && pick.ky > 0
    const tie = irrigated ? 10 : 0.02
    const verdict = !comparable ? 'n/a' : Math.abs(pickValue - grownValue!) <= tie ? 'same' : pickValue < grownValue! ? 'better' : 'worse'
    rows.push({ year, dataTo, grown, pick: pick.id, grownValue, pickValue, grownBrokeRotation, verdict })
  })
  return {
    rows,
    better: rows.filter((r) => r.verdict === 'better').length,
    same: rows.filter((r) => r.verdict === 'same').length,
    worse: rows.filter((r) => r.verdict === 'worse').length,
    irrigated,
  }
}
