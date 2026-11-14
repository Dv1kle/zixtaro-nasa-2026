// NASA GRACE / GRACE-FO: how much water the region around a field has gained or lost since 2002 - soil,
// groundwater, snow and lakes together, weighed from orbit. Pre-baked by scripts/grace.py from the CSR
// RL06.3 mascons: a 1° trend grid for anywhere on Earth, and full monthly series for the demo fields.

export type GraceSeries = {
  id: string
  lat: number
  lon: number
  source: string
  note: string
  months: string[] // YYYY-MM
  cm: number[] // water-equivalent thickness anomaly
  trendCmPerYear: number
  p: number
  change: { from: number; to: number; cm: number }
}

export type GraceHere = {
  trendCmPerYear: number
  change: { from: number; to: number; cm: number }
  p: number | null // only with a full series
  series: GraceSeries | null
}

type Grid = { rows: number; cols: number; lat0: number; lon0: number; d: number; trendMmPerYear: string; changeCm: string; change: { from: number; to: number } }

const base = () => `${import.meta.env.BASE_URL}data/grace/`
let gridPromise: Promise<{ g: Grid; trend: Int16Array; change: Int16Array } | null> | null = null
let indexPromise: Promise<string[]> | null = null
const series = new Map<string, Promise<GraceSeries | null>>()

const int16 = (b64: string) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Int16Array(bytes.buffer)
}

export async function graceFor(lat: number, lon: number, presetId: string | null): Promise<GraceHere | null> {
  gridPromise ??= fetch(`${base()}grid.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Grid>) : null))
    .then((g) => (g ? { g, trend: int16(g.trendMmPerYear), change: int16(g.changeCm) } : null))
    .catch(() => null)
  indexPromise ??= fetch(`${base()}index.json`).then((r) => (r.ok ? r.json() : { ids: [] })).then((d: { ids: string[] }) => d.ids).catch(() => [])
  const [grid, ids] = await Promise.all([gridPromise, indexPromise])
  let s: GraceSeries | null = null
  if (presetId && ids.includes(presetId)) {
    let p = series.get(presetId)
    if (!p) {
      p = fetch(`${base()}${presetId}.json`).then((r) => (r.ok ? (r.json() as Promise<GraceSeries>) : null)).catch(() => null)
      series.set(presetId, p)
    }
    s = await p
  }
  if (s) return { trendCmPerYear: s.trendCmPerYear, change: s.change, p: s.p, series: s }
  if (!grid) return null
  const row = Math.floor((grid.g.lat0 + 0.5 - lat) / grid.g.d)
  const col = Math.floor((lon - (grid.g.lon0 - 0.5)) / grid.g.d)
  const i = row * grid.g.cols + col
  const t = grid.trend[i]
  const c = grid.change[i]
  if (t === undefined || t === -32768 || c === -32768) return null
  return { trendCmPerYear: t / 100, change: { ...grid.g.change, cm: c / 10 }, p: null, series: null }
}
