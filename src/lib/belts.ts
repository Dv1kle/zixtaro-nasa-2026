// Crop belts on the globe: the crop-water model run for every NASA POWER cell of a farming region
// (pre-baked by scripts/belts.mjs), turned into a picture MapLibre can drape over the globe, plus the
// numbers that say how far each crop's climate belt moved.

import type { CropId } from './crops'

export type BeltRegion = {
  region: string
  label: string
  lat0: number
  lon0: number
  dlat: number
  dlon: number
  rows: number
  cols: number
  periods: { baseline: [number, number]; recent: [number, number] }
  soil: string
  source: string
  scoring: string
  crops: Partial<Record<CropId, { base: string; recent: string }>>
}

export type BeltView = 'change' | 'baseline' | 'recent'

export const BELT_REGIONS: Record<string, { label: string; lat: [number, number]; lon: [number, number] }> = {
  europe: { label: 'Europe & the Black Sea steppe', lat: [36, 60], lon: [-10, 50] },
  plains: { label: 'North American Plains & Corn Belt', lat: [28, 52], lon: [-110, -80] },
  pampas: { label: 'Argentine Pampas', lat: [-42, -22], lon: [-70, -54] },
}

/** The region holding the field, or the closest one. */
export function regionFor(lat: number, lon: number): string {
  let best = 'europe'
  let bestD = Infinity
  for (const [id, r] of Object.entries(BELT_REGIONS)) {
    const inside = lat >= r.lat[0] && lat <= r.lat[1] && lon >= r.lon[0] && lon <= r.lon[1]
    if (inside) return id
    const d = Math.hypot(lat - (r.lat[0] + r.lat[1]) / 2, lon - (r.lon[0] + r.lon[1]) / 2)
    if (d < bestD) {
      bestD = d
      best = id
    }
  }
  return best
}

