// One field, two NASA rain records.
//
// The model runs on NASA POWER's rain: MERRA-2 reanalysis, corrected with gauges (PRECTOTCORR), since 1981. NASA also
// measures rain from orbit - GPM IMERG, microwave and infrared sensors on a fleet of satellites, since 2001 - and
// POWER serves that record for the same point (IMERG_PRECTOT, UTC only). They are two estimates of the same rain,
// made in different ways, neither of them a gauge in the field: where they agree the water figures stand on firmer
// ground, and where they part the reader should know.
//
// This is a cross-check for the reader. IMERG does not enter the score, the water balance or any ranking.

import type { ClimateAnalysis } from './climate'
import { monthKey } from './climate'
import { pearson } from './stats'

export const IMERG_FROM = 2001

/** NASA POWER monthly point series of GPM IMERG rain (mm/day; the source is served on the UTC time standard only). */
export function imergUrl(lat: number, lon: number, endYear: number): string {
  return (
    'https://power.larc.nasa.gov/api/temporal/monthly/point' +
    `?parameters=IMERG_PRECTOT&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}` +
    `&start=${IMERG_FROM}&end=${endYear}&format=JSON&time-standard=UTC`
  )
}

export type RawImerg = { properties: { parameter: { IMERG_PRECTOT?: Record<string, number> } } }

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** Monthly IMERG rain, mm per month, by "year-month". Fill values (-999) and POWER's annual key (month 13) are left out. */
export function parseImerg(raw: RawImerg): Map<string, number> {
  const out = new Map<string, number>()
  for (const [k, v] of Object.entries(raw.properties?.parameter?.IMERG_PRECTOT ?? {})) {
    const year = Number(k.slice(0, 4))
    const month = Number(k.slice(4, 6))
    if (!(month >= 1 && month <= 12) || !(v >= 0)) continue
    out.set(monthKey(year, month), v * daysIn(year, month))
  }
  return out
}

export type RainTwo = {
  /** calendar years in which both records have all twelve months */
  years: { year: number; power: number; imerg: number }[]
  /** mean annual rain over those years, mm */
  mean: { power: number; imerg: number }
  /** IMERG's mean annual rain relative to POWER's, as a share (+0.08 = 8 % more) */
  bias: number
  /** agreement month by month once each record's own seasonal cycle is taken out: Pearson's r, and how many months */
  months: { r: number; n: number }
  /** the driest of those years by each record */
  driest: { power: number; imerg: number }
  /** years in which the two annual totals differ by more than a fifth of POWER's */
  apart: number[]
}

/** The two records side by side over the years both cover in full; null when fewer than five such years exist. */
export function compareRain(climate: ClimateAnalysis, imerg: Map<string, number>): RainTwo | null {
  const years: RainTwo['years'] = []
  const pairs: { m: number; a: number; b: number }[] = []
  for (let y = Math.max(IMERG_FROM, climate.firstYear); y <= climate.lastYear; y++) {
    let a = 0
    let b = 0
    let full = true
    const mine: typeof pairs = []
    for (let m = 1; m <= 12; m++) {
      const p = climate.byMonth.get(monthKey(y, m))?.p
      const q = imerg.get(monthKey(y, m))
      if (p === undefined || q === undefined || !Number.isFinite(p)) {
        full = false
        break
      }
      a += p
      b += q
      mine.push({ m, a: p, b: q })
    }
    if (!full) continue
    years.push({ year: y, power: a, imerg: b })
    pairs.push(...mine)
  }
  if (years.length < 5) return null
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  // each record's own normal for the calendar month is taken out, so the agreement is about wet and dry spells,
  // not about both knowing that July is wetter than February
  const norm = (pick: (p: (typeof pairs)[number]) => number) => Array.from({ length: 12 }, (_, i) => avg(pairs.filter((p) => p.m === i + 1).map(pick)))
  const na = norm((p) => p.a)
  const nb = norm((p) => p.b)
  const mean = { power: avg(years.map((y) => y.power)), imerg: avg(years.map((y) => y.imerg)) }
  const least = (pick: (y: RainTwo['years'][number]) => number) => years.reduce((d, y) => (pick(y) < pick(d) ? y : d)).year
  return {
    years,
    mean,
    bias: mean.power > 0 ? mean.imerg / mean.power - 1 : 0,
    months: { r: pearson(pairs.map((p) => p.a - na[p.m - 1]), pairs.map((p) => p.b - nb[p.m - 1])), n: pairs.length },
    driest: { power: least((y) => y.power), imerg: least((y) => y.imerg) },
    apart: years.filter((y) => Math.abs(y.imerg - y.power) > 0.2 * y.power).map((y) => y.year),
  }
}
