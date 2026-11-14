// src/lib/data/derive/thermal.ts
// Climate indices from the NASA POWER daily record the page already loads: the frost-free season and its trend,
// the day-night temperature swing, the share of rain from extreme days (ETCCDI), the UNEP aridity index, and the
// day a crop will have had enough warmth to ripen.
import type { MonthNormal } from '../../climate'
import type { Daily } from '../../dailyFormat'
import { median, quantile, senSlope } from '../../stats'

const DAY_MS = 86_400_000
const MIDSUMMER = 182 // season day that splits spring from autumn frosts (1 July north, 1 January south)

export const dateAt = (d: Daily, i: number) => new Date(Date.parse(`${d.start}T00:00:00Z`) + i * DAY_MS)
export const isoDay = (t: Date) => t.toISOString().slice(0, 10)

export type FrostSeason = { year: number; lastSpring: number | null; firstAutumn: number | null; length: number }

/**
 * The frost-free season of every complete year, from the last night at or below `threshold` before midsummer to the
 * first one after it. North of the equator a season runs January-December; south of it July-June, so the southern
 * summer is never cut in two. Day numbers count from the season's first day (0 = 1 January or 1 July). A year
 * without frost counts 365 days and has no dates. Years with more than 10 % of nights missing are skipped.
 */
export function frostFreeSeasons(d: Daily, lat: number, threshold = 0): FrostSeason[] {
  const south = lat < 0
  const years = new Map<number, { k: number[]; t: (number | null)[] }>()
  for (let i = 0; i < d.tmin.length; i++) {
    const t = dateAt(d, i)
    const y = south ? (t.getUTCMonth() >= 6 ? t.getUTCFullYear() : t.getUTCFullYear() - 1) : t.getUTCFullYear()
    const start = south ? Date.UTC(y, 6, 1) : Date.UTC(y, 0, 1)
    let rec = years.get(y)
    if (!rec) years.set(y, (rec = { k: [], t: [] }))
    rec.k.push(Math.round((t.getTime() - start) / DAY_MS))
    rec.t.push(d.tmin[i])
  }
  const out: FrostSeason[] = []
  for (const [year, rec] of years) {
    if (rec.k.length < 360) continue
    if (rec.t.filter((v) => v == null).length > 0.1 * rec.t.length) continue
    let lastSpring: number | null = null
    let firstAutumn: number | null = null
    for (let j = 0; j < rec.k.length; j++) {
      const v = rec.t[j]
      if (v == null || v > threshold) continue
      if (rec.k[j] < MIDSUMMER) lastSpring = rec.k[j]
      else if (firstAutumn === null) firstAutumn = rec.k[j]
    }
    const length = lastSpring === null && firstAutumn === null ? 365 : (firstAutumn ?? 365) - (lastSpring ?? -1) - 1
    out.push({ year, lastSpring, firstAutumn, length })
  }
  return out.sort((a, b) => a.year - b.year)
}

export type FrostFree = { median: number; trend: number | null; lastSpring: number | null; firstAutumn: number | null; frostless: boolean; years: number }

/** Median season of the recent years (from `recentFrom`), the Sen trend over all years (days per decade). */
export function frostFreeSummary(seasons: FrostSeason[], recentFrom: number): FrostFree | null {
  if (seasons.length < 5) return null
  const recent = seasons.filter((s) => s.year >= recentFrom)
  const pick = recent.length >= 5 ? recent : seasons
  const none = (s: FrostSeason) => s.lastSpring === null && s.firstAutumn === null
  const med = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null)
    return v.length >= pick.length / 2 ? Math.round(median(v)) : null
  }
  return {
    median: median(pick.map((s) => s.length)),
    trend: seasons.every(none) ? null : senSlope(seasons.map((s) => s.length), seasons.map((s) => s.year)) * 10,
    lastSpring: med(pick.map((s) => s.lastSpring)),
    firstAutumn: med(pick.map((s) => s.firstAutumn)),
    frostless: pick.every(none),
    years: seasons.length,
  }
}

