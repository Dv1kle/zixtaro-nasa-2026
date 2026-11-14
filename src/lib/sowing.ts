// Sow earlier or later? Calendars in Zixtaro start from typical Central-European sowing dates, but warming moves
// the best window. For every spring- or summer-sown crop with an FAO-56 calendar, the whole season is shifted by
// three and six weeks either way and re-run through the same models - water stress on this field's soil, heat
// at flowering and frost after emergence from NASA POWER daily data, warmth to mature - under two hard limits:
// the soil must be warm enough to sow into (monthly mean air temperature as its proxy), and the crop must still
// ripen. The best window is the one with the highest expected share of yield; the tip names what it buys.

import type { ClimateAnalysis } from './climate'
import { calendarShift, CROP_BY_ID, MIN_SOW_T, tempOnDay, type Crop, type CropId } from './crops'
import type { Daily } from './dailyFormat'
import { cropExtremes, FROST_TENDER } from './extremes'
import { monthlyKc } from './fao56'
import type { SoilProfile } from './soil'
import { cropRisk, formOf } from './water'

export { MIN_SOW_T }
export const SHIFTS = [-42, -21, 0, 21, 42]
const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function addDays([m, d]: [number, number], days: number): [number, number] {
  let doy = DAYS_IN.slice(0, m - 1).reduce((a, b) => a + b, 0) + d - 1 + days
  doy = ((doy % 365) + 365) % 365
  let month = 0
  while (doy >= DAYS_IN[month]) doy -= DAYS_IN[month++]
  return [month + 1, doy + 1]
}

/** The same crop sown `days` later (negative = earlier); only crops with an FAO-56 calendar can move. */
export function shiftedCrop(crop: Crop, days: number): Crop | null {
  if (!crop.fao || days === 0) return days === 0 ? crop : null
  const sow = addDays(crop.fao.sow, days)
  const fao = { ...crop.fao, sow }
  const months = Math.round(days / 30)
  return {
    ...crop,
    fao,
    kc: monthlyKc(fao),
    sow: sow[0],
    heat: crop.heat ? { ...crop.heat, month: ((crop.heat.month - 1 + months + 12) % 12) + 1 } : null,
  }
}

const doyOf = ([m, d]: [number, number]) => DAYS_IN.slice(0, m - 1).reduce((a, b) => a + b, 0) + d

/** Mean day of year of the first autumn frost (Tmin ≤ −1 °C) in the recent decade, in the crop's own calendar. */
export function firstAutumnFrost(d: Daily, climate: ClimateAnalysis): number | null {
  const t0 = Date.parse(`${d.start}T00:00:00Z`)
  const south = climate.season.hemisphere === 'south'
  const hits: number[] = []
  for (let y = climate.recent.from; y <= climate.recent.to; y++) {
    // search from mid-summer: 15 Jul in the north, 15 Jan in the south
    const s = Math.round((Date.UTC(y, south ? 0 : 6, 15) - t0) / 86_400_000)
    for (let i = s; i < s + 200 && i < d.tmin.length; i++) {
      if (i >= 0 && (d.tmin[i] ?? 99) <= -1) {
        hits.push((south ? 196 : 196) + (i - s)) // expressed on the northern calendar: 15 Jul = day 196
        break
      }
    }
  }
  return hits.length >= 5 ? hits.reduce((a, b) => a + b, 0) / hits.length : null
}

export type SowOption = {
  shift: number // days vs the standard date
  sow: [number, number] // Northern-Hemisphere calendar date (the south adds six months)
  ok: boolean
  why?: string // why this window is ruled out
  loss: number
  /** heat at flowering: the mean loss share (in the index), and the share of seasons with a heat wave (shown) */
  heat: number
  waves: number
  frost: number
  thermal: number
  index: number // expected share of yield from these factors
}
export type SowAdvice = { id: CropId; /** the form the advice is for (spring wheat where winters kill the winter form) */ crop: Crop; now: SowOption; best: SowOption; options: SowOption[] }

export function sowingAdvice(ids: CropId[], climate: ClimateAnalysis, soil: SoilProfile, daily: Daily | null, budget = 0, transpiration = 1): SowAdvice[] {
  const hemi = climate.season.hemisphere
  const frostDay = daily ? firstAutumnFrost(daily, climate) : null
  const out: SowAdvice[] = []
  for (const id of ids) {
    const base = formOf(CROP_BY_ID[id], climate)
    const minT = MIN_SOW_T[id]
    if (!base.fao || minT === undefined) continue
    // the standard date on this field - the reference date moved to the rains or until the seed-bed has warmed - fixed
    // there, so the windows around it are real dates and not pulled back to the same month
    const months = hemi === 'south' ? 6 : 0 // what is left: the south sows six months after the northern date
    const moved = calendarShift(base, hemi, climate.monthly.recent) - months
    const anchor: Crop = { ...(moved ? shiftedCrop(base, Math.round(moved * 30.44))! : base), fixedSow: true }
    const options: SowOption[] = []
    for (const shift of SHIFTS) {
      const crop = shift === 0 ? anchor : shiftedCrop(anchor, shift)
      if (!crop) continue
      const risk = cropRisk(crop, climate, soil, budget, transpiration)
      const x = daily ? cropExtremes(crop, daily, climate) : null
      const heat = x?.heat.recent ?? risk.heat.recent
      const waves = x?.heat.waves.recent ?? risk.heat.seasons?.recent ?? heat
      const frost = x?.frost?.recent ?? 0
      const thermal = risk.thermal.recent
      const local: [number, number] = months ? addDays(crop.fao!.sow, months === 6 ? 182 : Math.round(months * 30.44)) : crop.fao!.sow
      const tSow = tempOnDay(climate.monthly.recent, local)
      const harvestDoy = doyOf(crop.fao!.sow) + crop.fao!.days.reduce((a, b) => a + b, 0) - 1
      let why: string | undefined
      if (!(tSow >= minT)) why = `too cold to sow (${tSow.toFixed(0)} °C, needs ${minT} °C)`
      else if (thermal < 0.6) why = 'too little warmth left to ripen'
      else if (frostDay !== null && FROST_TENDER.includes(id) && harvestDoy > frostDay - 21) why = 'would still be drying in the field at the first autumn frost'
      const loss = base.ky > 0 ? risk.recent.loss : 0
      options.push({ shift, sow: crop.fao!.sow, ok: !why, why, loss, heat, waves, frost, thermal, index: thermal * (1 - loss) * (1 - 0.3 * heat) * (1 - 0.3 * frost) })
    }
    const now = options.find((o) => o.shift === 0)
    if (!now) continue
    const best = options.filter((o) => o.ok).sort((a, b) => b.index - a.index || Math.abs(a.shift) - Math.abs(b.shift))[0] ?? now
    out.push({ id, crop: base, now, best, options })
  }
  return out
}
