// Turns NASA POWER monthly point data (MERRA-2 based, 1981→) into climate-shift evidence:
// annual & growing-season series, trends with significance, anomalies for the stripes,
// the driest root-zone seasons and baseline-vs-recent monthly normals.

import type { Height } from './height'
import { hargreavesPET, penmanMonteithPET } from './solar'
import type { POWER_PARAMS } from './sources'
import { mean, trend, type Trend } from './stats'

export type PowerParam = (typeof POWER_PARAMS)[number]
/** param → "YYYYMM" → value (MM = 13 is POWER's annual aggregate) */
export type RawPower = Partial<Record<PowerParam, Record<string, number>>>

export type MonthRec = {
  year: number
  month: number // 1..12
  p: number // precipitation, mm/month
  t: number // mean air temperature at 2 m, °C
  tRange: number // mean daily temperature range, °C
  tMaxAbs: number // hottest daily maximum of the month, °C
  w: number // root-zone soil wetness 0..1 (GWETROOT), NaN if missing
  pet: number // reference ET (FAO-56 Penman-Monteith; Hargreaves fallback), mm/month
  petMethod: 'penman-monteith' | 'hargreaves'
  rs: number // incoming shortwave, MJ m-2 day-1 (NaN before 1984)
  tDew: number // dew point, °C (NaN if missing)
  wind: number // wind speed at 2 m, m/s (NaN if missing)
  ps: number // surface pressure, kPa (NaN if missing)
}

const FILL = -900
const ok = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > FILL

export function parsePowerMonthly(raw: RawPower, lat: number): MonthRec[] {
  const p = raw.PRECTOTCORR_SUM ?? {}
  const t = raw.T2M ?? {}
  const tr = raw.T2M_RANGE ?? {}
  const tx = raw.T2M_MAX ?? {}
  const w = raw.GWETROOT ?? {}
  const rs = raw.ALLSKY_SFC_SW_DWN ?? {}
  const dew = raw.T2MDEW ?? {}
  const ws = raw.WS2M ?? {}
  const ps = raw.PS ?? {}
  const out: MonthRec[] = []
  let tPrev = NaN
  for (const key of Object.keys(t).sort()) {
    const month = Number(key.slice(4))
    if (month < 1 || month > 12) continue
    const year = Number(key.slice(0, 4))
    if (!ok(p[key]) || !ok(t[key]) || !ok(tr[key])) {
      tPrev = NaN
      continue
    }
    const canPM = ok(dew[key]) && ok(ws[key]) && ok(ps[key])
    const pet = canPM
      ? penmanMonteithPET({
        lat, month, year, t: t[key], tRange: tr[key], tDew: dew[key], wind: ws[key], ps: ps[key],
        rs: ok(rs[key]) ? rs[key] : NaN, // solar data start in 1984 - estimated before that
        tPrev,
      })
      : hargreavesPET(lat, month, year, t[key], tr[key])
    out.push({
      year,
      month,
      p: p[key],
      t: t[key],
      tRange: tr[key],
      tMaxAbs: ok(tx[key]) ? tx[key] : NaN,
      w: ok(w[key]) ? w[key] : NaN,
      pet,
      petMethod: canPM ? 'penman-monteith' : 'hargreaves',
      rs: ok(rs[key]) ? rs[key] : NaN,
      tDew: ok(dew[key]) ? dew[key] : NaN,
      wind: ok(ws[key]) ? ws[key] : NaN,
      ps: ok(ps[key]) ? ps[key] : NaN,
    })
    tPrev = t[key]
  }
  return out
}

export type SeasonMonth = { month: number; yearOffset: number }
export type Season = { months: SeasonMonth[]; label: string; hemisphere: 'north' | 'south' | 'tropics' }

/** Main growing season: Apr-Sep (north), Oct-Mar labelled by harvest year (south), full year (tropics). */
export function growingSeason(lat: number): Season {
  if (lat >= 23.5) {
    return { months: [4, 5, 6, 7, 8, 9].map((m) => ({ month: m, yearOffset: 0 })), label: 'Apr-Sep', hemisphere: 'north' }
  }
  if (lat <= -23.5) {
    return {
      months: [
        { month: 10, yearOffset: -1 }, { month: 11, yearOffset: -1 }, { month: 12, yearOffset: -1 },
        { month: 1, yearOffset: 0 }, { month: 2, yearOffset: 0 }, { month: 3, yearOffset: 0 },
      ],
      label: 'Oct-Mar',
      hemisphere: 'south',
    }
  }
  return { months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, yearOffset: 0 })), label: 'Jan-Dec', hemisphere: 'tropics' }
}