/** A season day number as "14 Apr". */
export function frostDayLabel(k: number, south: boolean): string {
  const t = new Date(Date.UTC(2001, south ? 6 : 0, 1) + k * DAY_MS)
  return t.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Mean day-night range over `months` (1-12) of `years`, and the days per year that swing by `big` °C or more. */
export function diurnalRange(d: Daily, years: [number, number], months: number[], big = 15): { mean: number; bigDays: number } | null {
  let sum = 0
  let n = 0
  let bigN = 0
  const seen = new Set<number>()
  for (let i = 0; i < d.tmax.length; i++) {
    const a = d.tmax[i]
    const b = d.tmin[i]
    if (a == null || b == null) continue
    const t = dateAt(d, i)
    const y = t.getUTCFullYear()
    if (y < years[0] || y > years[1] || !months.includes(t.getUTCMonth() + 1)) continue
    const r = a - b
    sum += r
    n++
    if (r >= big) bigN++
    seen.add(y)
  }
  return n ? { mean: sum / n, bigDays: bigN / seen.size } : null
}

/**
 * ETCCDI R95pTOT (q = 0.95) or R99pTOT (0.99): rain on days above the base period's q-th percentile of wet days
 * (≥ 1 mm), as a share of all rain in `period`. Pooled over the period rather than averaged year by year.
 */
export function extremeRainShare(d: Daily, base: [number, number], period: [number, number], q: number): number | null {
  const wet: number[] = []
  for (let i = 0; i < d.prcp.length; i++) {
    const p = d.prcp[i]
    const y = dateAt(d, i).getUTCFullYear()
    if (p != null && p >= 1 && y >= base[0] && y <= base[1]) wet.push(p)
  }
  if (wet.length < 100) return null
  const thr = quantile(wet, q)
  let total = 0
  let extreme = 0
  for (let i = 0; i < d.prcp.length; i++) {
    const p = d.prcp[i]
    const y = dateAt(d, i).getUTCFullYear()
    if (p == null || y < period[0] || y > period[1]) continue
    total += p
    if (p >= 1 && p > thr) extreme += p
  }
  return total > 0 ? extreme / total : null
}

export type AridityClass = 'hyper-arid' | 'arid' | 'semi-arid' | 'dry sub-humid' | 'humid'
/** UNEP (1997) classes of P/PET. */
export const aridityClass = (ai: number): AridityClass =>
  ai < 0.05 ? 'hyper-arid' : ai < 0.2 ? 'arid' : ai < 0.5 ? 'semi-arid' : ai < 0.65 ? 'dry sub-humid' : 'humid'
const total = (xs: MonthNormal[], k: 'p' | 'pet') => xs.reduce((a, m) => a + m[k], 0)
/** Annual rain over annual reference ET, from 12 monthly normals (mm per month). */
export const aridityIndex = (normals: MonthNormal[]) => {
  const pet = total(normals, 'pet')
  return pet > 0 ? total(normals, 'p') / pet : NaN
}
/** Annual rain minus annual reference ET, mm. */
export const pMinusE = (normals: MonthNormal[]) => total(normals, 'p') - total(normals, 'pet')

export type Ripening = { sumToDate: number; date: string | null; via: 'observed' | 'forecast' | 'climatology' | null }

/**
 * Degree-days above `base` from sowing, and the first day the sum reaches `need`: NASA POWER daily as far as it goes,
 * then the forecast, then for each later day the median of the same calendar day over the last 10 complete years.
 * `sumToDate` is the sum over the observed days only.
 */
export function ripening(d: Daily, sowIso: string, need: number, base: number, forecast: { date: string; tmax: number; tmin: number }[], maxDays = 400): Ripening {
  const start = Date.parse(`${d.start}T00:00:00Z`)
  const sow = Date.parse(`${sowIso}T00:00:00Z`)
  const lastObs = start + (d.tmax.length - 1) * DAY_MS
  const fc = new Map(forecast.map((f) => [f.date, (f.tmax + f.tmin) / 2]))
  const endYear = dateAt(d, d.tmax.length - 1).getUTCFullYear() - 1
  const clim = new Map<string, number[]>()
  for (let i = 0; i < d.tmax.length; i++) {
    const a = d.tmax[i]
    const b = d.tmin[i]
    if (a == null || b == null) continue
    const t = dateAt(d, i)
    if (t.getUTCFullYear() < endYear - 9 || t.getUTCFullYear() > endYear) continue
    const md = isoDay(t).slice(5)
    const arr = clim.get(md) ?? []
    arr.push((a + b) / 2)
    clim.set(md, arr)
  }
  let sum = 0
  let sumToDate = 0
  for (let k = 0; k < maxDays; k++) {
    const t = sow + k * DAY_MS
    const iso = isoDay(new Date(t))
    let mean: number | null = null
    let via: Ripening['via'] = null
    if (t <= lastObs && t >= start) {
      const i = Math.round((t - start) / DAY_MS)
      const a = d.tmax[i]
      const b = d.tmin[i]
      if (a != null && b != null) {
        mean = (a + b) / 2
        via = 'observed'
      }
    }
    if (mean === null && fc.has(iso)) {
      mean = fc.get(iso)!
      via = 'forecast'
    }
    if (mean === null) {
      const c = clim.get(iso.slice(5))
      if (c?.length) {
        mean = median(c)
        via = 'climatology'
      }
    }
    if (mean === null) continue
    sum += Math.max(0, mean - base)
    if (via === 'observed') sumToDate = sum
    if (sum >= need) return { sumToDate, date: iso, via }
  }
  return { sumToDate, date: null, via: null }
}