const cache = new Map<string, Promise<BeltRegion | null>>()
export function loadRegion(id: string): Promise<BeltRegion | null> {
  let p = cache.get(id)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/belts/${id}.json`).then((r) => (r.ok ? (r.json() as Promise<BeltRegion>) : null)).catch(() => null)
    cache.set(id, p)
  }
  return p
}

const decoded = new Map<string, Uint8Array>()
function grid(r: BeltRegion, crop: CropId, which: 'base' | 'recent'): Uint8Array | null {
  const key = `${r.region}|${crop}|${which}`
  let g = decoded.get(key)
  if (!g) {
    const b64 = r.crops[crop]?.[which]
    if (!b64) return null
    const bin = atob(b64)
    g = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) g[i] = bin.charCodeAt(i)
    decoded.set(key, g)
  }
  return g
}

export const SUITABLE = 50

export type BeltStats = {
  cellsBase: number
  cellsRecent: number
  areaChange: number // relative change of suitable cells
  edgeShiftKm: number | null // poleward edge, + = poleward
  gained: number
  lost: number
}

export type BeltOverlay = {
  url: string
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  lines: GeoJSON.FeatureCollection
  stats: BeltStats
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const latOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90

/** Poleward edge of the suitable belt, column by column (lightly smoothed). */
function edge(r: BeltRegion, g: Uint8Array, south: boolean): (number | null)[] {
  const out: (number | null)[] = []
  for (let c = 0; c < r.cols; c++) {
    let best: number | null = null
    for (let row = 0; row < r.rows; row++) {
      const v = g[row * r.cols + c]
      if (v === 255 || v < SUITABLE) continue
      const lat = r.lat0 + row * r.dlat
      if (best === null || (south ? lat < best : lat > best)) best = lat
    }
    out.push(best)
  }
  // 5-column running median against single-cell islands
  return out.map((_, i) => {
    const w = out.slice(Math.max(0, i - 2), i + 3).filter((x): x is number => x !== null).sort((a, b) => a - b)
    return out[i] === null || w.length < 3 ? null : w[Math.floor(w.length / 2)]
  })
}

function lineOf(r: BeltRegion, e: (number | null)[], period: string): GeoJSON.Feature[] {
  const feats: GeoJSON.Feature[] = []
  let run: [number, number][] = []
  e.forEach((lat, c) => {
    if (lat === null) {
      if (run.length > 1) feats.push({ type: 'Feature', properties: { period }, geometry: { type: 'LineString', coordinates: run } })
      run = []
      return
    }
    run.push([r.lon0 + c * r.dlon, lat + (lat >= 0 ? r.dlat / 2 : -r.dlat / 2)])
  })
  if (run.length > 1) feats.push({ type: 'Feature', properties: { period }, geometry: { type: 'LineString', coordinates: run } })
  return feats
}

const LEAF: [number, number, number] = [184, 245, 107]
const WHEAT: [number, number, number] = [244, 205, 106]
const HEAT: [number, number, number] = [255, 123, 84]

/** A Web-Mercator picture of the grid (MapLibre drapes image sources linearly in Mercator space). */
export function beltOverlay(r: BeltRegion, crop: CropId, view: BeltView): BeltOverlay | null {
  const base = grid(r, crop, 'base')
  const recent = grid(r, crop, 'recent')
  if (!base || !recent) return null
  const south = r.lat0 + (r.rows * r.dlat) / 2 < 0
  const top = r.lat0 + (r.rows - 0.5) * r.dlat
  const bottom = r.lat0 - 0.5 * r.dlat
  const west = r.lon0 - r.dlon / 2
  const east = r.lon0 + (r.cols - 0.5) * r.dlon
  const W = r.cols
  const H = Math.round(r.rows * 1.6)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const y0 = mercY(top)
  const y1 = mercY(bottom)
  let gained = 0
  let lost = 0
  let cb = 0
  let cr = 0
  for (let i = 0; i < base.length; i++) {
    if (base[i] !== 255 && base[i] >= SUITABLE) cb++
    if (recent[i] !== 255 && recent[i] >= SUITABLE) cr++
    if (base[i] !== 255 && recent[i] !== 255) {
      if (base[i] < SUITABLE && recent[i] >= SUITABLE) gained++
      if (base[i] >= SUITABLE && recent[i] < SUITABLE) lost++
    }
  }
  for (let y = 0; y < H; y++) {
    const lat = latOf(y0 + ((y + 0.5) / H) * (y1 - y0))
    const row = Math.round((lat - r.lat0) / r.dlat)
    if (row < 0 || row >= r.rows) continue
    for (let x = 0; x < W; x++) {
      const i = row * r.cols + x
      const b = base[i]
      const n = recent[i]
      const o = (y * W + x) * 4
      if (b === 255 || n === 255) continue
      let rgb: [number, number, number] | null = null
      let a = 0
      if (view === 'change') {
        if (b < SUITABLE && n >= SUITABLE) (rgb = LEAF), (a = 225)
        else if (b >= SUITABLE && n < SUITABLE) (rgb = HEAT), (a = 225)
        else if (b >= SUITABLE && n >= SUITABLE) (rgb = WHEAT), (a = 150)
      } else {
        const v = view === 'baseline' ? b : n
        const t = v / 100
        rgb = v >= SUITABLE ? mixRgb(WHEAT, LEAF, (t - 0.5) * 2) : mixRgb(HEAT, WHEAT, t * 2)
        a = Math.round(40 + 190 * Math.min(1, t * 1.15))
      }
      if (!rgb) continue
      img.data[o] = rgb[0]
      img.data[o + 1] = rgb[1]
      img.data[o + 2] = rgb[2]
      img.data[o + 3] = a
    }
  }
  ctx.putImageData(img, 0, 0)
  const eb = edge(r, base, south)
  const er = edge(r, recent, south)
  const pairs = eb.map((v, i) => (v !== null && er[i] !== null ? (er[i]! - v) * (south ? -1 : 1) : null)).filter((x): x is number => x !== null)
  const shift = pairs.length >= 5 ? (pairs.reduce((a, b) => a + b, 0) / pairs.length) * 111 : null
  return {
    url: canvas.toDataURL('image/png'),
    coordinates: [[west, top], [east, top], [east, bottom], [west, bottom]],
    lines: { type: 'FeatureCollection', features: [...lineOf(r, eb, 'baseline'), ...lineOf(r, er, 'recent')] },
    stats: { cellsBase: cb, cellsRecent: cr, areaChange: cb ? cr / cb - 1 : 0, edgeShiftKm: shift, gained, lost },
  }
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const k = Math.max(0, Math.min(1, t))
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)]
}

/** Crops worth showing on the map, most telling first. */
export const BELT_CROPS: CropId[] = ['maize', 'sunflower', 'soybean', 'sorghum', 'wheat', 'rapeseed', 'millet', 'sugarbeet', 'potato', 'barley']