export type YearStat = {
  year: number
  t: number // annual mean temperature, °C
  p: number // annual precipitation, mm
  pet: number // annual reference ET, mm
  pGS: number // growing-season precipitation, mm
  petGS: number // growing-season reference ET, mm
  cwbGS: number // growing-season climatic water balance P − PET, mm
  wGS: number // growing-season mean root-zone wetness, 0..1
  tMaxAbs: number // hottest day of the year, °C
  gdd: number // growing degree days (base 10 °C) over the growing season
}

export type MonthNormal = { month: number; p: number; pet: number; t: number; tMax: number; w: number }

export type ClimateAnalysis = {
  lat: number
  lon: number
  /** NASA POWER moved from its cell's mean height to the field's (height.ts); absent when either height is unknown */
  height?: Height
  years: YearStat[]
  firstYear: number
  lastYear: number
  season: Season
  baseline: { from: number; to: number }
  recent: { from: number; to: number }
  means: { baseline: Omit<YearStat, 'year'>; recent: Omit<YearStat, 'year'> }
  trends: Record<'t' | 'pGS' | 'petGS' | 'cwbGS' | 'wGS' | 'tMaxAbs' | 'gdd', Trend>
  /** anomalies vs baseline, for the stripes */
  anomalies: { year: number; t: number; cwb: number }[]
  /** growing seasons ranked driest-first by root-zone wetness */
  driest: { year: number; wGS: number }[]
  monthly: { baseline: MonthNormal[]; recent: MonthNormal[] }
  aridity: { index: number; klass: string }
  signal: { label: string; warming: boolean; drying: boolean; wetting: boolean }
  /** monthly records by "year-month", used by the crop water model */
  byMonth: Map<string, MonthRec>
  /** set by a what-if (scenario.ts warmClimate) only: the shift applied to the recent decade, °C per calendar month
   *  (Jan…Dec), and the observed recent normals it was applied to - the grain-fill term reads them (grainFill) */
  warming?: { dT: number[]; present: MonthNormal[] }
}

export const monthKey = (year: number, month: number) => `${year}-${month}`

function nanMean(xs: number[]): number {
  const f = xs.filter((x) => Number.isFinite(x))
  return f.length ? mean(f) : NaN
}

function aridityClass(ai: number): string {
  if (ai < 0.05) return 'hyper-arid'
  if (ai < 0.2) return 'arid'
  if (ai < 0.5) return 'semi-arid'
  if (ai < 0.65) return 'dry sub-humid'
  return 'humid'
}

