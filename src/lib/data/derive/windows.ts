// src/lib/data/derive/windows.ts
// The next 16 days as work windows: when to spray, when the soil is warm enough to sow, which days carry disease,
// storm, frost, heat, lodging or flood risk. Published rules, applied to the hourly Open-Meteo forecast.
import { CROP_BY_ID, type CropId } from '../../crops'
import { T_CRIT } from '../../extremes'
import { deltaT } from './humidity'

export type Hourly = {
  time: string[]
  t: (number | null)[]
  rh: (number | null)[]
  precip: (number | null)[]
  wind: (number | null)[]
  gust: (number | null)[]
  st6: (number | null)[]
  cape: (number | null)[]
  li: (number | null)[]
  leafWet: (number | null)[]
}
export type Cell = 'good' | 'fair' | 'bad' | 'none'
export type RowId = 'spray' | 'sow' | 'disease' | 'storm' | 'frost' | 'heat' | 'lodging' | 'flood'
export type WindowRow = { id: RowId; label: string; cells: Cell[]; notes: string[] }
export type WindowsGrid = { days: string[]; rows: WindowRow[] }
export type WindowsSummary = {
  grid: WindowsGrid
  sprayHours7: number
  nextSpray: string | null
  sowDate: string | null
  diseaseDays: number
  stormDays: number
  frostDays: number
  heatDays: number
  lodgingDays: number
}

/** Minimum soil temperature at seed depth for germination and emergence, °C (extension seed-bed guides). */
export const SOW_SOIL_T: Partial<Record<CropId, number>> = {
  maize: 10, sorghum: 15, soybean: 10, sunflower: 8, cotton: 16, rice: 12, groundnut: 15, cowpea: 15, drybean: 12,
  millet: 12, pearlmillet: 15, buckwheat: 10, potato: 7, sugarbeet: 5, rapeseed: 5, wheat: 4, barley: 3, oats: 3,
  rye: 3, triticale: 3, pea: 5, faba: 4, lupin: 5, lentil: 5, chickpea: 8, linseed: 7, cassava: 18, sweetpotato: 18,
}
const CEREALS: CropId[] = ['wheat', 'barley', 'rye', 'oats', 'triticale', 'maize']

const num = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x)

/** Spray-fit hour: wind 3-15 km/h, 5-28 °C, delta-T 2-8 °C, no rain this hour or in the next 6. */
export function sprayOk(h: Hourly, i: number): boolean {
  const t = h.t[i]
  const rh = h.rh[i]
  const w = h.wind[i]
  if (!num(t) || !num(rh) || !num(w)) return false
  if (w < 3 || w > 15 || t < 5 || t > 28) return false
  const dt = deltaT(t, rh)
  if (dt < 2 || dt > 8) return false
  for (let k = i; k <= Math.min(h.time.length - 1, i + 6); k++) if ((h.precip[k] ?? 0) > 0) return false
  return true
}

