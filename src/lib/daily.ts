// Frost, heat and dry spells from NASA POWER *daily* data - the calendar a farmer actually lives by.

import type { Daily } from './dailyFormat'
import { mean, trend, type Trend } from './stats'

export type { Daily } from './dailyFormat'

const DAY = 86_400_000

export type DailyYear = {
  year: number
  lastSpringFrost: number | null // day of year (north) / day of season (south)
  firstAutumnFrost: number | null
  frostFree: number | null // days between the two
  hotDays: number // Tmax ≥ 30 °C
  heavyRainDays: number // ≥ 20 mm
  longestDrySpell: number // consecutive days < 1 mm in the growing season
  erosivity: number // Σ P^1.81 over erosive days (≥ 12.7 mm) - relative rain energy, Richardson et al. (1983)
}

export type DailyAnalysis = {
  years: DailyYear[]
  south: boolean
  frostClimate: boolean // frost happens in most years
  axisStart: string // "Jan" (north) or "Jul" (south) - how day-of-season maps to the calendar
  means: { baseline: Omit<DailyYear, 'year'>; recent: Omit<DailyYear, 'year'> }
  trends: Record<'frostFree' | 'lastSpringFrost' | 'firstAutumnFrost' | 'hotDays' | 'longestDrySpell' | 'heavyRainDays' | 'erosivity', Trend | null>
  baseline: { from: number; to: number }
  recent: { from: number; to: number }
  /** the daily series itself, for day-by-day crop risks (heat at flowering, frost after emergence) */
  raw: Daily
  /** erosive rain energy by calendar month (Jan…Dec), mean per year - same units as `erosivity` */
  erosivityByMonth: { baseline: number[]; recent: number[] }
}

/** Days at or above this much rain can move soil (Wischmeier & Smith 1978). */
export const EROSIVE_MM = 12.7
/** Daily rain → relative erosive energy (the exponent of Richardson et al. 1983's daily EI30 model). */
export const rainEnergy = (p: number) => (p >= EROSIVE_MM ? p ** 1.81 : 0)

