// Checking the model against the real world. The crop water model says how much yield each season's weather
// should have cost; reported harvests around the field say what really happened. If the two move together,
// the drought signal behind every recommendation is real - if they don't, the page says so.
//
// Yields are pre-baked by scripts/yields.py: GDHY (0.5° grid from census statistics, 1981-2016) and, for
// Argentina, the ministry's department series (1969/70 → today).

import type { CropId } from './crops'
import { median, spearman } from './stats'
import type { CropRisk } from './water'

export type YieldSource = { name: string; scale: string; url: string }
export type YieldSeries = { src: number; years: number[]; t: number[] }
export type YieldData = { id: string; lat: number; lon: number; sources: YieldSource[]; crops: Partial<Record<CropId, YieldSeries>> }

type Index = { cellSize: number; cells: { id: string; cell: string; label: string }[] }
let indexPromise: Promise<Index | null> | null = null
const cache = new Map<string, Promise<YieldData | null>>()

export const yieldCell = (lat: number, lon: number) => `${Math.floor((lat + 90) / 0.5)},${Math.floor((((lon % 360) + 360) % 360) / 0.5)}`

/** Reported yields for the 0.5° cell around a field, if one of the demo cells covers it. */
export async function yieldsFor(lat: number, lon: number): Promise<YieldData | null> {
  const base = `${import.meta.env.BASE_URL}data/yields/`
  indexPromise ??= fetch(`${base}index.json`).then((r) => (r.ok ? (r.json() as Promise<Index>) : null)).catch(() => null)
  const hit = (await indexPromise)?.cells.find((c) => c.cell === yieldCell(lat, lon))
  if (!hit) return null
  let p = cache.get(hit.id)
  if (!p) {
    p = fetch(`${base}${hit.id}.json`).then((r) => (r.ok ? (r.json() as Promise<YieldData>) : null)).catch(() => null)
    cache.set(hit.id, p)
  }
  return p
}

export type CheckRow = { year: number; anomaly: number; loss: number }
export type CropCheck = {
  crop: CropId
  rows: CheckRow[]
  rho: number
  p: number
  worst: number[] // the five worst harvests, worst first
  flagged: number[] // the five seasons the model calls driest
  hits: number
  source: YieldSource
}

/**
 * Each harvest against the median of the ten seasons around it (technology and prices move the level; the
 * weather moves the year) - then ranked against the model's water-stress loss for the same seasons.
 */
export function checkCrop(crop: CropId, series: YieldSeries, risk: CropRisk, source: YieldSource): CropCheck | null {
  const loss = new Map(risk.byYear.map((r) => [r.year, r.loss]))
  const rows: CheckRow[] = []
  series.years.forEach((year, i) => {
    const l = loss.get(year)
    if (l === undefined) return
    const around = series.years.map((y, j) => (y !== year && Math.abs(y - year) <= 5 ? series.t[j] : NaN)).filter(Number.isFinite)
    if (around.length < 5) return
    rows.push({ year, anomaly: series.t[i] / median(around) - 1, loss: l })
  })
  if (rows.length < 12) return null
  const { rho, p } = spearman(rows.map((r) => r.anomaly), rows.map((r) => -r.loss))
  const worst = [...rows].sort((a, b) => a.anomaly - b.anomaly).slice(0, 5).map((r) => r.year)
  const flagged = [...rows].sort((a, b) => b.loss - a.loss).slice(0, 5).map((r) => r.year)
  return { crop, rows, rho, p, worst, flagged, hits: worst.filter((y) => flagged.includes(y)).length, source }
}

export function checkAll(data: YieldData, risks: Partial<Record<CropId, CropRisk>>): CropCheck[] {
  return (Object.keys(data.crops) as CropId[])
    .map((id) => {
      const s = data.crops[id]
      const r = risks[id]
      return s && r ? checkCrop(id, s, r, data.sources[s.src]) : null
    })
    .filter((c): c is CropCheck => c !== null)
    .sort((a, b) => b.rows.length - a.rows.length || b.rho - a.rho)
}