export function analyzeClimate(records: MonthRec[], lat: number, lon: number): ClimateAnalysis {
  const byMonth = new Map<string, MonthRec>()
  for (const r of records) byMonth.set(monthKey(r.year, r.month), r)
  const season = growingSeason(lat)

  const allYears = [...new Set(records.map((r) => r.year))].sort((a, b) => a - b)
  const years: YearStat[] = []
  for (const y of allYears) {
    const cal = Array.from({ length: 12 }, (_, i) => byMonth.get(monthKey(y, i + 1)))
    if (cal.some((m) => !m)) continue
    const gs = season.months.map((s) => byMonth.get(monthKey(y + s.yearOffset, s.month)))
    if (gs.some((m) => !m)) continue
    const c = cal as MonthRec[]
    const g = gs as MonthRec[]
    const pGS = g.reduce((s, m) => s + m.p, 0)
    const petGS = g.reduce((s, m) => s + m.pet, 0)
    years.push({
      year: y,
      t: mean(c.map((m) => m.t)),
      p: c.reduce((s, m) => s + m.p, 0),
      pet: c.reduce((s, m) => s + m.pet, 0),
      pGS,
      petGS,
      cwbGS: pGS - petGS,
      wGS: nanMean(g.map((m) => m.w)),
      tMaxAbs: Math.max(...c.map((m) => (Number.isFinite(m.tMaxAbs) ? m.tMaxAbs : -99))),
      gdd: g.reduce((s, m) => s + Math.max(0, m.t - 10) * daysOf(m), 0),
    })
  }
  if (years.length < 15) throw new Error('Not enough NASA POWER years to analyse this location')

  const firstYear = years[0].year
  const lastYear = years[years.length - 1].year
  // WMO standard normal 1981-2010 when available; the last decade is "recent".
  // (a record cut short - as in the backtest - keeps its baseline clear of its own last decade)
  const baseline = firstYear <= 1981 && lastYear >= 2020 ? { from: 1981, to: 2010 } : { from: firstYear, to: Math.min(firstYear + 29, lastYear - 10) }
  const recent = { from: lastYear - 9, to: lastYear }
  const inRange = (r: { from: number; to: number }) => years.filter((y) => y.year >= r.from && y.year <= r.to)

  const avg = (ys: YearStat[]): Omit<YearStat, 'year'> => ({
    t: mean(ys.map((y) => y.t)),
    p: mean(ys.map((y) => y.p)),
    pet: mean(ys.map((y) => y.pet)),
    pGS: mean(ys.map((y) => y.pGS)),
    petGS: mean(ys.map((y) => y.petGS)),
    cwbGS: mean(ys.map((y) => y.cwbGS)),
    wGS: nanMean(ys.map((y) => y.wGS)),
    tMaxAbs: mean(ys.map((y) => y.tMaxAbs)),
    gdd: mean(ys.map((y) => y.gdd)),
  })
  const means = { baseline: avg(inRange(baseline)), recent: avg(inRange(recent)) }

  const tr = (k: keyof Omit<YearStat, 'year'>) => {
    const pairs = years.filter((y) => Number.isFinite(y[k]))
    return trend(pairs.map((y) => y[k]), pairs.map((y) => y.year))
  }
  const trends = {
    t: tr('t'), pGS: tr('pGS'), petGS: tr('petGS'), cwbGS: tr('cwbGS'), wGS: tr('wGS'), tMaxAbs: tr('tMaxAbs'), gdd: tr('gdd'),
  }

  const anomalies = years.map((y) => ({
    year: y.year,
    t: y.t - means.baseline.t,
    cwb: y.cwbGS - means.baseline.cwbGS,
  }))

  const driest = years
    .filter((y) => Number.isFinite(y.wGS))
    .map((y) => ({ year: y.year, wGS: y.wGS }))
    .sort((a, b) => a.wGS - b.wGS)

  const normals = (r: { from: number; to: number }): MonthNormal[] =>
    Array.from({ length: 12 }, (_, i) => {
      const ms = records.filter((m) => m.month === i + 1 && m.year >= r.from && m.year <= r.to)
      return {
        month: i + 1,
        p: mean(ms.map((m) => m.p)),
        pet: mean(ms.map((m) => m.pet)),
        t: mean(ms.map((m) => m.t)),
        tMax: mean(ms.map((m) => m.t + m.tRange / 2)),
        w: nanMean(ms.map((m) => m.w)),
      }
    })

  const ai = means.recent.p / means.recent.pet
  const warming = trends.t.significant && trends.t.perDecade > 0
  const drying =
    (trends.cwbGS.significant && trends.cwbGS.perDecade < 0) || (trends.wGS.significant && trends.wGS.perDecade < 0)
  const wetting =
    !drying &&
    ((trends.cwbGS.significant && trends.cwbGS.perDecade > 0) || (trends.wGS.significant && trends.wGS.perDecade > 0))
  const label =
    warming && drying ? 'Warming & drying'
      : warming && wetting ? 'Warming & wetting'
        : warming ? 'Warming'
          : drying ? 'Drying'
            : wetting ? 'Wetting'
              : 'No significant shift'

  return {
    lat,
    lon,
    years,
    firstYear,
    lastYear,
    season,
    baseline,
    recent,
    means,
    trends,
    anomalies,
    driest,
    monthly: { baseline: normals(baseline), recent: normals(recent) },
    aridity: { index: ai, klass: aridityClass(ai) },
    signal: { label, warming, drying, wetting },
    byMonth,
  }
}

function daysOf(m: MonthRec): number {
  return new Date(Date.UTC(m.year, m.month, 0)).getUTCDate()
}