export function buildWindows(h: Hourly, opts: { crop: CropId | null; lat: number; floodDays?: Set<string> }): WindowsSummary {
  const days: string[] = []
  const byDay = new Map<string, number[]>()
  h.time.forEach((t, i) => {
    const d = t.slice(0, 10)
    if (!byDay.has(d)) {
      byDay.set(d, [])
      days.push(d)
    }
    byDay.get(d)!.push(i)
  })
  const idx = days.map((d) => byDay.get(d)!)
  const vals = (k: keyof Omit<Hourly, 'time'>, ii: number[]) => ii.map((i) => h[k][i]).filter(num)
  const min = (xs: number[]) => (xs.length ? Math.min(...xs) : NaN)
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : NaN)
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const crop = opts.crop ? CROP_BY_ID[opts.crop] : null
  const south = opts.lat < 0

  // spray
  const ok = h.time.map((_, i) => sprayOk(h, i))
  const sprayCells: Cell[] = idx.map((ii) => {
    const n = ii.filter((i) => ok[i]).length
    return n >= 3 ? 'good' : n >= 1 ? 'fair' : 'bad'
  })
  let nextSpray: string | null = null
  for (let i = 0; i + 2 < ok.length && !nextSpray; i++) if (ok[i] && ok[i + 1] && ok[i + 2]) nextSpray = h.time[i]
  const sprayHours7 = ok.slice(0, 7 * 24).filter(Boolean).length

  // sowing: daily mean soil temperature at 6 cm against the crop's minimum
  const need = opts.crop ? SOW_SOIL_T[opts.crop] : undefined
  const st = idx.map((ii) => {
    const v = vals('st6', ii)
    return v.length ? sum(v) / v.length : NaN
  })
  const sowCells: Cell[] = st.map((v) => (need === undefined || !Number.isFinite(v) ? 'none' : v >= need ? 'good' : v >= need - 2 ? 'fair' : 'bad'))
  let sowDate: string | null = null
  if (need !== undefined) for (let d = 0; d + 2 < st.length && !sowDate; d++) if (st[d] >= need && st[d + 1] >= need && st[d + 2] >= need) sowDate = days[d]

  // disease
  const wetHours = (ii: number[], lo: number, hi: number, rhMin: number, useLeaf: boolean) =>
    ii.filter((i) => {
      const t = h.t[i]
      if (!num(t) || t < lo || t > hi) return false
      const leaf = h.leafWet[i]
      if (useLeaf && num(leaf)) return leaf >= 50
      const rh = h.rh[i]
      return num(rh) && rh >= rhMin
    }).length
  const floweringMonth = crop?.heat ? ((crop.heat.month - 1 + (south ? 6 : 0)) % 12) + 1 : null
  const hutton = idx.map((ii) => min(vals('t', ii)) >= 10 && ii.filter((i) => num(h.rh[i]) && h.rh[i]! >= 90).length >= 6)
  const diseaseCells: Cell[] = idx.map((ii, d) => {
    if (!opts.crop) return 'none'
    if (opts.crop === 'potato') return d > 0 && hutton[d] && hutton[d - 1] ? 'bad' : hutton[d] ? 'fair' : 'good'
    if (CEREALS.includes(opts.crop)) {
      if (floweringMonth !== Number(days[d].slice(5, 7))) return 'none'
      const n = wetHours(ii, 15, 30, 90, false)
      return n >= 10 ? 'bad' : n >= 6 ? 'fair' : 'good'
    }
    const n = wetHours(ii, 15, 25, 90, true)
    return n >= 10 ? 'bad' : n >= 6 ? 'fair' : 'good'
  })

  // storm, frost, heat, lodging, flood
  const stormCells: Cell[] = idx.map((ii) =>
    ii.some((i) => num(h.cape[i]) && h.cape[i]! >= 1000 && num(h.li[i]) && h.li[i]! <= -2) ? 'bad' : ii.some((i) => num(h.cape[i]) && h.cape[i]! >= 500) ? 'fair' : 'good',
  )
  const frostCells: Cell[] = idx.map((ii) => {
    const m = min(vals('t', ii))
    return m <= 0 ? 'bad' : m <= 2 ? 'fair' : 'good'
  })
  const tCrit = opts.crop ? T_CRIT[opts.crop] : undefined
  const heatCells: Cell[] = idx.map((ii) => {
    if (tCrit === undefined) return 'none'
    const m = max(vals('t', ii))
    return m >= tCrit ? 'bad' : m >= tCrit - 2 ? 'fair' : 'good'
  })
  const rainDay = idx.map((ii) => sum(vals('precip', ii)))
  const lodgingCells: Cell[] = idx.map((ii, d) => {
    const g = max(vals('gust', ii))
    const r = rainDay[d] + (d > 0 ? rainDay[d - 1] : 0)
    return g >= 60 && r >= 20 ? 'bad' : g >= 50 ? 'fair' : 'good'
  })
  const floodCells: Cell[] = days.map((d) => (!opts.floodDays ? 'none' : opts.floodDays.has(d) ? 'bad' : 'good'))

  const count = (cells: Cell[]) => cells.filter((c) => c === 'bad').length
  const rows: WindowRow[] = [
    { id: 'spray', label: 'Spraying', cells: sprayCells, notes: idx.map((ii) => `${ii.filter((i) => ok[i]).length} spray-fit hours`) },
    { id: 'sow', label: 'Sowing', cells: sowCells, notes: st.map((v) => (Number.isFinite(v) ? `soil at 6 cm ${v.toFixed(1)} °C` : '')) },
    { id: 'disease', label: 'Disease weather', cells: diseaseCells, notes: days.map(() => (opts.crop === 'potato' ? 'Hutton criteria' : opts.crop && CEREALS.includes(opts.crop) ? 'Fusarium at flowering' : 'leaf wetness 15-25 °C')) },
    { id: 'storm', label: 'Storm and hail', cells: stormCells, notes: idx.map((ii) => `CAPE up to ${Math.round(max(vals('cape', ii)) || 0)} J/kg`) },
    { id: 'frost', label: 'Frost', cells: frostCells, notes: idx.map((ii) => `low ${min(vals('t', ii)).toFixed(0)} °C`) },
    { id: 'heat', label: 'Heat stress', cells: heatCells, notes: idx.map((ii) => `high ${max(vals('t', ii)).toFixed(0)} °C`) },
    { id: 'lodging', label: 'Lodging', cells: lodgingCells, notes: idx.map((ii, d) => `gusts ${Math.round(max(vals('gust', ii)) || 0)} km/h, ${Math.round(rainDay[d])} mm`) },
    { id: 'flood', label: 'River flood', cells: floodCells, notes: days.map(() => 'GloFAS above its 1-in-20 flow') },
  ]
  return {
    grid: { days, rows },
    sprayHours7,
    nextSpray,
    sowDate,
    diseaseDays: count(diseaseCells),
    stormDays: count(stormCells),
    frostDays: count(frostCells),
    heatDays: count(heatCells),
    lodgingDays: count(lodgingCells),
  }
}
