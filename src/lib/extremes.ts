// Weather extremes at the moments that decide a harvest, from NASA POWER *daily* data.
//
// A monthly mean hides a heat wave: a July averaging 27 °C can hold five days above 35 °C exactly at silking.
// Two day-by-day risks replace the monthly proxy:
//
// · Heat at flowering - degree-days of Tmax above the crop's critical temperature for pollen and seed set over its
//   flowering window: the loss grows with them up to a full hit at HEAT_DD_FULL (Schlenker & Roberts 2009: yield falls
//   linearly in degree-days above a threshold). Heat waves - seasons with ≥ 3 days at or above it - are still counted
//   for the page: short heat waves already cost grain number. Thresholds from reviews of crop heat stress:
//   Porter & Gawith 1999 (wheat 31 °C at anthesis),
//   Morrison & Stewart 2002 (canola 29.5 °C), Schlenker & Roberts 2009 / Sánchez et al. 2014 (maize ~35 °C at
//   pollination), Prasad et al. 2006-2008 (sorghum 36 °C, soybean 35 °C), Guilioni et al. 1997 (pea 30 °C),
//   Sita et al. 2017 (lentil 32 °C), Devasirvatham et al. 2012 (chickpea 35 °C), Hatfield et al. 2011.
// · Frost after emergence - for frost-tender spring crops, a night at or below −2 °C in the month after emergence
//   (sowing date + 10 days), which kills or sets back seedlings of maize, soybean, sunflower, sorghum, millet,
//   buckwheat and potato (FAO-56 calendars give the sowing day).

import type { ClimateAnalysis } from './climate'
import { advanceSpan, calendarShift, CROP_BY_ID, cropSeason, FLOWERING_DAYS, floweringOn, floweringStart, sowingSpan, type Crop, type CropId } from './crops'
import type { Daily } from './dailyFormat'
import type { CropRisk } from './water'
import { EXTRA_FROST_TENDER, EXTRA_T_CRIT } from './cropsExtra'

const DAY = 86_400_000

/** Critical daily maximum at flowering / seed set, °C. Crops without a grain or fruit stage are not listed. */
export const T_CRIT: Partial<Record<CropId, number>> = {
  wheat: 31, barley: 30, rye: 31, triticale: 31, oats: 30,
  maize: 35, sorghum: 36, millet: 38,
  sunflower: 35, rapeseed: 29.5, linseed: 32,
  soybean: 35, pea: 30, lupin: 30, faba: 30, lentil: 32, chickpea: 35,
  buckwheat: 30, potato: 30,
  // Hatfield et al. 2011 failure temperatures at reproduction: rice 35, cotton 35, peanut 39, bean 32; cowpea and pearl millet as their closest kin
  rice: 35, cotton: 35, groundnut: 39, drybean: 32, cowpea: 35, pearlmillet: 38,
  ...EXTRA_T_CRIT,
}
/** A heat wave at flowering, as the page reports it: at least this many days at or above the critical temperature. */
export const HOT_DAYS_HIT = 3
/**
 * Degree-days of daily maximum above the critical temperature, summed over the flowering window, at which a season
 * takes the full heat loss (rotation.ts DEFAULT_TUNING.heat); fewer cost proportionally less. Earlier, a
 * season was hit or not - 3 hot days cost the full loss and 2 nothing - so the warming scenario moved yields in steps
 * (120 of 310 crop-cells jumped more than 5 % over a single 0.5-degree step). An assumption: 7 degree-days keeps the
 * old rule's mean loss on the demo fields (0.27 of a full hit either way) and within 6 % on the development cells
 * (0.32 → 0.31); a season with exactly 3 hot days holds a median 3.7 degree-days.
 */
export const HEAT_DD_FULL = 7
export const FROST_KILL = -2
export const FROST_TENDER: CropId[] = ['maize', 'sorghum', 'soybean', 'sunflower', 'millet', 'buckwheat', 'potato', 'rice', 'cassava', 'sweetpotato', 'groundnut', 'cowpea', 'drybean', 'cotton', 'pearlmillet', ...EXTRA_FROST_TENDER]

