// What the greenhouse cutaway shows for one month, derived once from the model's own numbers: the stat row above the
// drawing, the 3D section (GreenhouseCutaway3D) and the flat fallback (GreenhouseCutawayFlat) all read the same values,
// so the pictures can never say something the model did not.
import { insideByDay, type GhMonth, type GhResult } from './greenhouse'

/** crops trained up high wires (the drawings grow them tall) */
export const TALL_CROPS = new Set(['tomato', 'cherry', 'cucumber', 'pepper'])

/** Tank level at the end of each month of a typical year (two passes to settle into the cycle). */
export function tankLevels(months: GhMonth[], capMm: number): number[] {
  let store = 0
  const out: number[] = []
  for (let pass = 0; pass < 2; pass++) {
    months.forEach((m, i) => {
      const need = m.state === 'harvest' || m.state === 'establish' ? m.demandMm : 0
      store = Math.min(capMm, store + m.catchMm)
      store -= Math.min(need, store)
      if (pass === 1) out[i] = capMm > 0 ? store / capMm : 0
    })
  }
  return out
}

/** the tank's level through a typical year, as a share of its capacity */
export const yearTank = (result: GhResult) => tankLevels(result.months, (result.water.tankM3 / result.spec.floorM2) * 1000)

export type CutawayMonth = {
  m: GhMonth
  /** the crop stands in the house this month (planted or harvesting) */
  inCrop: boolean
  /** the month's daylight outside, as a share of the brightest month's (the sun's height and strength) */
  light: number
  /** the daylight reaching the crop through the cover, same scale */
  inLight: number
  /** the boiler's share of its hardest month; 0 unless it really works (≥ 5 kWh/m² in the month) */
  heat: number
  lamps: boolean
  /** the shade screen is drawn */
  shade: boolean
  /** the night energy screen is drawn */
  screen: boolean
  /** rain on the roof, mm */
  rainMm: number
  /** tank level at the month's end, 0-1 */
  level: number
  /** the crop's growth, 0 (empty) → 1 (full height) */
  growth: number
  harvest: boolean
  /** mean daily maximum inside, °C */
  inside: number
  /** hotter inside by day than the crop tolerates */
  hot: boolean
  /** a dark month: the sky the drawings show is night */
  night: boolean
  /** roof vents, 0 shut → 1 wide open: how far the house runs over the crop's day set point with full ventilation */
  vent: number
  /** snow lying outside, 0-1: only when the month's mean outside is below freezing */
  snow: number
  /** hoar frost on the ground, 0-1: the month's mean night minimum below freezing */
  frost: number
  /** the ground outside is wet (puddles, sheen), 0-1, from the month's rain */
  wet: number
  /** the vegetation outside is green, 0 (winter) → 1 (growing season), from the outside mean */
  green: number
  /** condensation on the inside of the cover, 0-1: a crop in a warm, humid house under a cold sky */
  fog: number
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

export function cutawayMonth(result: GhResult, month: number, levels: number[]): CutawayMonth {
  const m = result.months[month]
  const crop = result.crop
  const spec = result.spec
  const inCrop = m.state === 'harvest' || m.state === 'establish'
  const maxDli = Math.max(...result.months.map((x) => x.dliOut), 1)
  const maxHeat = Math.max(...result.months.map((x) => x.heatKwh), 1)
  const light = m.dliOut / maxDli
  const heat = spec.heated && inCrop && m.heatKwh >= 5 ? m.heatKwh / maxHeat : 0
  const inside = insideByDay(m, spec, crop)
  const planIdx = result.plan.months.indexOf(month + 1)
  const growth = m.state === 'harvest' ? 1 : m.state === 'establish' ? Math.min(0.92, 0.3 + (0.5 * (planIdx + 1)) / Math.max(1, crop.lag)) : 0
  return {
    m,
    inCrop,
    light,
    inLight: m.dliIn / maxDli,
    heat,
    lamps: spec.lit && inCrop && m.supp > 0,
    shade: inCrop && m.shade !== 'none',
    screen: spec.screen && heat > 0,
    rainMm: m.catchMm / 0.85,
    level: levels[month] ?? 0,
    growth,
    harvest: m.state === 'harvest',
    inside,
    hot: inside > crop.maxT,
    night: light < 0.4,
    vent: clamp01((m.insideDayMax - crop.dayT + 2) / 8),
    snow: m.tOut < 0 ? clamp01(0.45 - m.tOut / 5) : 0,
    frost: m.tMinOut < 0 ? clamp01(-m.tMinOut / 6) : 0,
    wet: m.tOut < 0 ? 0 : clamp01((m.catchMm / 0.85 - 40) / 50),
    green: clamp01((m.tOut - 5) / 9),
    fog: inCrop ? clamp01((10 - m.tOut) / 12) : 0,
  }
}
