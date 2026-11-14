// Does Zixtaro's soil-water bucket behave like NASA's own land-surface model?
//
// MERRA-2 runs the Catchment land-surface model and publishes root-zone wetness (GWETROOT, via NASA POWER). It is a
// very different model from the FAO-56 bucket used here - a catchment water table, several soil layers, NASA's
// own vegetation - so if the two rise and fall together, month after month for 45 years, the bucket's physics
// (storage, evaporative demand, drainage) is doing its job. Both are driven by largely the same MERRA-2 weather,
// so this tests the bucket, not the rain.
//
// The bucket runs continuously over the whole record under a generic grass-like cover (Kc 0.4 in cold months,
// 0.7 in cool ones, 0.95 when warm) with this field's SoilGrids water in the top metre. Seasonal cycles are
// removed from both series (anomalies by calendar month) before ranking, so the agreement is about the dry and
// wet spells, not about summer being drier than winter. The 95 % interval comes from resampling whole years
// (block bootstrap, fixed seed).

import type { ClimateAnalysis, MonthRec } from './climate'
import { rng } from './robust'
import type { SoilProfile } from './soil'
import { clamp, spearman } from './stats'

export type Agreement = { rho: number; lo: number; hi: number; n: number }
export type BucketCheck = {
  months: Agreement
  seasons: Agreement & { rows: { year: number; model: number; nasa: number }[] }
}

const kcOf = (t: number) => (t < 5 ? 0.4 : t < 10 ? 0.7 : 0.95)

/** Relative root-zone storage (0…1) at the end of every month of the record. */
export function bucketSeries(climate: ClimateAnalysis, soil: SoilProfile): { rec: MonthRec; rel: number }[] {
  const recs = [...climate.byMonth.values()].sort((a, b) => a.year - b.year || a.month - b.month)
  const taw = Math.max(20, soil.paw100)
  const p = 0.5
  let s = 0.7 * taw
  return recs.map((rec) => {
    const days = new Date(Date.UTC(rec.year, rec.month, 0)).getUTCDate()
    const rain = (0.9 * rec.p) / 3
    const demand = (kcOf(rec.t) * rec.pet) / 3
    const pAdj = clamp(p + 0.04 * (5 - (kcOf(rec.t) * rec.pet) / days), 0.1, 0.8)
    for (let k = 0; k < 3; k++) {
      s = Math.min(taw, s + rain)
      const dep = taw - s
      const ks = dep <= pAdj * taw ? 1 : Math.max(0, (taw - dep) / ((1 - pAdj) * taw))
      s -= Math.min(ks * demand, s)
    }
    return { rec, rel: s / taw }
  })
}

function anomalies(xs: { month: number; v: number }[]): number[] {
  const mean = new Array(13).fill(0)
  const n = new Array(13).fill(0)
  for (const x of xs) {
    mean[x.month] += x.v
    n[x.month]++
  }
  return xs.map((x) => x.v - mean[x.month] / Math.max(1, n[x.month]))
}

function bootstrap(years: number[], byYear: Map<number, [number, number][]>, runs: number, seed: number): [number, number] {
  const rand = rng(seed)
  const rhos: number[] = []
  for (let r = 0; r < runs; r++) {
    const a: number[] = []
    const b: number[] = []
    for (let i = 0; i < years.length; i++) {
      for (const [x, y] of byYear.get(years[Math.floor(rand() * years.length)]) ?? []) {
        a.push(x)
        b.push(y)
      }
    }
    if (a.length > 5) rhos.push(spearman(a, b).rho)
  }
  rhos.sort((x, y) => x - y)
  const q = (f: number) => rhos[Math.min(rhos.length - 1, Math.max(0, Math.floor(f * rhos.length)))] ?? NaN
  return [q(0.025), q(0.975)]
}

export function checkBucket(climate: ClimateAnalysis, soil: SoilProfile, runs = 300): BucketCheck | null {
  const series = bucketSeries(climate, soil).filter((x) => Number.isFinite(x.rec.w))
  if (series.length < 120) return null
  const model = anomalies(series.map((x) => ({ month: x.rec.month, v: x.rel })))
  const nasa = anomalies(series.map((x) => ({ month: x.rec.month, v: x.rec.w })))
  const byYear = new Map<number, [number, number][]>()
  series.forEach((x, i) => {
    const l = byYear.get(x.rec.year) ?? []
    l.push([model[i], nasa[i]])
    byYear.set(x.rec.year, l)
  })
  const years = [...byYear.keys()]
  const m = spearman(model, nasa)
  const [mlo, mhi] = bootstrap(years, byYear, runs, 4_2027)

  // growing season: mean modelled storage vs the growing-season GWETROOT behind the "driest seasons" ranking
  // the season's own months, which wrap over New Year in the south
  const rel = new Map(series.map((x) => [`${x.rec.year}-${x.rec.month}`, x.rel]))
  const rows: { year: number; model: number; nasa: number }[] = []
  for (const y of climate.years) {
    const own = climate.season.months.map((s) => rel.get(`${y.year + s.yearOffset}-${s.month}`)).filter((v): v is number => v !== undefined)
    if (own.length === climate.season.months.length && Number.isFinite(y.wGS)) rows.push({ year: y.year, model: own.reduce((a, v) => a + v, 0) / own.length, nasa: y.wGS })
  }
  const sByYear = new Map(rows.map((r) => [r.year, [[r.model, r.nasa]] as [number, number][]]))
  const sr = spearman(rows.map((r) => r.model), rows.map((r) => r.nasa))
  const [slo, shi] = bootstrap(rows.map((r) => r.year), sByYear, runs, 7_2027)
  return { months: { rho: m.rho, lo: mlo, hi: mhi, n: series.length }, seasons: { rho: sr.rho, lo: slo, hi: shi, n: rows.length, rows } }
}