export type Extremes = {
  /** baseline / recent: mean heat damage of a season, 0..1 (HEAT_DD_FULL); days: mean days at or above tCrit; waves:
   *  share of seasons with a heat wave (HOT_DAYS_HIT) */
  heat: { baseline: number; recent: number; days: { baseline: number; recent: number }; waves: { baseline: number; recent: number }; tCrit: number; month: number }
  frost: { baseline: number; recent: number } | null
}

type Window = { from: number; to: number }

/**
 * @param dT optional warming per calendar month (what-if scenarios shift daily Tmax/Tmin by the same delta)
 */
export function cropExtremes(which: CropId | Crop, d: Daily, climate: ClimateAnalysis, dT?: number | number[]): Extremes | null {
  const crop = typeof which === 'string' ? CROP_BY_ID[which] : which
  const id = crop.id
  const tCrit = T_CRIT[id]
  if (!crop.heat || tCrit === undefined) return null
  const hemi = climate.season.hemisphere
  const normals = climate.monthly.recent
  const t0 = Date.parse(`${d.start}T00:00:00Z`)
  const idx = (y: number, m: number, day: number) => Math.round((Date.UTC(y, m - 1, day) - t0) / DAY)
  const shift = (m: number) => (dT === undefined ? 0 : Array.isArray(dT) ? (dT[m - 1] ?? 0) : dT)
  const inRecent = (y: number) => y >= climate.recent.from && y <= climate.recent.to
  const warmed = (y: number) => dT !== undefined && inRecent(y)
  const over = <T,>(w: Window, f: (y: number) => T | null) => {
    const vals: T[] = []
    for (let y = w.from; y <= w.to; y++) {
      const v = f(y)
      if (v !== null) vals.push(v)
    }
    return vals
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

  // One calendar's flowering window and the weeks after its sowing. A sowing between two whole months (crops.ts
  // sowingSpan: a wait for warmth, the day the rains start, a cool-season sowing near its seed-bed minimum) reads both
  // whole-month calendars' windows and weighs them, as the water balance does: the windows stay on their days and only
  // their weights and temperatures move with a warmer scenario. Earlier, the window slid by whole days with the
  // sowing date, and a day more or less of a ten-year record moved the heat loss in jumps.
  const reading = (calShift?: number) => {
    const season = cropSeason(crop, hemi, normals, calShift)
    // the flowering window: 21 days from the start of the FAO-56 mid-season stage where the crop has FAO stages, else
    // from the start of its heat-sensitive month - a hot day before or after flowering (at grain fill) does not count.
    // A crop that ripens earlier in a warmer climate flowers earlier by the same share of a month (advanceSpan): the
    // window slides between the two whole-month calendars instead of jumping a month (earlier +0.5 °C moved
    // Torgau's winter wheat from June to May and its heat at flowering from 20 % of seasons to none).
    const flower = calShift === undefined ? floweringStart(crop, hemi, normals) : floweringOn(crop, calShift)
    const span = advanceSpan(crop, hemi, normals)
    const shifted = calShift ?? calendarShift(crop, hemi, normals)
    const sensitive = crop.heat!.month
    const monthAt = (advance: number) => ((sensitive - 1 + shifted - advance + 24) % 12) + 1
    const heatMonth = flower ? flower.month : monthAt(span.f < 0.5 ? span.lo : span.hi)
    const yearOf = (m: number) => season.find((x) => x.month === m)?.yearOffset ?? 0
    const startOf = (y: number) => {
      if (flower) return idx(y + yearOf(flower.month), flower.month, flower.day)
      const [a, b] = [monthAt(span.lo), monthAt(span.hi)]
      return Math.round((1 - span.f) * idx(y + yearOf(a), a, 1) + span.f * idx(y + yearOf(b), b, 1))
    }
    const first = season[0]
    const hotDays = (y: number): { n: number; dd: number } | null => {
      const s = startOf(y)
      const e = s + FLOWERING_DAYS
      if (s < 0 || e > d.tmax.length) return null
      let n = 0
      let dd = 0
      for (let i = s; i < e; i++) {
        const t = d.tmax[i]
        if (t == null) continue
        const over = t + (warmed(y) ? shift(heatMonth) : 0) - tCrit
        if (over >= 0) n++
        dd += Math.max(0, over)
      }
      return { n, dd }
    }
    const frostHit = (y: number): boolean | null => {
      const sowDay = crop.fao?.sow[1] ?? 15
      const year = y + first.yearOffset
      const s = idx(year, first.month, sowDay) + 10
      if (s < 0 || s + 30 > d.tmin.length) return null
      for (let i = s; i < s + 30; i++) {
        const m = new Date(t0 + i * DAY).getUTCMonth() + 1
        const t = d.tmin[i]
        if (t != null && t + (warmed(y) ? shift(m) : 0) <= FROST_KILL) return true
      }
      return false
    }
    const hb = over(climate.baseline, hotDays)
    const hr = over(climate.recent, hotDays)
    if (hb.length < 5 || hr.length < 3) return null
    const damage = (xs: { dd: number }[]) => mean(xs.map((x) => Math.min(1, x.dd / HEAT_DD_FULL)))
    const waves = (xs: { n: number }[]) => mean(xs.map((x) => +(x.n >= HOT_DAYS_HIT)))
    const days = (xs: { n: number }[]) => mean(xs.map((x) => x.n))
    const frost = FROST_TENDER.includes(id)
      ? { baseline: mean(over(climate.baseline, frostHit).map(Number)), recent: mean(over(climate.recent, frostHit).map(Number)) }
      : null
    return {
      heat: { baseline: damage(hb), recent: damage(hr), days: { baseline: days(hb), recent: days(hr) }, waves: { baseline: waves(hb), recent: waves(hr) }, tCrit, month: heatMonth },
      frost: frost && Number.isFinite(frost.recent) ? frost : null,
    }
  }

  const sow = crop.fao ? sowingSpan(crop, hemi, normals) : null
  if (!sow) return reading()
  const [a, b] = [reading(sow.lo), reading(sow.hi)]
  if (!a || !b) return a ?? b
  const m = (x: number, y: number) => (1 - sow.f) * x + sow.f * y
  const pair = (x: { baseline: number; recent: number }, y: { baseline: number; recent: number }) => ({ baseline: m(x.baseline, y.baseline), recent: m(x.recent, y.recent) })
  return {
    heat: { ...pair(a.heat, b.heat), days: pair(a.heat.days, b.heat.days), waves: pair(a.heat.waves, b.heat.waves), tCrit, month: (sow.f < 0.5 ? a : b).heat.month },
    frost: a.frost && b.frost ? pair(a.frost, b.frost) : (a.frost ?? b.frost),
  }
}

/** The crop risks with heat and frost read day by day. Crops without a daily reading keep the monthly proxy. */
export function withDailyExtremes(risks: Record<CropId, CropRisk>, d: Daily, climate: ClimateAnalysis, dT?: number | number[]): Record<CropId, CropRisk> {
  const daily = (r: CropRisk, id: CropId): CropRisk => {
    // the other side of a switch (water.ts formsOf) reads its own calendar's days too
    const alt = r.alt ? { ...r.alt, risk: daily(r.alt.risk, id) } : undefined
    const x = cropExtremes(r.crop ?? id, d, climate, dT)
    if (!x) return alt ? { ...r, alt } : r
    return {
      ...r,
      heat: { baseline: x.heat.baseline, recent: x.heat.recent, seasons: x.heat.waves },
      heatDaily: { days: x.heat.days, tCrit: x.heat.tCrit, month: x.heat.month },
      frost: x.frost ?? undefined,
      ...(alt ? { alt } : {}),
    }
  }
  return Object.fromEntries((Object.keys(risks) as CropId[]).map((id) => [id, daily(risks[id], id)])) as Record<CropId, CropRisk>
}