export function analyzeDaily(d: Daily, lat: number): DailyAnalysis | null {
  const t0 = Date.parse(`${d.start}T00:00:00Z`)
  const n = d.tmax.length
  if (n < 365 * 15) return null
  const south = lat < 0
  const at = (i: number) => new Date(t0 + i * DAY)
  const firstYear = at(0).getUTCFullYear()
  const lastYear = at(n - 1).getUTCFullYear()
  const idxOf = (y: number, m: number, day: number) => Math.round((Date.UTC(y, m - 1, day) - t0) / DAY)
  const years: DailyYear[] = []

  // A "season year" runs Jan-Dec in the north and Jul-Jun (labelled by the January) in the south.
  for (let y = firstYear + (south ? 1 : 0); y <= lastYear; y++) {
    const s = south ? idxOf(y - 1, 7, 1) : idxOf(y, 1, 1)
    const e = south ? idxOf(y, 6, 30) : idxOf(y, 12, 31)
    if (s < 0 || e >= n) continue
    const mid = south ? idxOf(y, 1, 15) : idxOf(y, 7, 15) // the warm heart of the season
    let lastSpring: number | null = null
    for (let i = mid; i >= s; i--) if ((d.tmin[i] ?? 99) < 0) { lastSpring = i - s + 1; break }
    let firstAutumn: number | null = null
    for (let i = mid; i <= e; i++) if ((d.tmin[i] ?? 99) < 0) { firstAutumn = i - s + 1; break }
    let hot = 0
    let heavy = 0
    let energy = 0
    for (let i = s; i <= e; i++) {
      if ((d.tmax[i] ?? -99) >= 30) hot++
      if ((d.prcp[i] ?? 0) >= 20) heavy++
      energy += rainEnergy(d.prcp[i] ?? 0)
    }
    // Longest dry spell inside the growing season (Apr-Sep north, Oct-Mar south).
    const gs = south ? [idxOf(y - 1, 10, 1), idxOf(y, 3, 31)] : [idxOf(y, 4, 1), idxOf(y, 9, 30)]
    let run = 0
    let longest = 0
    for (let i = gs[0]; i <= gs[1]; i++) {
      if ((d.prcp[i] ?? 0) < 1) {
        run++
        longest = Math.max(longest, run)
      } else run = 0
    }
    const seasonLen = e - s + 1
    const frostFree =
      lastSpring !== null && firstAutumn !== null ? firstAutumn - lastSpring - 1
        : lastSpring === null && firstAutumn === null ? seasonLen
          : lastSpring === null ? (firstAutumn as number) - 1
            : seasonLen - (lastSpring as number)
    years.push({ year: y, lastSpringFrost: lastSpring, firstAutumnFrost: firstAutumn, frostFree, hotDays: hot, heavyRainDays: heavy, longestDrySpell: longest, erosivity: energy })
  }
  if (years.length < 15) return null

  const fy = years[0].year
  const ly = years[years.length - 1].year
  const baseline = fy <= 1981 || (south && fy <= 1982) ? { from: fy, to: 2010 } : { from: fy, to: Math.min(fy + 29, ly - 10) }
  const recent = { from: ly - 9, to: ly }
  const win = (w: { from: number; to: number }) => years.filter((y) => y.year >= w.from && y.year <= w.to)
  const avg = (ys: DailyYear[]) => {
    const m = (k: keyof Omit<DailyYear, 'year'>) => {
      const v = ys.map((y) => y[k]).filter((x): x is number => x !== null)
      return v.length ? mean(v) : null
    }
    return {
      lastSpringFrost: m('lastSpringFrost'), firstAutumnFrost: m('firstAutumnFrost'), frostFree: m('frostFree'),
      hotDays: m('hotDays') ?? 0, heavyRainDays: m('heavyRainDays') ?? 0, longestDrySpell: m('longestDrySpell') ?? 0,
      erosivity: m('erosivity') ?? 0,
    }
  }
  const tr = (k: keyof Omit<DailyYear, 'year'>) => {
    const v = years.filter((y) => y[k] !== null)
    return v.length >= 15 ? trend(v.map((y) => y[k] as number), v.map((y) => y.year)) : null
  }
  const frostYears = years.filter((y) => y.lastSpringFrost !== null || y.firstAutumnFrost !== null).length
  return {
    years,
    south,
    frostClimate: frostYears / years.length > 0.5,
    axisStart: south ? 'Jul' : 'Jan',
    means: { baseline: avg(win(baseline)) as DailyAnalysis['means']['baseline'], recent: avg(win(recent)) as DailyAnalysis['means']['recent'] },
    trends: {
      frostFree: tr('frostFree'), lastSpringFrost: tr('lastSpringFrost'), firstAutumnFrost: tr('firstAutumnFrost'),
      hotDays: tr('hotDays'), longestDrySpell: tr('longestDrySpell'), heavyRainDays: tr('heavyRainDays'), erosivity: tr('erosivity'),
    },
    baseline,
    recent,
    raw: d,
    erosivityByMonth: { baseline: monthlyEnergy(d, baseline), recent: monthlyEnergy(d, recent) },
  }
}

/** Erosive rain energy per calendar month, averaged over the years of a window. */
function monthlyEnergy(d: Daily, w: { from: number; to: number }): number[] {
  const t0 = Date.parse(`${d.start}T00:00:00Z`)
  const out = new Array<number>(12).fill(0)
  const seen = new Set<number>()
  for (let i = 0; i < d.prcp.length; i++) {
    const date = new Date(t0 + i * DAY)
    const y = date.getUTCFullYear()
    if (y < w.from || y > w.to) continue
    seen.add(y)
    out[date.getUTCMonth()] += rainEnergy(d.prcp[i] ?? 0)
  }
  return out.map((v) => v / Math.max(1, seen.size))
}

/** Day-of-season → "12 Apr" style label. */
export function seasonDayLabel(day: number, south: boolean): string {
  const base = Date.UTC(2001, south ? 6 : 0, 1) // non-leap reference year
  const d = new Date(base + (day - 1) * DAY)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
